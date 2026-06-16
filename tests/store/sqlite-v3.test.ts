import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore, migrate, type Migration } from '../../src/store/sqlite.js';
import { join } from 'path';
import { rmSync } from 'fs';
import Database from 'better-sqlite3';

describe('SQLite Store v3 (unified graph)', () => {
  const dbPath = join(process.cwd(), 'tests', 'test-v3.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('inserts and retrieves a node', () => {
    const node = {
      id: 'page:test/page',
      type: 'page' as const,
      name: 'test-page',
      title: 'Test Page',
      summary: 'A test page',
      tags: ['test'],
      meta: { route: '/test' },
    };

    store.insertNode(node);
    const nodes = store.listAllNodes();

    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('page:test/page');
    expect(nodes[0].name).toBe('test-page');
    expect(nodes[0].meta).toEqual({ route: '/test' });
  });

  it('inserts and retrieves an edge', () => {
    const edge = {
      source: 'page:test/page',
      target: 'field:test/page/field/0',
      type: 'contains' as const,
    };

    store.insertEdge(edge);
    const edges = store.listEdges();

    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe('page:test/page');
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

  it('searches nodes by keyword', () => {
    store.insertNode({ id: 'page:search-target', type: 'page', name: 'target', title: 'Target Page', summary: '', tags: [] });
    store.insertNode({ id: 'page:other', type: 'page', name: 'other', title: 'Other', summary: '', tags: [] });

    const results = store.searchNodes('target');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('target');
  });

  it('deletes a node and its edges', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'P1', summary: '', tags: [] });
    store.insertEdge({ source: 'page:p1', target: 'field:f1', type: 'contains' });

    store.deleteNode('page:p1');

    expect(store.listAllNodes().length).toBe(0);
    expect(store.listEdges().length).toBe(0);
  });

  it('updates existing node on conflict', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'P1', summary: '', tags: [] });
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1-updated', title: 'P1 Updated', summary: '', tags: [] });

    const nodes = store.listAllNodes();
    expect(nodes[0].name).toBe('p1-updated');
  });

  it('records migration history', () => {
    const db = new Database(dbPath);
    const rows = db.prepare('SELECT version, name FROM __migrations ORDER BY version').all() as Array<{
      version: number;
      name: string;
    }>;
    db.close();

    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0].version).toBe(1);
    expect(rows[0].name).toBe('unified_graph');
    expect(rows[rows.length - 1].version).toBe(3);
  });

  it('supports downgrade migrations', () => {
    const migrateDbPath = join(process.cwd(), 'tests', 'test-migrate.db');
    const db = new Database(migrateDbPath);

    const testMigrations: Migration[] = [
      {
        version: 1,
        name: 'test_create_table',
        up(db) {
          db.exec('CREATE TABLE IF NOT EXISTS test_table (id TEXT PRIMARY KEY)');
        },
        down(db) {
          db.exec('DROP TABLE IF EXISTS test_table');
        },
      },
      {
        version: 2,
        name: 'test_add_column',
        up(db) {
          db.exec('ALTER TABLE test_table ADD COLUMN value TEXT');
        },
        down(db) {
          // SQLite does not support DROP COLUMN directly; recreate table.
          db.exec(`
            CREATE TABLE test_table_new (id TEXT PRIMARY KEY);
            INSERT INTO test_table_new(id) SELECT id FROM test_table;
            DROP TABLE test_table;
            ALTER TABLE test_table_new RENAME TO test_table;
          `);
        },
      },
    ];

    migrate(db, 2, testMigrations);
    expect(
      db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('test_table') WHERE name = 'value'").get() as { c: number }
    ).toEqual({ c: 1 });

    migrate(db, 1, testMigrations);
    expect(
      db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('test_table') WHERE name = 'value'").get() as { c: number }
    ).toEqual({ c: 0 });

    db.close();

    try { rmSync(migrateDbPath); } catch { /* ignore */ }
  });
});
