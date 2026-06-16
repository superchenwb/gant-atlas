/**
 * Federation query layer.
 *
 * Design decision: keep each project in its own SQLite file (physical isolation),
 * but allow cross-project analysis by attaching multiple stores in memory and
 * aggregating results at the application layer.
 *
 * This is intentionally lightweight. It does not try to execute cross-database
 * SQL joins; instead it runs per-database queries and merges the results in
 * memory. That keeps the storage layer simple and avoids SQLite attach-database
 * quirks (different WAL states, schema versions, etc.).
 */

import { createStore, type Store } from '../store/sqlite.js';
import type { GraphNode } from '../types/graph.js';

export interface FederationOptions {
  /** Map of project name -> SQLite database path. */
  projects: Record<string, string>;
}

export interface FederatedPageResult {
  project: string;
  node: GraphNode;
}

export interface FederatedApiResult {
  project: string;
  apis: GraphNode[];
}

export class FederationQuery {
  private readonly projects: Record<string, string>;
  private stores = new Map<string, Store>();

  constructor(options: FederationOptions) {
    this.projects = { ...options.projects };
  }

  /**
   * Open all configured project stores.
   */
  init(): void {
    for (const [name, dbPath] of Object.entries(this.projects)) {
      if (!this.stores.has(name)) {
        this.stores.set(name, createStore(dbPath));
      }
    }
  }

  /**
   * Search pages across all projects by keyword.
   */
  searchPages(keyword: string): FederatedPageResult[] {
    const results: FederatedPageResult[] = [];
    for (const [project, store] of this.stores) {
      const pages = store.searchNodes(keyword).filter((n) => n.type === 'page');
      for (const node of pages) {
        results.push({ project, node });
      }
    }
    return results;
  }

  /**
   * Find dead APIs (no incoming references) across all projects.
   */
  findDeadApis(): FederatedApiResult[] {
    const results: FederatedApiResult[] = [];
    for (const [project, store] of this.stores) {
      const apis = store.findDeadApis();
      if (apis.length > 0) {
        results.push({ project, apis });
      }
    }
    return results;
  }

  /**
   * List all projects currently attached.
   */
  listProjects(): string[] {
    return Array.from(this.stores.keys());
  }

  /**
   * Close all attached stores.
   */
  close(): void {
    for (const store of this.stores.values()) {
      store.close();
    }
    this.stores.clear();
  }
}
