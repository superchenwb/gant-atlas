import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore, migrate, getStoreDatabase } from '../../src/store/sqlite.js';
import Database from 'better-sqlite3';
import { join } from 'path';
import { rmSync } from 'fs';

describe('SQLite Store', () => {
  const dbPath = join(process.cwd(), 'tests', 'test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('initializes schema with nodes and edges tables', () => {
    const tables = getStoreDatabase(store).prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('nodes');
    expect(names).toContain('edges');
  });

  it('inserts and retrieves a node', () => {
    const node = {
      id: 'page:test/page',
      type: 'page' as const,
      name: 'page',
      title: 'Test Page',
      summary: 'Testing',
      tags: ['list'],
      module: 'test',
      meta: { route: '/test' },
    };

    store.insertNode(node);
    const retrieved = store.getNodeById('page:test/page');
    expect(retrieved).toEqual(node);
  });

  it('searches nodes by keyword', () => {
    store.insertNode({ id: 'page:mod/a', type: 'page', name: 'a', title: 'Alpha', summary: '', tags: [] });
    store.insertNode({ id: 'page:mod/b', type: 'page', name: 'b', title: 'Beta', summary: '', tags: [] });

    const results = store.searchNodes('Alpha');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Alpha');
  });

  it('inserts node with content hash', () => {
    store.insertNode({
      id: 'page:test/hash',
      type: 'page',
      name: 'hash',
      title: 'Hash',
      summary: '',
      tags: [],
      contentHash: 'abc123',
    });
    const node = store.getNodeById('page:test/hash');
    expect(node?.contentHash).toBe('abc123');
  });

  it('deletes node and cascades edges', () => {
    store.insertNode({ id: 'page:del/page', type: 'page', name: 'page', title: 'Del', summary: '', tags: [] });
    store.insertNode({ id: 'field:del/page/f1', type: 'field', name: 'f1', title: 'F', summary: '', tags: [] });
    store.insertEdge({ source: 'page:del/page', target: 'field:del/page/f1', type: 'contains' });

    store.deleteNode('page:del/page');
    expect(store.getNodeById('page:del/page')).toBeNull();
    expect(store.listEdges().length).toBe(0);
  });

  it('clears all project data', () => {
    store.insertNode({ id: 'page:clr/a', type: 'page', name: 'a', title: 'A', summary: '', tags: [] });
    store.insertNode({ id: 'api:api/x', type: 'api', name: 'x', title: 'x', summary: '', tags: [] });
    store.insertEdge({ source: 'page:clr/a', target: 'api:api/x', type: 'calls' });

    store.clearProject();

    const nodes = getStoreDatabase(store).prepare('SELECT COUNT(*) as c FROM nodes').get() as { c: number };
    expect(nodes.c).toBe(0);
    const edges = getStoreDatabase(store).prepare('SELECT COUNT(*) as c FROM edges').get() as { c: number };
    expect(edges.c).toBe(0);
  });

  it('inserts and retrieves edges', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'P1', summary: '', tags: [] });
    store.insertNode({ id: 'field:p1/f1', type: 'field', name: 'f1', title: 'F1', summary: '', tags: [] });
    store.insertEdge({ source: 'page:p1', target: 'field:p1/f1', type: 'contains' });

    const edges = store.listEdges();
    expect(edges.length).toBe(1);
    expect(edges[0].type).toBe('contains');
  });

  it('filters nodes by type', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'P1', summary: '', tags: [] });
    store.insertNode({ id: 'field:f1', type: 'field', name: 'f1', title: 'F1', summary: '', tags: [] });
    store.insertNode({ id: 'api:a1', type: 'api', name: 'a1', title: 'A1', summary: '', tags: [] });

    expect(store.listNodesByType('page').length).toBe(1);
    expect(store.listNodesByType('field').length).toBe(1);
    expect(store.listNodesByType('api').length).toBe(1);
  });

  it('returns empty for missing node', () => {
    const node = store.getNodeById('nonexistent');
    expect(node).toBeNull();
  });

  describe('FTS5 search', () => {
    it('has FTS5 availability check', () => {
      expect(typeof store.isFTS5Available()).toBe('boolean');
    });

    it('searches nodes via FTS5 or fallback', () => {
      store.insertNode({ id: 'page:fts/a', type: 'page', name: 'a', title: 'FTS Alpha', summary: 'searchable content', tags: [] });
      store.insertNode({ id: 'page:fts/b', type: 'page', name: 'b', title: 'FTS Beta', summary: 'another content', tags: [] });

      const results = store.searchNodesFTS('Alpha');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.title === 'FTS Alpha')).toBe(true);
    });
  });

  describe('call graph', () => {
    it('returns nodes and edges for a given node', () => {
      store.insertNode({ id: 'page:cg/a', type: 'page', name: 'a', title: 'A', summary: '', tags: [] });
      store.insertNode({ id: 'api:cg/x', type: 'api', name: 'x', title: 'X', summary: '', tags: [] });
      store.insertEdge({ source: 'page:cg/a', target: 'api:cg/x', type: 'calls' });

      const graph = store.getCallGraph('page:cg/a', 2);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
      expect(graph.edges.length).toBe(1);
    });

    it('limits depth for call graph', () => {
      store.insertNode({ id: 'page:cg/a', type: 'page', name: 'a', title: 'A', summary: '', tags: [] });
      store.insertNode({ id: 'api:cg/x', type: 'api', name: 'x', title: 'X', summary: '', tags: [] });
      store.insertNode({ id: 'api:cg/y', type: 'api', name: 'y', title: 'Y', summary: '', tags: [] });
      store.insertEdge({ source: 'page:cg/a', target: 'api:cg/x', type: 'calls' });
      store.insertEdge({ source: 'api:cg/x', target: 'api:cg/y', type: 'calls' });

      const shallow = store.getCallGraph('page:cg/a', 1);
      const deep = store.getCallGraph('page:cg/a', 2);

      expect(deep.nodes.length).toBeGreaterThanOrEqual(shallow.nodes.length);
    });
  });

  describe('dead code detection', () => {
    it('finds APIs with no incoming edges', () => {
      store.insertNode({ id: 'api:dead/x', type: 'api', name: 'x', title: 'X', summary: '', tags: [] });
      store.insertNode({ id: 'api:dead/y', type: 'api', name: 'y', title: 'Y', summary: '', tags: [] });
      store.insertNode({ id: 'page:dead/p', type: 'page', name: 'p', title: 'P', summary: '', tags: [] });
      store.insertEdge({ source: 'page:dead/p', target: 'api:dead/x', type: 'calls' });

      const dead = store.findDeadApis();
      expect(dead.length).toBe(1);
      expect(dead[0].name).toBe('y');
    });

    it('finds orphan fields with no containing page', () => {
      store.insertNode({ id: 'field:orphan/a', type: 'field', name: 'a', title: 'A', summary: '', tags: [] });
      store.insertNode({ id: 'field:orphan/b', type: 'field', name: 'b', title: 'B', summary: '', tags: [] });
      store.insertNode({ id: 'page:orphan/p', type: 'page', name: 'p', title: 'P', summary: '', tags: [] });
      store.insertEdge({ source: 'page:orphan/p', target: 'field:orphan/a', type: 'contains' });

      const orphans = store.findOrphanFields();
      expect(orphans.length).toBe(1);
      expect(orphans[0].name).toBe('b');
    });
  });
});

describe('Schema Migration', () => {
  const dbPath = join(process.cwd(), 'tests', 'migration-test.db');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('runs all migrations on fresh database', () => {
    const db = new Database(dbPath);
    const finalVersion = migrate(db);

    expect(finalVersion).toBeGreaterThanOrEqual(1);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('nodes');
    expect(names).toContain('edges');
    db.close();
  });

  it('is idempotent — running twice does not error', () => {
    const db = new Database(dbPath);
    migrate(db);
    migrate(db);

    const versionRow = db.prepare("SELECT version FROM __version WHERE key = 'schema'").get() as
      | { version: number }
      | undefined;
    expect(versionRow?.version).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it('supports custom migration list', () => {
    const db = new Database(dbPath);

    let called = false;
    const customMigrations = [
      {
        version: 1,
        name: 'custom_test',
        up() {
          called = true;
        },
      },
    ];

    migrate(db, 1, customMigrations);
    db.close();

    expect(called).toBe(true);
  });
});
