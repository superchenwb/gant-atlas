import { describe, it, expect } from 'vitest';
import { generatePageSkeleton } from '../src/generator.js';
import type { PageCodeInfo, RouteMapping } from '../src/code-scanner.js';

describe('generatePageSkeleton', () => {
  const baseInfo: PageCodeInfo = {
    pageDir: '/code/test-module/simple-page',
    module: 'test-module',
    pageName: 'simple-page',
    fields: [
      { name: 'userName', title: '用户名', componentType: 'Input' },
      { name: 'status', title: '状态', componentType: 'Select' },
    ],
    columns: [
      { fieldName: 'userName', title: '用户名' },
      { fieldName: 'status', title: '状态标签' },
    ],
    apis: ['simplePageFindListApi', 'simplePageSaveApi'],
    buttons: [],
    hooks: [],
    tabs: [],
    permissions: [],
  };

  it('generates main.md with title from route', () => {
    const route: RouteMapping = { path: '/test/page', component: '@test-module/simple-page', title: '测试页面' };
    const skeleton = generatePageSkeleton(baseInfo, route);

    expect(skeleton.mainMd).toContain('# 测试页面');
    expect(skeleton.mainMd).toContain('| 路径 | /test/page |');
    expect(skeleton.mainMd).toContain('- simplePageFindListApi');
    expect(skeleton.mainMd).toContain('- simplePageSaveApi');
  });

  it('falls back to pageName when route has no title', () => {
    const route: RouteMapping = { path: '/test/page', component: '@test-module/simple-page' };
    const skeleton = generatePageSkeleton(baseInfo, route);

    expect(skeleton.mainMd).toContain('# simple-page');
  });

  it('generates search-area.md with component types', () => {
    const skeleton = generatePageSkeleton(baseInfo);

    expect(skeleton.searchAreaMd).toContain('## 查询条件');
    expect(skeleton.searchAreaMd).toContain('| 用户名 | userName | Input | | |');
    expect(skeleton.searchAreaMd).toContain('| 状态 | status | Select | | |');
  });

  it('marks unknown componentType as Input', () => {
    const info: PageCodeInfo = {
      ...baseInfo,
      fields: [{ name: 'unknownField', title: '未知字段' }],
    };
    const skeleton = generatePageSkeleton(info);

    expect(skeleton.searchAreaMd).toContain('| 未知字段 | unknownField | Input | | |');
  });

  it('generates grid-area.md with columns', () => {
    const skeleton = generatePageSkeleton(baseInfo);

    expect(skeleton.gridAreaMd).toContain('## 表格列');
    expect(skeleton.gridAreaMd).toContain('| 用户名 | userName | 用户名 | | | | | |');
    expect(skeleton.gridAreaMd).toContain('| 状态标签 | status | 状态标签 | | | | | |');
  });

  it('skips empty search-area when no fields', () => {
    const info: PageCodeInfo = { ...baseInfo, fields: [] };
    const skeleton = generatePageSkeleton(info);

    expect(skeleton.searchAreaMd).toBe('');
  });

  it('skips empty grid-area when no columns', () => {
    const info: PageCodeInfo = { ...baseInfo, columns: [] };
    const skeleton = generatePageSkeleton(info);

    expect(skeleton.gridAreaMd).toBe('');
  });

  it('generates button-area.md skeleton', () => {
    const skeleton = generatePageSkeleton(baseInfo);

    expect(skeleton.buttonAreaMd).toContain('## 按钮区域');
    expect(skeleton.buttonAreaMd).toContain('| 按钮名称 | 作用域 | 位置 | 显示条件 | 禁用条件 | 点击结果 | 确认弹窗 |');
  });

  it('generates api-area.md with API list and button associations', () => {
    const skeleton = generatePageSkeleton(baseInfo);

    expect(skeleton.apiAreaMd).toContain('# 接口区域');
    expect(skeleton.apiAreaMd).toContain('## 一、接口清单');
    expect(skeleton.apiAreaMd).toContain('| simplePageFindListApi | 查询 | |');
    expect(skeleton.apiAreaMd).toContain('| simplePageSaveApi | 保存 | |');
  });

  it('skips empty api-area when no APIs and no button API calls', () => {
    const info: PageCodeInfo = { ...baseInfo, apis: [], buttons: [] };
    const skeleton = generatePageSkeleton(info);

    expect(skeleton.apiAreaMd).toBe('');
  });

  it('escapes pipe characters in cell text', () => {
    const info: PageCodeInfo = {
      ...baseInfo,
      fields: [{ name: 'pipeField', title: 'A | B', componentType: 'Input' }],
    };
    const skeleton = generatePageSkeleton(info);

    expect(skeleton.searchAreaMd).toContain('A \\| B');
  });
});
