import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGetPageSpec } from '../../../src/mcp/tools/get-page-spec.js';
import { createStore } from '../../../src/store/sqlite.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('handleGetPageSpec', () => {
  const dbPath = join(process.cwd(), 'tests', 'spec-test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);
    store.insertNode({ id: 'page:mod/page', type: 'page', name: 'page', title: 'Page', summary: '', tags: [] });
    store.insertNode({ id: 'field:mod/page/f1', type: 'field', name: 'field', title: 'Field', summary: '', tags: [] });
    store.insertEdge({ source: 'page:mod/page', target: 'field:mod/page/f1', type: 'contains' });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns page spec when found', async () => {
    const result = await handleGetPageSpec(store, { pageId: 'mod/page' });
    const parsed = JSON.parse(result.content[0].text as string).data;
    expect(parsed.page.title).toBe('Page');
    expect(parsed.relatedNodes.length).toBe(1);
  });

  it('returns not-found message when missing', async () => {
    const result = await handleGetPageSpec(store, { pageId: 'mod/missing' });
    expect(result.content[0].text).toContain('不存在');
  });
});
