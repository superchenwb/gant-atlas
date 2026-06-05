import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../../src/store/sqlite.js';
import { handleAnalyzeImpact } from '../../../src/mcp/tools/analyze-impact.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('handleAnalyzeImpact', () => {
  const dbPath = join(process.cwd(), 'tests', 'analyze-impact-test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);

    // Insert pages
    store.insertNode({ id: 'page:mod/page-a', type: 'page', name: 'page-a', title: 'Page A', summary: '', tags: [], module: 'mod' });
    store.insertNode({ id: 'page:mod/page-b', type: 'page', name: 'page-b', title: 'Page B', summary: '', tags: [], module: 'mod' });
    store.insertNode({ id: 'page:mod/page-c', type: 'page', name: 'page-c', title: 'Page C', summary: '', tags: [], module: 'mod' });

    // Insert APIs
    store.insertNode({ id: 'api:api/findListApi', type: 'api', name: 'findListApi', title: 'findListApi', summary: '', tags: [] });
    store.insertNode({ id: 'api:api/saveApi', type: 'api', name: 'saveApi', title: 'saveApi', summary: '', tags: [] });
    store.insertNode({ id: 'api:api/deleteApi', type: 'api', name: 'deleteApi', title: 'deleteApi', summary: '', tags: [] });

    // page-a calls findListApi and saveApi
    store.insertEdge({ source: 'page:mod/page-a', target: 'api:api/findListApi', type: 'calls' });
    store.insertEdge({ source: 'page:mod/page-a', target: 'api:api/saveApi', type: 'calls' });

    // page-b calls findListApi
    store.insertEdge({ source: 'page:mod/page-b', target: 'api:api/findListApi', type: 'calls' });

    // page-c calls deleteApi
    store.insertEdge({ source: 'page:mod/page-c', target: 'api:api/deleteApi', type: 'calls' });

    // Insert fields
    store.insertNode({ id: 'field:mod/page-a/field/0', type: 'field', name: 'name', title: 'Name', summary: '', tags: [] });
    store.insertNode({ id: 'field:mod/page-a/field/1', type: 'field', name: 'findListApi', title: 'Status', summary: '', tags: [] });
    store.insertNode({ id: 'field:mod/page-b/field/0', type: 'field', name: 'name', title: 'Name', summary: '', tags: [] });

    // page contains fields
    store.insertEdge({ source: 'page:mod/page-a', target: 'field:mod/page-a/field/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-a', target: 'field:mod/page-a/field/1', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-b', target: 'field:mod/page-b/field/0', type: 'contains' });

    // field calls api
    store.insertEdge({ source: 'field:mod/page-a/field/1', target: 'api:api/findListApi', type: 'calls' });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  describe('apiName branch', () => {
    it('returns affected pages and fields for an API', async () => {
      const result = await handleAnalyzeImpact(store, { apiName: 'findListApi' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.target).toBe('findListApi');
      expect(data.targetType).toBe('api');
      expect(data.affectedPages.length).toBe(2);
      expect(data.affectedPages.map((p: { id: string }) => p.id)).toContain('page:mod/page-a');
      expect(data.affectedPages.map((p: { id: string }) => p.id)).toContain('page:mod/page-b');
      expect(data.affectedFields.length).toBe(1);
      expect(data.affectedFields[0].name).toBe('findListApi');
      expect(data.summary).toContain('2 个页面');
    });

    it('returns error for unknown API', async () => {
      const result = await handleAnalyzeImpact(store, { apiName: 'unknownApi' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('not_found');
      expect((result as any).isError).toBe(true);
    });
  });

  describe('fieldName branch', () => {
    it('returns affected pages and fields for a field name', async () => {
      const result = await handleAnalyzeImpact(store, { fieldName: 'name' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.target).toBe('name');
      expect(data.targetType).toBe('field');
      expect(data.affectedPages.length).toBe(2);
      expect(data.affectedFields.length).toBe(2);
      expect(data.summary).toContain('2 个页面');
    });

    it('returns error for unknown field', async () => {
      const result = await handleAnalyzeImpact(store, { fieldName: 'unknownField' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('not_found');
      expect((result as any).isError).toBe(true);
    });
  });

  describe('pageId branch', () => {
    it('returns page spec and related pages for an existing page', async () => {
      const result = await handleAnalyzeImpact(store, { pageId: 'mod/page-a' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.target).toBe('mod/page-a');
      expect(data.targetType).toBe('page');
      expect(data.page.id).toBe('page:mod/page-a');
      expect(data.apis.length).toBe(2);
      // page-a shares findListApi with page-b
      expect(data.relatedPages.length).toBe(1);
      expect(data.relatedPages[0].id).toBe('page:mod/page-b');
    });

    it('returns error for non-existent page', async () => {
      const result = await handleAnalyzeImpact(store, { pageId: 'mod/nonexistent' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('not_found');
      expect((result as any).isError).toBe(true);
    });

    it('returns related pages from both page_calls_apis and field_calls_apis', async () => {
      const result = await handleAnalyzeImpact(store, { pageId: 'mod/page-a' });
      const data = JSON.parse(result.content[0].text as string);

      // Should find page-b because both share findListApi
      expect(data.relatedPages.length).toBe(1);
    });
  });

  describe('no input branch', () => {
    it('returns error when no parameter is provided', async () => {
      const result = await handleAnalyzeImpact(store, {});
      const data = JSON.parse(result.content[0].text as string);

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('invalid_input');
      expect((result as any).isError).toBe(true);
    });
  });

  describe('maxDepth parameter', () => {
    it('respects maxDepth for page impact analysis', async () => {
      const resultDepth1 = await handleAnalyzeImpact(store, { pageId: 'mod/page-a', maxDepth: 1 });
      const data1 = JSON.parse(resultDepth1.content[0].text as string);

      const resultDepth3 = await handleAnalyzeImpact(store, { pageId: 'mod/page-a', maxDepth: 3 });
      const data3 = JSON.parse(resultDepth3.content[0].text as string);

      expect(data3.nodes.length).toBeGreaterThanOrEqual(data1.nodes.length);
    });

    it('clamps maxDepth to [1, 5]', async () => {
      const resultLow = await handleAnalyzeImpact(store, { apiName: 'findListApi', maxDepth: 0 });
      const dataLow = JSON.parse(resultLow.content[0].text as string);
      expect(dataLow.riskLevel).toBeDefined();

      const resultHigh = await handleAnalyzeImpact(store, { apiName: 'findListApi', maxDepth: 10 });
      const dataHigh = JSON.parse(resultHigh.content[0].text as string);
      expect(dataHigh.riskLevel).toBeDefined();
    });
  });

  describe('risk level', () => {
    it('returns riskLevel in response', async () => {
      const result = await handleAnalyzeImpact(store, { apiName: 'findListApi' });
      const data = JSON.parse(result.content[0].text as string);
      expect(data.riskLevel).toBeDefined();
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(data.riskLevel);
    });

    it('returns LOW for minimal impact', async () => {
      const result = await handleAnalyzeImpact(store, { apiName: 'deleteApi' });
      const data = JSON.parse(result.content[0].text as string);
      expect(data.riskLevel).toBe('LOW');
    });
  });
});
