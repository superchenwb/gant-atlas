import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore, migrate, migrations } from '../../src/store/sqlite.js';
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
    store.db.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('initializes schema', () => {
    const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('pages');
    expect(names).toContain('fields');
    expect(names).toContain('grid_columns');
    expect(names).toContain('buttons');
    expect(names).toContain('apis');
  });

  it('inserts and retrieves a page', () => {
    const page = {
      id: 'test/page',
      module: 'test',
      pageName: 'page',
      pageTitle: 'Test Page',
      pageType: 'list',
      route: '/test',
      pageFunction: 'Testing',
    };

    store.insertPage(page);
    const spec = store.getPageSpec('test/page');
    expect(spec.page).toEqual(page);
  });

  it('searches pages by keyword', () => {
    store.insertPage({
      id: 'mod/a',
      module: 'mod',
      pageName: 'a',
      pageTitle: 'Alpha',
    });
    store.insertPage({
      id: 'mod/b',
      module: 'mod',
      pageName: 'b',
      pageTitle: 'Beta',
    });

    const results = store.searchPages('Alpha');
    expect(results.length).toBe(1);
    expect(results[0].pageTitle).toBe('Alpha');
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
    expect(names).toContain('pages');
    expect(names).toContain('fields');
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

  it('applies only pending migrations', () => {
    const db = new Database(dbPath);

    // Seed as version 1 already applied
    db.exec(`CREATE TABLE __version (key TEXT PRIMARY KEY, version INTEGER NOT NULL)`);
    db.prepare("INSERT INTO __version (key, version) VALUES ('schema', 1)").run();

    // Manually create v1 tables so migration 1 can be skipped
    db.exec(`CREATE TABLE pages (id TEXT PRIMARY KEY)`);

    // Run migrations targeting v2
    const finalVersion = migrate(db, 2, migrations);
    expect(finalVersion).toBe(2);
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
