import { describe, it, expect } from 'vitest';
import { buildPageGenerationContext } from '../../src/generator/context.js';
import type { PageCodeInfo, RouteMapping } from '../../src/code-scanner.js';

describe('buildPageGenerationContext', () => {
  const route: RouteMapping = { path: '/test-page', component: 'TestPage', title: '测试页面' };

  const info: PageCodeInfo = {
    pageDir: '/code/test-module/test-page',
    module: 'test-module',
    pageName: 'test-page',
    fields: [
      { name: 'keyword', title: '关键词', componentType: 'Input' },
    ],
    columns: [
      { fieldName: 'name', title: '名称' },
    ],
    apis: ['testPageFindListApi'],
    buttons: [
      { name: '新增', element: 'Button', line: 10, onClick: 'handleAdd', snippet: '<Button onClick={handleAdd}>新增</Button>' },
    ],
    hooks: [
      { name: 'useTestPageData', line: 5, apis: ['testPageFindListApi'], snippet: 'function useTestPageData() {}' },
    ],
  };

  it('builds a compact context from PageCodeInfo', () => {
    const ctx = buildPageGenerationContext(info, route);

    expect(ctx.pageId).toBe('test-module/test-page');
    expect(ctx.route).toBe('/test-page');
    expect(ctx.searchFields).toHaveLength(1);
    expect(ctx.searchFields[0].name).toBe('keyword');
    expect(ctx.gridColumns).toHaveLength(1);
    expect(ctx.gridColumns[0].fieldName).toBe('name');
    expect(ctx.apis).toEqual(['testPageFindListApi']);
    expect(ctx.buttons).toHaveLength(1);
    expect(ctx.buttons[0].name).toBe('新增');
    expect(ctx.hooks).toHaveLength(1);
    expect(ctx.hooks[0].name).toBe('useTestPageData');
  });

  it('omits empty arrays but preserves structure', () => {
    const emptyInfo: PageCodeInfo = {
      pageDir: '/code/m/p',
      module: 'm',
      pageName: 'p',
      fields: [],
      columns: [],
      apis: [],
      buttons: [],
      hooks: [],
    };

    const ctx = buildPageGenerationContext(emptyInfo, route);
    expect(ctx.searchFields).toEqual([]);
    expect(ctx.gridColumns).toEqual([]);
    expect(ctx.apis).toEqual([]);
    expect(ctx.buttons).toEqual([]);
    expect(ctx.hooks).toEqual([]);
  });
});
