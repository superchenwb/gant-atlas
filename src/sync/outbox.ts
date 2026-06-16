/**
 * Sync outbox — durable pending/rejected/applied sync records.
 *
 * Each sync attempt for a page is stored as a JSON file under the configured
 * outbox directory. This keeps sync state durable across skill / CLI runs and
 * gives users a clear audit trail of accepted, rejected, and stale diffs.
 *
 * Storage layout:
 *   <outboxDir>/<pageId--escaped>.json
 *
 * File names escape `/` to `--` so page IDs like `ibom/dataAuthGroup` become
 * safe file names on all platforms.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createStore } from '../store/sqlite.js';
import type { SyncDiff } from './diff.js';

export type SyncRecordStatus = 'pending' | 'rejected' | 'applied';

export interface PendingSyncRecord {
  pageId: string;
  /** ISO 8601 timestamp when the record was first created. */
  createdAt: string;
  /** Current status of the sync record. */
  status: SyncRecordStatus;
  /** Structured diff that was generated. */
  diff: SyncDiff;
  /** Optional human-readable reason for rejection. */
  rejectionReason?: string;
  /** ISO 8601 timestamp when the record was rejected, if applicable. */
  rejectedAt?: string;
  /** ISO 8601 timestamp when the record was applied, if applicable. */
  appliedAt?: string;
}

export interface SyncOutboxOptions {
  /** Directory where sync records are persisted. */
  outboxDir: string;
  /** Optional SQLite db path. When provided, rejected records mark the page stale. */
  dbPath?: string;
}

export class SyncOutbox {
  private readonly outboxDir: string;
  private readonly dbPath?: string;

  constructor(options: SyncOutboxOptions) {
    this.outboxDir = options.outboxDir;
    this.dbPath = options.dbPath;
    this.ensureDir();
  }

  /**
   * Record a new pending sync diff.
   */
  recordPending(pageId: string, diff: SyncDiff): PendingSyncRecord {
    const record: PendingSyncRecord = {
      pageId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      diff,
    };
    this.writeRecord(record);
    return record;
  }

  /**
   * List all records with `pending` status.
   */
  listPending(): PendingSyncRecord[] {
    return this.listAll().filter((r) => r.status === 'pending');
  }

  /**
   * List all records with `rejected` status.
   */
  listRejected(): PendingSyncRecord[] {
    return this.listAll().filter((r) => r.status === 'rejected');
  }

  /**
   * List every sync record in the outbox.
   */
  listAll(): PendingSyncRecord[] {
    if (!existsSync(this.outboxDir)) return [];
    const files = readdirSync(this.outboxDir).filter((f) => f.endsWith('.json'));
    const records: PendingSyncRecord[] = [];
    for (const file of files) {
      const record = this.readRecordFromFile(join(this.outboxDir, file));
      if (record) records.push(record);
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Get a single sync record by page ID.
   */
  getRecord(pageId: string): PendingSyncRecord | null {
    const path = this.recordPath(pageId);
    if (!existsSync(path)) return null;
    return this.readRecordFromFile(path);
  }

  /**
   * Mark a pending record as applied.
   */
  markApplied(pageId: string): PendingSyncRecord | null {
    const record = this.getRecord(pageId);
    if (!record) return null;
    record.status = 'applied';
    record.appliedAt = new Date().toISOString();
    this.writeRecord(record);
    return record;
  }

  /**
   * Mark a pending record as rejected.
   *
   * If a dbPath was configured, the associated page is also marked stale
   * so that `gant-atlas status` surfaces the rejected diff.
   */
  markRejected(pageId: string, reason?: string): PendingSyncRecord | null {
    const record = this.getRecord(pageId);
    if (!record) return null;
    record.status = 'rejected';
    record.rejectedAt = new Date().toISOString();
    if (reason) record.rejectionReason = reason;
    this.writeRecord(record);

    if (this.dbPath) {
      try {
        const store = createStore(this.dbPath);
        store.markNodeStale(`page:${pageId}`, true);
        store.close();
      } catch {
        // Best-effort stale marking; do not fail the reject operation.
      }
    }

    return record;
  }

  /**
   * Remove a record from the outbox.
   */
  clearRecord(pageId: string): void {
    const path = this.recordPath(pageId);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  /**
   * Resolve the outbox directory for a project root.
   */
  static resolveOutboxDir(projectRoot: string): string {
    return join(projectRoot, '.gant-atlas', 'sync-outbox');
  }

  private ensureDir(): void {
    if (!existsSync(this.outboxDir)) {
      mkdirSync(this.outboxDir, { recursive: true });
    }
  }

  private recordPath(pageId: string): string {
    const safeName = pageId.replace(/\//g, '--');
    return join(this.outboxDir, `${safeName}.json`);
  }

  private readRecordFromFile(filePath: string): PendingSyncRecord | null {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as PendingSyncRecord;
    } catch {
      return null;
    }
  }

  private writeRecord(record: PendingSyncRecord): void {
    this.ensureDir();
    writeFileSync(
      this.recordPath(record.pageId),
      JSON.stringify(record, null, 2),
      'utf-8'
    );
  }
}
