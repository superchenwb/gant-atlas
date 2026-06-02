import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore, migrate, migrations, getStoreDatabase } from '../../src/store/sqlite.js';
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

  it('initializes schema', () => {
    const tables = getStoreDatabase(store).prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
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

  it('inserts page with content hash', () => {
    store.insertPage(
      { id: 'test/hash', module: 'test', pageName: 'hash', pageTitle: 'Hash' },
      'abc123'
    );
    const hashes = store.getPageHashes();
    expect(hashes.get('test/hash')).toBe('abc123');
  });

  it('deletes page and cascades entities', () => {
    store.insertPage({ id: 'del/page', module: 'del', pageName: 'page', pageTitle: 'Del' });
    store.insertField({
      id: 'del/page/f1',
      pageId: 'del/page',
      fieldLabel: 'F',
      fieldName: 'f',
      componentType: 'Input',
      required: false,
    });

    store.deletePage('del/page');
    const spec = store.getPageSpec('del/page');
    expect(spec.page).toBeNull();
    expect(spec.fields).toHaveLength(0);
  });

  it('clears all project data', () => {
    store.insertPage({ id: 'clr/a', module: 'clr', pageName: 'a', pageTitle: 'A' });
    store.insertAPI({ id: 'api/x', name: 'xApi' });
    store.insertPageAPI('clr/a', 'api/x');

    store.clearProject();

    const pages = getStoreDatabase(store).prepare('SELECT COUNT(*) as c FROM pages').get() as { c: number };
    expect(pages.c).toBe(0);
    const apis = getStoreDatabase(store).prepare('SELECT COUNT(*) as c FROM apis').get() as { c: number };
    expect(apis.c).toBe(0);
  });

  it('inserts and retrieves grid columns', () => {
    store.insertPage({ id: 'gc/page', module: 'gc', pageName: 'page', pageTitle: 'GC' });
    store.insertGridColumn({
      id: 'gc/page/c1',
      pageId: 'gc/page',
      columnTitle: 'Col',
      fieldName: 'col',
      displayContent: 'Content',
      editable: true,
      width: 120,
      sortable: true,
      dataType: 'string',
      align: 'center',
    });

    const spec = store.getPageSpec('gc/page');
    expect(spec.columns).toHaveLength(1);
    expect(spec.columns[0].columnTitle).toBe('Col');
    expect(spec.columns[0].editable).toBe(true);
    expect(spec.columns[0].width).toBe(120);
    expect(spec.columns[0].sortable).toBe(true);
    expect(spec.columns[0].align).toBe('center');
  });

  it('inserts and retrieves buttons', () => {
    store.insertPage({ id: 'btn/page', module: 'btn', pageName: 'page', pageTitle: 'Btn' });
    store.insertButton({
      id: 'btn/page/b1',
      pageId: 'btn/page',
      buttonName: 'Save',
      scope: 'page',
      position: 'top',
      displayCondition: '',
      disabledCondition: '',
      clickResult: 'save',
      confirmRequired: true,
    });

    const spec = store.getPageSpec('btn/page');
    expect(spec.buttons).toHaveLength(1);
    expect(spec.buttons[0].buttonName).toBe('Save');
    expect(spec.buttons[0].confirmRequired).toBe(true);
  });

  it('inserts APIs and links to pages', () => {
    store.insertPage({ id: 'api/page', module: 'api', pageName: 'page', pageTitle: 'API' });
    store.insertAPI({ id: 'api/findApi', name: 'findApi', description: 'Find' });
    store.insertPageAPI('api/page', 'api/findApi');

    const spec = store.getPageSpec('api/page');
    expect(spec.apis).toHaveLength(1);
    expect(spec.apis[0].name).toBe('findApi');
  });

  it('inserts field calls api relation', () => {
    store.insertPage({ id: 'fapi/page', module: 'fapi', pageName: 'page', pageTitle: 'FAPI' });
    store.insertField({
      id: 'fapi/page/f1',
      pageId: 'fapi/page',
      fieldLabel: 'F',
      fieldName: 'findApi',
      componentType: 'Input',
      required: false,
    });
    store.insertAPI({ id: 'api/findApi', name: 'findApi' });
    store.insertFieldCallsAPI('fapi/page/f1', 'api/findApi');

    // Verify relation exists in join table directly
    const rows = getStoreDatabase(store)
      .prepare("SELECT * FROM field_calls_apis WHERE field_id = ? AND api_id = ?")
      .all('fapi/page/f1', 'api/findApi') as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
  });

  it('returns empty arrays for missing page', () => {
    const spec = store.getPageSpec('nonexistent/page');
    expect(spec.page).toBeNull();
    expect(spec.fields).toEqual([]);
    expect(spec.columns).toEqual([]);
    expect(spec.buttons).toEqual([]);
    expect(spec.apis).toEqual([]);
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
