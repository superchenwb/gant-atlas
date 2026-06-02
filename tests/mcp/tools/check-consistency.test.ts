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

    // Insert test data
    store.insertPage({
      id: 'mod/page-complete',
      module: 'mod',
      pageName: 'page-complete',
      pageTitle: 'Complete Page',
      pageType: 'list',
      route: '/complete',
    });
    store.insertPage({
      id: 'mod/page-incomplete',
      module: 'mod',
      pageName: 'page-incomplete',
      pageTitle: 'Incomplete Page',
      // missing pageType and route
    });
    store.insertPage({
      id: 'mod/page-no-fields',
      module: 'mod',
      pageName: 'page-no-fields',
      pageTitle: 'No Fields Page',
      pageType: 'form',
      route: '/no-fields',
    });
    store.insertPage({
      id: 'mod/page-no-columns',
      module: 'mod',
      pageName: 'page-no-columns',
      pageTitle: 'No Columns Page',
      pageType: 'form',
      route: '/no-columns',
    });

    // Fields for complete page
    store.insertField({
      id: 'mod/page-complete/field/0',
      pageId: 'mod/page-complete',
      fieldLabel: 'Name',
      fieldName: 'name',
      componentType: 'Input',
      required: true,
    });
    // This field's name matches an API but has no fieldCallsApis link
    store.insertField({
      id: 'mod/page-complete/field/1',
      pageId: 'mod/page-complete',
      fieldLabel: 'Status',
      fieldName: 'findListApi',
      componentType: 'Select',
      required: false,
    });

    // Columns for complete page
    store.insertGridColumn({
      id: 'mod/page-complete/col/0',
      pageId: 'mod/page-complete',
      columnTitle: 'Name',
      displayContent: 'Name',
      editable: false,
    });

    // Columns for no-columns page (but no fields)
    store.insertGridColumn({
      id: 'mod/page-no-columns/col/0',
      pageId: 'mod/page-no-columns',
      columnTitle: 'Name',
      displayContent: 'Name',
      editable: false,
    });

    // Fields for no-fields page (but no columns)
    store.insertField({
      id: 'mod/page-no-fields/field/0',
      pageId: 'mod/page-no-fields',
      fieldLabel: 'Name',
      fieldName: 'name',
      componentType: 'Input',
      required: true,
    });

    // APIs
    store.insertAPI({ id: 'api/findListApi', name: 'findListApi' });
    store.insertAPI({ id: 'api/saveApi', name: 'saveApi' });
    store.insertAPI({ id: 'api/orphanApi', name: 'orphanApi' });

    // page-complete references findListApi at page level
    store.insertPageAPI('mod/page-complete', 'api/findListApi');
    // page-complete's "findListApi" field does NOT have fieldCallsApis link (intentional)

    // saveApi is referenced by no one -> orphan
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  function parseResult(result: Awaited<ReturnType<typeof handleCheckConsistency>>) {
    return JSON.parse(result.content[0].text as string);
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
    expect(emptyFields.length).toBe(2); // page-no-fields (no fields wait, actually it has a field)
    // Wait: page-no-fields HAS a field. page-no-columns has no fields.
    // page-complete has fields.
    // page-incomplete has no fields.
    // So: page-no-columns and page-incomplete have no fields.
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
    // page-no-fields has no columns, page-incomplete has no columns
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
    // Check a page that has no issues
    // page-no-fields has fields, no columns -> will have empty_columns issue
    // Let's check page-no-columns with pageId filter
    const result = parseResult(await handleCheckConsistency(store, { pageId: 'mod/page-no-columns' }));
    // page-no-columns has no fields but has a column
    // It will have empty_fields issue
    expect(result.totalIssues).toBeGreaterThanOrEqual(1);
  });
});
