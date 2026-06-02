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
    store.insertPage({ id: 'mod/page', module: 'mod', pageName: 'page', pageTitle: 'Page' });
    store.insertField({ id: 'f1', pageId: 'mod/page', fieldLabel: 'Field', fieldName: 'field', componentType: 'Input', required: false });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns page spec when found', async () => {
    const result = await handleGetPageSpec(store, { pageId: 'mod/page' });
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.page.pageTitle).toBe('Page');
    expect(parsed.fields).toHaveLength(1);
  });

  it('returns not-found message when missing', async () => {
    const result = await handleGetPageSpec(store, { pageId: 'mod/missing' });
    expect(result.content[0].text).toContain('不存在');
  });
});
