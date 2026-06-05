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
    store.insertNode({ id: 'page:mod/a', type: 'page', name: 'a', title: 'Alpha', summary: 'alpha page', tags: [], module: 'mod' });
    store.insertNode({ id: 'page:mod/b', type: 'page', name: 'b', title: 'Beta', summary: 'beta page', tags: [], module: 'mod' });
    store.insertNode({ id: 'page:user/profile', type: 'page', name: 'profile', title: '用户资料', summary: '用户个人信息', tags: [], module: 'user' });
    store.insertNode({ id: 'api:createOrder', type: 'api', name: 'createOrder', title: '创建订单', summary: '', tags: [] });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('searches pages by keyword', async () => {
    const result = await handleSearchPages(store, { projectId: 'p1', keyword: 'Alpha' });
    const parsed = JSON.parse(result.content[0].text as string).data;
    expect(parsed.total).toBeGreaterThanOrEqual(1);
    expect(parsed.results.some((r: { title: string }) => r.title === 'Alpha')).toBe(true);
  });

  it('filters by module when provided', async () => {
    const result = await handleSearchPages(store, { projectId: 'p1', keyword: 'page', module: 'mod' });
    const parsed = JSON.parse(result.content[0].text as string).data;
    expect(parsed.results.every((r: { module?: string }) => r.module === 'mod')).toBe(true);
  });

  it('returns only page type results', async () => {
    const result = await handleSearchPages(store, { projectId: 'p1', keyword: 'createOrder' });
    const parsed = JSON.parse(result.content[0].text as string).data;
    expect(parsed.results.some((r: { type: string }) => r.type === 'api')).toBe(false);
  });

  it('returns error for empty keyword', async () => {
    const result = await handleSearchPages(store, { projectId: 'p1', keyword: '' });
    expect((result as any).isError).toBe(true);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.error.code).toBe('invalid_input');
  });

  it('returns error for missing projectId', async () => {
    const result = await handleSearchPages(store, { keyword: 'test' });
    expect((result as any).isError).toBe(true);
  });

  it('indicates fts availability in response', async () => {
    const result = await handleSearchPages(store, { projectId: 'p1', keyword: 'Alpha' });
    const parsed = JSON.parse(result.content[0].text as string).data;
    expect(typeof parsed.fts).toBe('boolean');
  });
});
