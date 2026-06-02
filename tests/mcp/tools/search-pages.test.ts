import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleSearchPages } from '../../../src/mcp/tools/search-pages.js';
import { createStore } from '../../../src/store/sqlite.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('handleSearchPages', () => {
  const dbPath = join(process.cwd(), 'tests', 'search-test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);
    store.insertPage({ id: 'mod/a', module: 'mod', pageName: 'a', pageTitle: 'Alpha' });
    store.insertPage({ id: 'mod/b', module: 'mod', pageName: 'b', pageTitle: 'Beta' });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('searches pages by keyword', async () => {
    const result = await handleSearchPages(store, { keyword: 'Alpha' });
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.total).toBe(1);
    expect(parsed.results[0].pageTitle).toBe('Alpha');
  });

  it('filters by module when provided', async () => {
    const result = await handleSearchPages(store, { keyword: '', module: 'mod' });
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.total).toBe(2);
  });
});
