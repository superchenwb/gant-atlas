import { describe, it, expect } from 'vitest';
import { buildGraph, buildGraphAsync } from '../../src/graph/builder.js';
import { join } from 'path';

describe('buildGraph', () => {
  const docsPath = join(process.cwd(), 'tests', 'fixtures');

  it('builds graph from all fixture docs', () => {
    const result = buildGraph(docsPath);
    expect(result.length).toBe(3);
  });

  describe('flat format (simple-page)', () => {
    const findDoc = (result: ReturnType<typeof buildGraph>) =>
      result.find((d) => d.page.id === 'test-module/simple-page')!;

    it('parses page metadata correctly', () => {
      const result = buildGraph(docsPath);
      const doc = findDoc(result);
      expect(doc.page).toBeDefined();
      expect(doc.page.pageTitle).toBe('测试页面');
      expect(doc.page.pageType).toBe('数据管理页');
      expect(doc.page.route).toBe('/test/page');
      expect(doc.page.pageFunction).toBe('测试功能清单解析');
    });

    it('parses flat format search area fields', () => {
      const result = buildGraph(docsPath);
      const doc = findDoc(result);
      expect(doc.fields.length).toBe(2);

      const nameField = doc.fields[0];
      expect(nameField.fieldLabel).toBe('用户名');
      expect(nameField.fieldName).toBe('name');
      expect(nameField.componentType).toBe('输入框');
      expect(nameField.required).toBe(true);
      expect(nameField.defaultValue).toBeUndefined();

      const statusField = doc.fields[1];
      expect(statusField.fieldLabel).toBe('状态');
      expect(statusField.fieldName).toBe('simplePageFindListApi');
      expect(statusField.componentType).toBe('下拉框');
      expect(statusField.required).toBe(false);
      expect(statusField.defaultValue).toBe('全部');
    });

    it('parses flat format grid columns', () => {
      const result = buildGraph(docsPath);
      const doc = findDoc(result);
      expect(doc.columns.length).toBe(2);

      const nameCol = doc.columns[0];
      expect(nameCol.columnTitle).toBe('用户名');
      expect(nameCol.fieldName).toBe('name');
      expect(nameCol.displayContent).toBe('用户名');
      expect(nameCol.editable).toBe(false);
      expect(nameCol.width).toBe(120);
      expect(nameCol.sortable).toBe(true);
      expect(nameCol.dataType).toBe('string');
      expect(nameCol.align).toBe('left');

      const statusCol = doc.columns[1];
      expect(statusCol.columnTitle).toBe('状态');
      expect(statusCol.fieldName).toBe('status');
      expect(statusCol.displayContent).toBe('状态标签');
      expect(statusCol.editable).toBe(false);
      expect(statusCol.width).toBe(80);
      expect(statusCol.sortable).toBe(false);
      expect(statusCol.dataType).toBe('string');
      expect(statusCol.align).toBe('center');
    });

    it('parses flat format buttons', () => {
      const result = buildGraph(docsPath);
      const doc = findDoc(result);
      expect(doc.buttons.length).toBe(2);

      const addBtn = doc.buttons[0];
      expect(addBtn.buttonName).toBe('新增');
      expect(addBtn.scope).toBe('全局');
      expect(addBtn.position).toBe('右上角');
      expect(addBtn.displayCondition).toBe('');
      expect(addBtn.disabledCondition).toBe('');
      expect(addBtn.clickResult).toBe('打开弹窗');
      expect(addBtn.confirmRequired).toBe(false);

      const delBtn = doc.buttons[1];
      expect(delBtn.buttonName).toBe('删除');
      expect(delBtn.scope).toBe('行内');
      expect(delBtn.position).toBe('操作列');
      expect(delBtn.displayCondition).toBe('');
      expect(delBtn.disabledCondition).toBe('已删除');
      expect(delBtn.clickResult).toBe('删除记录');
      expect(delBtn.confirmRequired).toBe(true);
    });
  });

  describe('key-value format (kv-page)', () => {
    const findDoc = (result: ReturnType<typeof buildGraph>) =>
      result.find((d) => d.page.id === 'test-module/kv-page')!;

    it('parses page metadata correctly', () => {
      const result = buildGraph(docsPath);
      const doc = findDoc(result);
      expect(doc.page.pageTitle).toBe('Key-Value 测试页面');
      expect(doc.page.pageType).toBe('表单页');
      expect(doc.page.route).toBe('/kv/page');
      expect(doc.page.pageFunction).toBe('测试 key-value 格式解析');
    });

    it('parses key-value format search area fields', () => {
      const result = buildGraph(docsPath);
      const doc = findDoc(result);
      expect(doc.fields.length).toBe(2);

      const nameField = doc.fields[0];
      expect(nameField.fieldLabel).toBe('名称');
      expect(nameField.fieldName).toBe('kvName');
      expect(nameField.componentType).toBe('Input');
      expect(nameField.required).toBe(true);
      expect(nameField.defaultValue).toBe('无');

      const codeField = doc.fields[1];
      expect(codeField.fieldLabel).toBe('编码');
      expect(codeField.fieldName).toBe('kvCode');
      expect(codeField.componentType).toBe('Input');
      expect(codeField.required).toBe(false);
      expect(codeField.defaultValue).toBe('default-code');
    });

    it('parses key-value format grid columns', () => {
      const result = buildGraph(docsPath);
      const doc = findDoc(result);
      expect(doc.columns.length).toBe(2);

      const nameCol = doc.columns[0];
      expect(nameCol.columnTitle).toBe('名称');
      expect(nameCol.fieldName).toBe('kvName');
      expect(nameCol.displayContent).toBe('名称文本');
      expect(nameCol.editable).toBe(true);
      expect(nameCol.width).toBe(150);
      expect(nameCol.sortable).toBe(true);
      expect(nameCol.dataType).toBe('string');
      expect(nameCol.align).toBe('left');

      const codeCol = doc.columns[1];
      expect(codeCol.columnTitle).toBe('编码');
      expect(codeCol.fieldName).toBe('kvCode');
      expect(codeCol.displayContent).toBe('编码文本');
      expect(codeCol.editable).toBe(false);
      expect(codeCol.width).toBe(100);
      expect(codeCol.sortable).toBe(false);
    });

    it('parses key-value format buttons', () => {
      const result = buildGraph(docsPath);
      const doc = findDoc(result);
      expect(doc.buttons.length).toBe(2);

      const addBtn = doc.buttons[0];
      expect(addBtn.buttonName).toBe('新增');
      expect(addBtn.scope).toBe('页面级');
      expect(addBtn.position).toBe('左上角');
      expect(addBtn.displayCondition).toBe('始终显示');
      expect(addBtn.disabledCondition).toBe('无');
      expect(addBtn.clickResult).toBe('打开新增弹窗');
      expect(addBtn.confirmRequired).toBe(false);

      const delBtn = doc.buttons[1];
      expect(delBtn.buttonName).toBe('删除');
      expect(delBtn.scope).toBe('页面级');
      expect(delBtn.position).toBe('新增按钮右侧');
      expect(delBtn.displayCondition).toBe('始终显示');
      expect(delBtn.disabledCondition).toBe('未选中');
      expect(delBtn.clickResult).toBe('删除记录');
      expect(delBtn.confirmRequired).toBe(true);
    });
  });

  describe('API extraction', () => {
    it('extracts API references from all markdown files', () => {
      const result = buildGraph(docsPath);
      const simpleDoc = result.find((d) => d.page.id === 'test-module/simple-page')!;
      const kvDoc = result.find((d) => d.page.id === 'test-module/kv-page')!;

      // simple-page APIs from main.md
      const simpleApiNames = simpleDoc.apis.map((a) => a.name);
      expect(simpleApiNames).toContain('simplePageFindListApi');
      expect(simpleApiNames).toContain('simplePageSaveApi');

      // kv-page APIs from main.md
      const kvApiNames = kvDoc.apis.map((a) => a.name);
      expect(kvApiNames).toContain('kvPageFindListApi');
      expect(kvApiNames).toContain('kvPageSaveApi');
    });

    it('assigns global API ids', () => {
      const result = buildGraph(docsPath);
      for (const doc of result) {
        for (const api of doc.apis) {
          expect(api.id).toBe(`api/${api.name}`);
        }
      }
    });
  });

  describe('relation building', () => {
    it('builds pageHasFields relations', () => {
      const result = buildGraph(docsPath);
      const doc = result.find((d) => d.page.id === 'test-module/simple-page')!;
      expect(doc.relations.pageHasFields.length).toBe(2);
      expect(doc.relations.pageHasFields[0].pageId).toBe('test-module/simple-page');
      expect(doc.relations.pageHasFields[0].fieldId).toBe(doc.fields[0].id);
    });

    it('builds pageHasColumns relations', () => {
      const result = buildGraph(docsPath);
      const doc = result.find((d) => d.page.id === 'test-module/kv-page')!;
      expect(doc.relations.pageHasColumns.length).toBe(2);
      expect(doc.relations.pageHasColumns[0].pageId).toBe('test-module/kv-page');
      expect(doc.relations.pageHasColumns[0].columnId).toBe(doc.columns[0].id);
    });

    it('builds pageHasButtons relations', () => {
      const result = buildGraph(docsPath);
      const doc = result.find((d) => d.page.id === 'test-module/simple-page')!;
      expect(doc.relations.pageHasButtons.length).toBe(2);
    });

    it('builds pageHasApis relations', () => {
      const result = buildGraph(docsPath);
      const simpleDoc = result.find((d) => d.page.id === 'test-module/simple-page')!;
      expect(simpleDoc.relations.pageHasApis.length).toBe(2);

      const apiIds = simpleDoc.relations.pageHasApis.map((r) => r.apiId);
      expect(apiIds).toContain('api/simplePageFindListApi');
      expect(apiIds).toContain('api/simplePageSaveApi');
    });

    it('builds fieldCallsApis relations when fieldName matches API name', () => {
      const result = buildGraph(docsPath);
      const simpleDoc = result.find((d) => d.page.id === 'test-module/simple-page')!;

      // simplePageFindListApi is both a fieldName and an API name
      expect(simpleDoc.relations.fieldCallsApis.length).toBeGreaterThanOrEqual(1);
      const fieldApiRel = simpleDoc.relations.fieldCallsApis.find(
        (r) => r.fieldId === simpleDoc.fields[1].id
      );
      expect(fieldApiRel).toBeDefined();
      expect(fieldApiRel!.apiId).toBe('api/simplePageFindListApi');
    });

    it('does not build fieldCallsApis when fieldName does not match any API', () => {
      const result = buildGraph(docsPath);
      const kvDoc = result.find((d) => d.page.id === 'test-module/kv-page')!;
      // kvName and kvCode do not match any API names
      expect(kvDoc.relations.fieldCallsApis.length).toBe(0);
    });
  });
});

describe('buildGraphAsync', () => {
  const docsPath = join(process.cwd(), 'tests', 'fixtures');

  it('produces identical output to buildGraph', async () => {
    const syncResult = buildGraph(docsPath);
    const asyncResult = await buildGraphAsync(docsPath);

    expect(asyncResult.length).toBe(syncResult.length);

    for (const syncDoc of syncResult) {
      const asyncDoc = asyncResult.find((d) => d.page.id === syncDoc.page.id);
      expect(asyncDoc).toBeDefined();
      expect(asyncDoc!.page).toEqual(syncDoc.page);
      expect(asyncDoc!.fields).toEqual(syncDoc.fields);
      expect(asyncDoc!.columns).toEqual(syncDoc.columns);
      expect(asyncDoc!.buttons).toEqual(syncDoc.buttons);
      expect(asyncDoc!.apis).toEqual(syncDoc.apis);
      expect(asyncDoc!.relations).toEqual(syncDoc.relations);
    }
  });

  it('parses all fixture pages concurrently', async () => {
    const result = await buildGraphAsync(docsPath);
    const ids = result.map((d) => d.page.id).sort();
    expect(ids).toEqual(['test-module/custom-page', 'test-module/kv-page', 'test-module/simple-page']);
  });
});

describe('custom.yml plugin', () => {
  const docsPath = join(process.cwd(), 'tests', 'fixtures');

  it('overrides page metadata from custom.yml', () => {
    const result = buildGraph(docsPath);
    const doc = result.find((d) => d.page.id === 'test-module/custom-page')!;

    expect(doc.page.pageTitle).toBe('自定义页面');
    expect(doc.page.pageType).toBe('自定义类型');
    expect(doc.page.route).toBe('/custom/route');
    expect(doc.page.pageFunction).toBe('测试 custom.yml 覆盖');
  });

  it('uses custom file names defined in custom.yml', () => {
    const result = buildGraph(docsPath);
    const doc = result.find((d) => d.page.id === 'test-module/custom-page')!;

    // overview.md parsed as main, query.md parsed as search, table.md parsed as grid
    expect(doc.fields.length).toBe(1);
    expect(doc.fields[0].fieldName).toBe('queryField');

    expect(doc.columns.length).toBe(1);
    expect(doc.columns[0].fieldName).toBe('tableCol');
  });

  it('works with async builder too', async () => {
    const result = await buildGraphAsync(docsPath);
    const doc = result.find((d) => d.page.id === 'test-module/custom-page')!;

    expect(doc.page.pageTitle).toBe('自定义页面');
    expect(doc.fields.length).toBe(1);
    expect(doc.columns.length).toBe(1);
  });
});
