import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../src/store/sqlite.js';
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
