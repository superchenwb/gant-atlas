/**
 * Sync diff generator.
 *
 * Compares two Markdown feature-doc skeletons (old vs new) and produces a
 * structured diff that can be reviewed by a human or an LLM.
 *
 * Design choices:
 * - Deterministic, rule-based comparison at the table-row level.
 * - Each row is keyed by a stable identifier (parameter/field/button name).
 * - Changes are categorized as added / removed / modified / unchanged.
 * - The output is intentionally coarse-grained: semantic interpretation
 *   (e.g. "this column rename affects the export API") is delegated to
 *   `llm-diff.ts`.
 */

import type { GeneratedSkeleton } from '../generator.js';
import { parseMarkdown, type ParsedTable } from '../parser/markdown.js';

export type DiffOperation = 'added' | 'removed' | 'modified' | 'unchanged';
export type EntityKind = 'field' | 'column' | 'button' | 'api' | 'metadata' | 'unknown';

export interface StructuredChange {
  /** Entity category for grouping and filtering. */
  kind: EntityKind;
  /** Structural operation. */
  operation: DiffOperation;
  /** Stable row identifier (field name, column name, button name, etc.). */
  name: string;
  /** Old row values when available. */
  oldValue?: Record<string, string>;
  /** New row values when available. */
  newValue?: Record<string, string>;
  /** Human-readable one-line description. */
  description: string;
}

export interface FileDiff {
  /** File name inside the page directory, e.g. `search-area.md`. */
  fileName: string;
  /** Top-level status of the whole file. */
  status: DiffOperation;
  /** Previous Markdown content. */
  oldContent: string;
  /** Proposed Markdown content. */
  newContent: string;
  /** Structured changes detected inside the file. */
  structuredChanges: StructuredChange[];
}

export interface SyncDiff {
  /** Page identifier, e.g. `ibom/dataAuthGroup`. */
  pageId: string;
  /** Per-file diffs for the page skeleton. */
  fileDiffs: FileDiff[];
  /** True if any file is not unchanged. */
  hasChanges: boolean;
}

const SKELETON_FILE_MAP: Array<{
  key: keyof GeneratedSkeleton;
  fileName: string;
}> = [
  { key: 'mainMd', fileName: 'main.md' },
  { key: 'searchAreaMd', fileName: 'search-area.md' },
  { key: 'gridAreaMd', fileName: 'grid-area.md' },
  { key: 'buttonAreaMd', fileName: 'button-area.md' },
  { key: 'apiAreaMd', fileName: 'api-area.md' },
];

/**
 * Compare two generated page skeletons and return a structured sync diff.
 */
export function diffSkeletons(
  pageId: string,
  oldSkeleton: GeneratedSkeleton,
  newSkeleton: GeneratedSkeleton
): SyncDiff {
  const fileDiffs: FileDiff[] = SKELETON_FILE_MAP.map(({ key, fileName }) =>
    diffMarkdown(fileName, oldSkeleton[key] ?? '', newSkeleton[key] ?? '')
  );

  const hasChanges = fileDiffs.some((f) => f.status !== 'unchanged');
  return { pageId, fileDiffs, hasChanges };
}

/**
 * Compare two Markdown strings and return a structured file diff.
 */
export function diffMarkdown(fileName: string, oldMd: string, newMd: string): FileDiff {
  if (oldMd === newMd) {
    return {
      fileName,
      status: 'unchanged',
      oldContent: oldMd,
      newContent: newMd,
      structuredChanges: [],
    };
  }

  const status: DiffOperation = !oldMd
    ? 'added'
    : !newMd
      ? 'removed'
      : 'modified';

  const oldParsed = oldMd ? parseMarkdown(oldMd) : null;
  const newParsed = newMd ? parseMarkdown(newMd) : null;

  const structuredChanges = diffTables(
    fileName,
    oldParsed?.tables ?? [],
    newParsed?.tables ?? []
  );

  return {
    fileName,
    status,
    oldContent: oldMd,
    newContent: newMd,
    structuredChanges,
  };
}

function inferKind(fileName: string): EntityKind {
  const base = fileName.toLowerCase().replace(/\.md$/, '');
  if (base === 'search-area' || base === 'searcharea') return 'field';
  if (base === 'grid-area' || base === 'gridarea') return 'column';
  if (base === 'button-area' || base === 'buttonarea') return 'button';
  if (base === 'api-area' || base === 'apiarea') return 'api';
  if (base === 'main') return 'metadata';
  return 'unknown';
}

function extractRowName(fileName: string, row: Record<string, string>): string {
  const base = fileName.toLowerCase().replace(/\.md$/, '');

  // main.md uses key-value tables where the first column is "属性".
  if (base === 'main') {
    return row['属性'] ?? row['属性名'] ?? '未知';
  }

  // search-area: prefer 参数名, fallback to 字段名.
  if (base === 'search-area' || base === 'searcharea') {
    return row['参数名'] ?? row['字段名'] ?? '未知';
  }

  // grid-area: prefer 字段名.
  if (base === 'grid-area' || base === 'gridarea') {
    return row['字段名'] ?? '未知';
  }

  // button-area: prefer 按钮名称.
  if (base === 'button-area' || base === 'buttonarea') {
    return row['按钮名称'] ?? '未知';
  }

  // api-area: prefer API 名称 or camelCase+Api identifier.
  if (base === 'api-area' || base === 'apiarea') {
    return row['API 名称'] ?? row['接口名称'] ?? row['名称'] ?? '未知';
  }

  return row[Object.keys(row)[0] ?? ''] ?? '未知';
}

function rowsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? '').trim() !== (b[key] ?? '').trim()) {
      return false;
    }
  }
  return true;
}

function diffTables(
  fileName: string,
  oldTables: ParsedTable[],
  newTables: ParsedTable[]
): StructuredChange[] {
  const kind = inferKind(fileName);
  const oldTable = oldTables[0];
  const newTable = newTables[0];

  if (!oldTable && !newTable) return [];

  if (!oldTable && newTable) {
    return newTable.rows.map((row) => ({
      kind,
      operation: 'added' as const,
      name: extractRowName(fileName, row),
      newValue: row,
      description: `新增 ${extractRowName(fileName, row)}`,
    }));
  }

  if (oldTable && !newTable) {
    return oldTable.rows.map((row) => ({
      kind,
      operation: 'removed' as const,
      name: extractRowName(fileName, row),
      oldValue: row,
      description: `删除 ${extractRowName(fileName, row)}`,
    }));
  }

  const oldRows = new Map(oldTable.rows.map((r) => [extractRowName(fileName, r), r]));
  const newRows = new Map(newTable.rows.map((r) => [extractRowName(fileName, r), r]));

  const changes: StructuredChange[] = [];

  // Detect added / modified rows in the new version.
  for (const [name, newRow] of newRows) {
    const oldRow = oldRows.get(name);
    if (!oldRow) {
      changes.push({
        kind,
        operation: 'added',
        name,
        newValue: newRow,
        description: `新增 ${name}`,
      });
    } else if (!rowsEqual(oldRow, newRow)) {
      changes.push({
        kind,
        operation: 'modified',
        name,
        oldValue: oldRow,
        newValue: newRow,
        description: `修改 ${name}`,
      });
    }
  }

  // Detect removed rows.
  for (const [name, oldRow] of oldRows) {
    if (!newRows.has(name)) {
      changes.push({
        kind,
        operation: 'removed',
        name,
        oldValue: oldRow,
        description: `删除 ${name}`,
      });
    }
  }

  return changes;
}
