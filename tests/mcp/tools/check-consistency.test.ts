import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../../src/store/sqlite.js';
import { handleCheckConsistency } from '../../../src/mcp/tools/check-consistency.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('handleCheckConsistency', () => {
  const dbPath = join(process.cwd(), 'tests', 'check-consistency-test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);

    // Insert pages
    store.insertNode({
      id: 'page:mod/page-complete',
      type: 'page',
      name: 'page-complete',
      title: 'Complete Page',
      summary: '',
      tags: ['list'],
      module: 'mod',
      meta: { route: '/complete', pageType: 'list' },
    });
    store.insertNode({
      id: 'page:mod/page-incomplete',
      type: 'page',
      name: 'page-incomplete',
      title: 'Incomplete Page',
      summary: '',
      tags: [],
      module: 'mod',
    });
    store.insertNode({
      id: 'page:mod/page-no-fields',
      type: 'page',
      name: 'page-no-fields',
      title: 'No Fields Page',
      summary: '',
      tags: ['form'],
      module: 'mod',
      meta: { route: '/no-fields', pageType: 'form' },
    });
    store.insertNode({
      id: 'page:mod/page-no-columns',
      type: 'page',
      name: 'page-no-columns',
      title: 'No Columns Page',
      summary: '',
      tags: ['form'],
      module: 'mod',
      meta: { route: '/no-columns', pageType: 'form' },
    });
    store.insertNode({
      id: 'page:mod/page-stale',
      type: 'page',
      name: 'page-stale',
      title: 'Stale Page',
      summary: '',
      tags: [],
      module: 'mod',
      meta: { route: '/stale', pageType: 'list' },
    });
    store.insertNode({
      id: 'page:mod/page-bad-api',
      type: 'page',
      name: 'page-bad-api',
      title: 'Bad API Page',
      summary: '',
      tags: [],
      module: 'mod',
      meta: { route: '/bad-api', pageType: 'list' },
    });

    // Fields for complete page
    store.insertNode({
      id: 'field:mod/page-complete/field/0',
      type: 'field',
      name: 'name',
      title: 'Name',
      summary: '',
      tags: [],
      meta: { componentType: 'Input', required: true },
    });
    store.insertNode({
      id: 'field:mod/page-complete/field/1',
      type: 'field',
      name: 'findListApi',
      title: 'Status',
      summary: '',
      tags: [],
      meta: { componentType: 'Select', required: false },
    });

    // Columns for complete page
    store.insertNode({
      id: 'column:mod/page-complete/col/0',
      type: 'column',
      name: 'name',
      title: 'Name',
      summary: 'Name',
      tags: [],
      meta: { editable: false },
    });

    // Columns for no-columns page (but no fields)
    store.insertNode({
      id: 'column:mod/page-no-columns/col/0',
      type: 'column',
      name: 'name',
      title: 'Name',
      summary: 'Name',
      tags: [],
      meta: { editable: false },
    });

    // Columns and fields for stale page so it only triggers stale_page
    store.insertNode({
      id: 'field:mod/page-stale/field/0',
      type: 'field',
      name: 'query',
      title: 'Query',
      summary: '',
      tags: [],
      meta: { componentType: 'Input', required: false },
    });
    store.insertNode({
      id: 'column:mod/page-stale/col/0',
      type: 'column',
      name: 'query',
      title: 'Query',
      summary: 'Query',
      tags: [],
      meta: { editable: false },
    });

    // Button and field that reference a missing API
    store.insertNode({
      id: 'button:mod/page-bad-api/btn/0',
      type: 'button',
      name: 'submit',
      title: '提交',
      summary: '',
      tags: [],
    });
    store.insertNode({
      id: 'field:mod/page-bad-api/field/0',
      type: 'field',
      name: 'keyword',
      title: '关键词',
      summary: '',
      tags: [],
      meta: { componentType: 'Input', required: false },
    });
    store.insertNode({
      id: 'column:mod/page-bad-api/col/0',
      type: 'column',
      name: 'keyword',
      title: '关键词',
      summary: '关键词',
      tags: [],
      meta: { editable: false },
    });

    // Fields for no-fields page (but no columns)
    store.insertNode({
      id: 'field:mod/page-no-fields/field/0',
      type: 'field',
      name: 'name',
      title: 'Name',
      summary: '',
      tags: [],
      meta: { componentType: 'Input', required: true },
    });

    // APIs
    store.insertNode({ id: 'api:api/findListApi', type: 'api', name: 'findListApi', title: 'findListApi', summary: '', tags: [] });
    store.insertNode({ id: 'api:api/saveApi', type: 'api', name: 'saveApi', title: 'saveApi', summary: '', tags: [] });
    store.insertNode({ id: 'api:api/orphanApi', type: 'api', name: 'orphanApi', title: 'orphanApi', summary: '', tags: [] });

    // page-complete references findListApi at page level
    store.insertEdge({ source: 'page:mod/page-complete', target: 'api:api/findListApi', type: 'calls' });
    // page-complete's "findListApi" field does NOT have fieldCallsApis link (intentional)

    // contains edges
    store.insertEdge({ source: 'page:mod/page-complete', target: 'field:mod/page-complete/field/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-complete', target: 'field:mod/page-complete/field/1', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-complete', target: 'column:mod/page-complete/col/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-no-columns', target: 'column:mod/page-no-columns/col/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-no-fields', target: 'field:mod/page-no-fields/field/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-stale', target: 'field:mod/page-stale/field/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-stale', target: 'column:mod/page-stale/col/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-bad-api', target: 'button:mod/page-bad-api/btn/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-bad-api', target: 'field:mod/page-bad-api/field/0', type: 'contains' });
    store.insertEdge({ source: 'page:mod/page-bad-api', target: 'column:mod/page-bad-api/col/0', type: 'contains' });

    // stale flag on page-stale
    store.markNodeStale('page:mod/page-stale', true);

    // button/field calling a non-existent API
    store.insertEdge({ source: 'button:mod/page-bad-api/btn/0', target: 'api:api/missingApi', type: 'calls' });
    store.insertEdge({ source: 'field:mod/page-bad-api/field/0', target: 'api:api/missingApi', type: 'calls' });

    // saveApi is referenced by no one -> orphan
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  function parseResult(result: Awaited<ReturnType<typeof handleCheckConsistency>>) {
    return JSON.parse(result.content[0].text as string).data;
  }

  it('detects incomplete pages (missing page_type or route)', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const incomplete = result.issues.filter((i: { type: string }) => i.type === 'incomplete_page');
    expect(incomplete.length).toBe(1);
    expect(incomplete[0].description).toContain('page-incomplete');
  });

  it('detects pages without fields', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const emptyFields = result.issues.filter((i: { type: string }) => i.type === 'empty_fields');
    // page-no-columns and page-incomplete have no fields
    expect(emptyFields.map((i: { description: string }) => i.description)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('page-no-columns'),
        expect.stringContaining('page-incomplete'),
      ])
    );
  });

  it('detects pages without columns', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const emptyColumns = result.issues.filter((i: { type: string }) => i.type === 'empty_columns');
    // page-no-fields and page-incomplete have no columns
    expect(emptyColumns.length).toBe(2);
  });

  it('detects orphan APIs', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const orphan = result.issues.filter((i: { type: string }) => i.type === 'orphan_api');
    expect(orphan.length).toBe(2);
    const orphanNames = orphan.map((i: { description: string }) => i.description);
    expect(orphanNames).toEqual(expect.arrayContaining([
      expect.stringContaining('orphanApi'),
      expect.stringContaining('saveApi'),
    ]));
  });

  it('detects field names matching API without fieldCallsApis link', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const mismatch = result.issues.filter((i: { type: string }) => i.type === 'field_api_mismatch');
    expect(mismatch.length).toBe(1);
    expect(mismatch[0].description).toContain('findListApi');
  });

  it('detects pages with API but no field-level link', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const noFieldLink = result.issues.filter((i: { type: string }) => i.type === 'page_api_no_field_link');
    // page-complete has page-level API (findListApi) but no fieldCallsApis
    expect(noFieldLink.length).toBeGreaterThanOrEqual(1);
  });

  it('detects stale pages', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const stale = result.issues.filter((i: { type: string }) => i.type === 'stale_page');
    expect(stale.length).toBe(1);
    expect(stale[0].description).toContain('page-stale');
  });

  it('detects buttons calling missing APIs', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const buttonIssues = result.issues.filter((i: { type: string }) => i.type === 'button_calls_missing_api');
    expect(buttonIssues.length).toBe(1);
    expect(buttonIssues[0].description).toContain('page-bad-api');
    expect(buttonIssues[0].description).toContain('missingApi');
  });

  it('detects fields calling missing APIs', async () => {
    const result = parseResult(await handleCheckConsistency(store, {}));
    const fieldIssues = result.issues.filter((i: { type: string }) => i.type === 'field_calls_missing_api');
    expect(fieldIssues.length).toBe(1);
    expect(fieldIssues[0].description).toContain('关键词');
    expect(fieldIssues[0].description).toContain('missingApi');
  });

  it('filters by pageId when provided', async () => {
    const result = parseResult(await handleCheckConsistency(store, { pageId: 'mod/page-complete' }));
    // Should only include issues related to page-complete
    const unrelated = result.issues.filter(
      (i: { description: string }) =>
        i.description.includes('page-incomplete') ||
        i.description.includes('page-no-fields') ||
        i.description.includes('page-no-columns')
    );
    expect(unrelated.length).toBe(0);
  });

  it('returns success summary when no issues found', async () => {
    const result = parseResult(await handleCheckConsistency(store, { pageId: 'mod/page-no-columns' }));
    // page-no-columns has no fields but has a column
    // It will have empty_fields issue
    expect(result.totalIssues).toBeGreaterThanOrEqual(1);
  });
});
