import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../../src/store/sqlite.js';
import { handleFindDeadApis } from '../../../src/mcp/tools/find-dead-apis.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('handleFindDeadApis', () => {
  const dbPath = join(process.cwd(), 'tests', 'find-dead-apis-test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);

    // Used API
    store.insertNode({ id: 'api:usedApi', type: 'api', name: 'usedApi', title: 'Used API', summary: '', tags: [] });
    store.insertNode({ id: 'page:mod/page', type: 'page', name: 'page', title: 'Page', summary: '', tags: [] });
    store.insertEdge({ source: 'page:mod/page', target: 'api:usedApi', type: 'calls' });

    // Dead API (no incoming edges)
    store.insertNode({ id: 'api:deadApi', type: 'api', name: 'deadApi', title: 'Dead API', summary: '', tags: [] });

    // Orphan field (no containing page)
    store.insertNode({ id: 'field:mod/orphan', type: 'field', name: 'orphanField', title: 'Orphan', summary: '', tags: [] });

    // Contained field
    store.insertNode({ id: 'field:mod/page/f1', type: 'field', name: 'f1', title: 'F1', summary: '', tags: [] });
    store.insertEdge({ source: 'page:mod/page', target: 'field:mod/page/f1', type: 'contains' });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('finds dead APIs with no incoming edges', async () => {
    const result = await handleFindDeadApis(store, { projectId: 'p1' });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.deadApis.length).toBe(1);
    expect(data.deadApis[0].name).toBe('deadApi');
  });

  it('finds orphan fields with no containing page', async () => {
    const result = await handleFindDeadApis(store, { projectId: 'p1' });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.orphanFields.length).toBe(1);
    expect(data.orphanFields[0].name).toBe('orphanField');
  });

  it('returns summary count', async () => {
    const result = await handleFindDeadApis(store, { projectId: 'p1' });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.summary).toContain('1 个死 API');
    expect(data.summary).toContain('1 个孤儿字段');
  });

  it('returns error for missing projectId', async () => {
    const result = await handleFindDeadApis(store, {});
    expect((result as any).isError).toBe(true);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.error.code).toBe('invalid_input');
  });
});
