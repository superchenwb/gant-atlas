import { describe, it, expect } from 'vitest';
import { buildProjectAsync } from '../../src/graph/builder.js';
import { join } from 'path';

describe('buildProjectAsync', () => {
  const docsPath = join(process.cwd(), 'tests', 'fixtures');

  it('builds graph from all fixture docs', async () => {
    const result = await buildProjectAsync(docsPath);
    const pageNodes = result.nodes.filter((n) => n.type === 'page');
    expect(pageNodes.length).toBe(3);
  });

  describe('flat format (simple-page)', () => {
    const findPage = (result: Awaited<ReturnType<typeof buildProjectAsync>>) =>
      result.nodes.find((n) => n.id === 'page:test-module/simple-page')!;

    it('parses page metadata correctly', async () => {
      const result = await buildProjectAsync(docsPath);
      const page = findPage(result);
      expect(page).toBeDefined();
      expect(page.title).toBe('测试页面');
      expect(page.meta?.pageType).toBe('数据管理页');
      expect(page.meta?.route).toBe('/test/page');
      expect(page.meta?.pageFunction).toBe('测试功能清单解析');
    });

    it('parses flat format search area fields', async () => {
      const result = await buildProjectAsync(docsPath);
      const page = findPage(result);
      const fields = result.nodes.filter(
        (n) => n.type === 'field' && result.edges.some((e) => e.source === page.id && e.target === n.id && e.type === 'contains')
      );
      expect(fields.length).toBe(2);

      const nameField = fields[0];
      expect(nameField.title).toBe('用户名');
      expect(nameField.name).toBe('name');
      expect(nameField.meta?.componentType).toBe('输入框');
      expect(nameField.meta?.required).toBe(true);
      expect(nameField.meta?.defaultValue).toBeUndefined();

      const statusField = fields[1];
      expect(statusField.title).toBe('状态');
      expect(statusField.name).toBe('simplePageFindListApi');
      expect(statusField.meta?.componentType).toBe('下拉框');
      expect(statusField.meta?.required).toBe(false);
      expect(statusField.meta?.defaultValue).toBe('全部');
    });

    it('parses flat format grid columns', async () => {
      const result = await buildProjectAsync(docsPath);
      const page = findPage(result);
      const columns = result.nodes.filter(
        (n) => n.type === 'column' && result.edges.some((e) => e.source === page.id && e.target === n.id && e.type === 'contains')
      );
      expect(columns.length).toBe(2);

      const nameCol = columns[0];
      expect(nameCol.title).toBe('用户名');
      expect(nameCol.name).toBe('name');
      expect(nameCol.summary).toBe('用户名');
      expect(nameCol.meta?.editable).toBe(false);
      expect(nameCol.meta?.width).toBe(120);
      expect(nameCol.meta?.sortable).toBe(true);
      expect(nameCol.meta?.dataType).toBe('string');
      expect(nameCol.meta?.align).toBe('left');

      const statusCol = columns[1];
      expect(statusCol.title).toBe('状态');
      expect(statusCol.name).toBe('status');
      expect(statusCol.summary).toBe('状态标签');
      expect(statusCol.meta?.editable).toBe(false);
      expect(statusCol.meta?.width).toBe(80);
      expect(statusCol.meta?.sortable).toBe(false);
      expect(statusCol.meta?.dataType).toBe('string');
      expect(statusCol.meta?.align).toBe('center');
    });

    it('parses flat format buttons', async () => {
      const result = await buildProjectAsync(docsPath);
      const page = findPage(result);
      const buttons = result.nodes.filter(
        (n) => n.type === 'button' && result.edges.some((e) => e.source === page.id && e.target === n.id && e.type === 'contains')
      );
      expect(buttons.length).toBe(2);

      const addBtn = buttons[0];
      expect(addBtn.name).toBe('新增');
      expect(addBtn.tags).toContain('全局');
      expect(addBtn.meta?.position).toBe('右上角');
      expect(addBtn.meta?.displayCondition).toBe('');
      expect(addBtn.meta?.disabledCondition).toBe('');
      expect(addBtn.summary).toBe('打开弹窗');
      expect(addBtn.meta?.confirmRequired).toBe(false);

      const delBtn = buttons[1];
      expect(delBtn.name).toBe('删除');
      expect(delBtn.tags).toContain('行内');
      expect(delBtn.meta?.position).toBe('操作列');
      expect(delBtn.meta?.disabledCondition).toBe('已删除');
      expect(delBtn.summary).toBe('删除记录');
      expect(delBtn.meta?.confirmRequired).toBe(true);
    });
  });

  describe('key-value format (kv-page)', () => {
    const findPage = (result: Awaited<ReturnType<typeof buildProjectAsync>>) =>
      result.nodes.find((n) => n.id === 'page:test-module/kv-page')!;

    it('parses page metadata correctly', async () => {
      const result = await buildProjectAsync(docsPath);
      const page = findPage(result);
      expect(page.title).toBe('Key-Value 测试页面');
      expect(page.meta?.pageType).toBe('表单页');
      expect(page.meta?.route).toBe('/kv/page');
      expect(page.meta?.pageFunction).toBe('测试 key-value 格式解析');
    });

    it('parses key-value format search area fields', async () => {
      const result = await buildProjectAsync(docsPath);
      const page = findPage(result);
      const fields = result.nodes.filter(
        (n) => n.type === 'field' && result.edges.some((e) => e.source === page.id && e.target === n.id && e.type === 'contains')
      );
      expect(fields.length).toBe(2);

      const nameField = fields[0];
      expect(nameField.title).toBe('名称');
      expect(nameField.name).toBe('kvName');
      expect(nameField.meta?.componentType).toBe('Input');
      expect(nameField.meta?.required).toBe(true);
      expect(nameField.meta?.defaultValue).toBe('无');

      const codeField = fields[1];
      expect(codeField.title).toBe('编码');
      expect(codeField.name).toBe('kvCode');
      expect(codeField.meta?.componentType).toBe('Input');
      expect(codeField.meta?.required).toBe(false);
      expect(codeField.meta?.defaultValue).toBe('default-code');
    });

    it('parses key-value format grid columns', async () => {
      const result = await buildProjectAsync(docsPath);
      const page = findPage(result);
      const columns = result.nodes.filter(
        (n) => n.type === 'column' && result.edges.some((e) => e.source === page.id && e.target === n.id && e.type === 'contains')
      );
      expect(columns.length).toBe(2);

      const nameCol = columns[0];
      expect(nameCol.title).toBe('名称');
      expect(nameCol.name).toBe('kvName');
      expect(nameCol.summary).toBe('名称文本');
      expect(nameCol.meta?.editable).toBe(true);
      expect(nameCol.meta?.width).toBe(150);
      expect(nameCol.meta?.sortable).toBe(true);
      expect(nameCol.meta?.dataType).toBe('string');
      expect(nameCol.meta?.align).toBe('left');

      const codeCol = columns[1];
      expect(codeCol.title).toBe('编码');
      expect(codeCol.name).toBe('kvCode');
      expect(codeCol.summary).toBe('编码文本');
      expect(codeCol.meta?.editable).toBe(false);
      expect(codeCol.meta?.width).toBe(100);
      expect(codeCol.meta?.sortable).toBe(false);
    });

    it('parses key-value format buttons', async () => {
      const result = await buildProjectAsync(docsPath);
      const page = findPage(result);
      const buttons = result.nodes.filter(
        (n) => n.type === 'button' && result.edges.some((e) => e.source === page.id && e.target === n.id && e.type === 'contains')
      );
      expect(buttons.length).toBe(2);

      const addBtn = buttons[0];
      expect(addBtn.name).toBe('新增');
      expect(addBtn.tags).toContain('页面级');
      expect(addBtn.meta?.position).toBe('左上角');
      expect(addBtn.meta?.displayCondition).toBe('始终显示');
      expect(addBtn.meta?.disabledCondition).toBe('无');
      expect(addBtn.summary).toBe('打开新增弹窗');
      expect(addBtn.meta?.confirmRequired).toBe(false);

      const delBtn = buttons[1];
      expect(delBtn.name).toBe('删除');
      expect(delBtn.tags).toContain('页面级');
      expect(delBtn.meta?.position).toBe('新增按钮右侧');
      expect(delBtn.meta?.displayCondition).toBe('始终显示');
      expect(delBtn.meta?.disabledCondition).toBe('未选中');
      expect(delBtn.summary).toBe('删除记录');
      expect(delBtn.meta?.confirmRequired).toBe(true);
    });
  });

  describe('API extraction', () => {
    it('extracts API references from all markdown files', async () => {
      const result = await buildProjectAsync(docsPath);
      const apiNodes = result.nodes.filter((n) => n.type === 'api');
      const apiNames = apiNodes.map((a) => a.name);

      expect(apiNames).toContain('simplePageFindListApi');
      expect(apiNames).toContain('simplePageSaveApi');
      expect(apiNames).toContain('kvPageFindListApi');
      expect(apiNames).toContain('kvPageSaveApi');
    });

    it('assigns global API ids', async () => {
      const result = await buildProjectAsync(docsPath);
      const apiNodes = result.nodes.filter((n) => n.type === 'api');
      for (const api of apiNodes) {
        expect(api.id).toBe(`api:api/${api.name}`);
      }
    });
  });

  describe('relation building', () => {
    it('builds contains edges for fields', async () => {
      const result = await buildProjectAsync(docsPath);
      const pageId = 'page:test-module/simple-page';
      const fieldEdges = result.edges.filter((e) => e.source === pageId && e.type === 'contains');
      const fieldNodes = result.nodes.filter((n) => n.type === 'field' && fieldEdges.some((e) => e.target === n.id));
      expect(fieldNodes.length).toBe(2);
    });

    it('builds contains edges for columns', async () => {
      const result = await buildProjectAsync(docsPath);
      const pageId = 'page:test-module/kv-page';
      const columnEdges = result.edges.filter((e) => e.source === pageId && e.type === 'contains');
      const columnNodes = result.nodes.filter((n) => n.type === 'column' && columnEdges.some((e) => e.target === n.id));
      expect(columnNodes.length).toBe(2);
    });

    it('builds contains edges for buttons', async () => {
      const result = await buildProjectAsync(docsPath);
      const pageId = 'page:test-module/simple-page';
      const buttonEdges = result.edges.filter((e) => e.source === pageId && e.type === 'contains');
      const buttonNodes = result.nodes.filter((n) => n.type === 'button' && buttonEdges.some((e) => e.target === n.id));
      expect(buttonNodes.length).toBe(2);
    });

    it('builds page calls api edges', async () => {
      const result = await buildProjectAsync(docsPath);
      const pageId = 'page:test-module/simple-page';
      const apiEdges = result.edges.filter((e) => e.source === pageId && e.type === 'calls');
      const apiIds = apiEdges.map((e) => e.target);
      expect(apiIds).toContain('api:api/simplePageFindListApi');
      expect(apiIds).toContain('api:api/simplePageSaveApi');
    });

    it('builds field calls api edges when fieldName matches API name', async () => {
      const result = await buildProjectAsync(docsPath);
      const simplePageId = 'page:test-module/simple-page';
      const fieldEdges = result.edges.filter((e) => e.source === simplePageId && e.type === 'contains');
      const fieldIds = fieldEdges.map((e) => e.target);

      // simplePageFindListApi is both a fieldName and an API name
      const fieldApiEdges = result.edges.filter((e) => fieldIds.includes(e.source) && e.type === 'calls');
      expect(fieldApiEdges.length).toBeGreaterThanOrEqual(1);
      expect(fieldApiEdges[0].target).toBe('api:api/simplePageFindListApi');
    });

    it('does not build field calls api when fieldName does not match any API', async () => {
      const result = await buildProjectAsync(docsPath);
      const kvPageId = 'page:test-module/kv-page';
      const fieldEdges = result.edges.filter((e) => e.source === kvPageId && e.type === 'contains');
      const fieldIds = fieldEdges.map((e) => e.target);
      const fieldApiEdges = result.edges.filter((e) => fieldIds.includes(e.source) && e.type === 'calls');
      // kvName and kvCode do not match any API names
      expect(fieldApiEdges.length).toBe(0);
    });
  });
});

describe('custom.yml plugin', () => {
  const docsPath = join(process.cwd(), 'tests', 'fixtures');

  it('overrides page metadata from custom.yml', async () => {
    const result = await buildProjectAsync(docsPath);
    const page = result.nodes.find((n) => n.id === 'page:test-module/custom-page')!;

    expect(page.title).toBe('自定义页面');
    expect(page.meta?.pageType).toBe('自定义类型');
    expect(page.meta?.route).toBe('/custom/route');
    expect(page.meta?.pageFunction).toBe('测试 custom.yml 覆盖');
  });

  it('uses custom file names defined in custom.yml', async () => {
    const result = await buildProjectAsync(docsPath);
    const page = result.nodes.find((n) => n.id === 'page:test-module/custom-page')!;
    const fieldEdges = result.edges.filter((e) => e.source === page.id && e.type === 'contains');
    const fieldNodes = result.nodes.filter((n) => n.type === 'field' && fieldEdges.some((e) => e.target === n.id));
    const columnNodes = result.nodes.filter((n) => n.type === 'column' && fieldEdges.some((e) => e.target === n.id));

    // overview.md parsed as main, query.md parsed as search, table.md parsed as grid
    expect(fieldNodes.length).toBe(1);
    expect(fieldNodes[0].name).toBe('queryField');
    expect(columnNodes.length).toBe(1);
    expect(columnNodes[0].name).toBe('tableCol');
  });
});
