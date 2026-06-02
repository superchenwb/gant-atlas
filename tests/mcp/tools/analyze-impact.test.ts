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

    // Insert test data
    store.insertPage({ id: 'mod/page-a', module: 'mod', pageName: 'page-a', pageTitle: 'Page A' });
    store.insertPage({ id: 'mod/page-b', module: 'mod', pageName: 'page-b', pageTitle: 'Page B' });
    store.insertPage({ id: 'mod/page-c', module: 'mod', pageName: 'page-c', pageTitle: 'Page C' });

    store.insertAPI({ id: 'api/findListApi', name: 'findListApi' });
    store.insertAPI({ id: 'api/saveApi', name: 'saveApi' });
    store.insertAPI({ id: 'api/deleteApi', name: 'deleteApi' });

    // page-a uses findListApi and saveApi
    store.insertPageAPI('mod/page-a', 'api/findListApi');
    store.insertPageAPI('mod/page-a', 'api/saveApi');

    // page-b uses findListApi
    store.insertPageAPI('mod/page-b', 'api/findListApi');

    // page-c uses deleteApi only
    store.insertPageAPI('mod/page-c', 'api/deleteApi');

    // Fields
    store.insertField({
      id: 'mod/page-a/field/0',
      pageId: 'mod/page-a',
      fieldLabel: 'Name',
      fieldName: 'name',
      componentType: 'Input',
      required: true,
    });
    store.insertField({
      id: 'mod/page-a/field/1',
      pageId: 'mod/page-a',
      fieldLabel: 'Status',
      fieldName: 'findListApi',
      componentType: 'Select',
      required: false,
    });
    store.insertField({
      id: 'mod/page-b/field/0',
      pageId: 'mod/page-b',
      fieldLabel: 'Name',
      fieldName: 'name',
      componentType: 'Input',
      required: true,
    });

    // fieldCallsApis: page-a's "findListApi" field calls findListApi
    store.insertFieldCallsAPI('mod/page-a/field/1', 'api/findListApi');
  });

  afterEach(() => {
    store.db.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  describe('apiName branch', () => {
    it('returns affected pages and fields for an API', async () => {
      const result = await handleAnalyzeImpact(store, { apiName: 'findListApi' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.target).toBe('findListApi');
      expect(data.targetType).toBe('api');
      expect(data.affectedPages.length).toBe(2);
      expect(data.affectedPages.map((p: { id: string }) => p.id)).toContain('mod/page-a');
      expect(data.affectedPages.map((p: { id: string }) => p.id)).toContain('mod/page-b');
      expect(data.affectedFields.length).toBe(1);
      expect(data.affectedFields[0].fieldName).toBe('findListApi');
      expect(data.summary).toContain('2 个页面');
    });

    it('returns empty for unknown API', async () => {
      const result = await handleAnalyzeImpact(store, { apiName: 'unknownApi' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.affectedPages.length).toBe(0);
      expect(data.affectedFields.length).toBe(0);
      expect(data.summary).toContain('0 个页面');
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

    it('returns empty for unknown field', async () => {
      const result = await handleAnalyzeImpact(store, { fieldName: 'unknownField' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.affectedPages.length).toBe(0);
      expect(data.affectedFields.length).toBe(0);
    });
  });

  describe('pageId branch', () => {
    it('returns page spec and related pages for an existing page', async () => {
      const result = await handleAnalyzeImpact(store, { pageId: 'mod/page-a' });
      const data = JSON.parse(result.content[0].text as string);

      expect(data.target).toBe('mod/page-a');
      expect(data.targetType).toBe('page');
      expect(data.page.id).toBe('mod/page-a');
      expect(data.fields.length).toBe(2);
      expect(data.apis.length).toBe(2);
      // page-a shares findListApi with page-b
      expect(data.relatedPages.length).toBe(1);
      expect(data.relatedPages[0].page.id).toBe('mod/page-b');
      expect(data.relatedPages[0].sharedApis).toContain('findListApi');
    });

    it('returns error message for non-existent page', async () => {
      const result = await handleAnalyzeImpact(store, { pageId: 'mod/nonexistent' });
      expect(result.content[0].text).toContain('不存在');
    });

    it('returns related pages from both page_calls_apis and field_calls_apis', async () => {
      // page-a has findListApi via page_calls_apis and saveApi via page_calls_apis
      // page-b has findListApi via page_calls_apis
      // page-a has findListApi via field_calls_apis (field "findListApi")
      const result = await handleAnalyzeImpact(store, { pageId: 'mod/page-a' });
      const data = JSON.parse(result.content[0].text as string);

      // Should find page-b because both share findListApi
      expect(data.relatedPages.length).toBe(1);
    });
  });

  describe('no input branch', () => {
    it('returns error when no parameter is provided', async () => {
      const result = await handleAnalyzeImpact(store, {});
      expect(result.content[0].text).toContain('请提供');
      expect(result.isError).toBe(true);
    });
  });
});
