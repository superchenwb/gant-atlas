import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffSkeletons, diffMarkdown, type FileDiff } from '../../src/sync/diff.js';
import type { GeneratedSkeleton } from '../../src/generator.js';
import { generateSemanticDiffSuggestions, type SemanticDiffSuggestion } from '../../src/sync/llm-diff.js';
import { SyncOutbox } from '../../src/sync/outbox.js';

function makeSkeleton(overrides: Partial<GeneratedSkeleton> = {}): GeneratedSkeleton {
  return {
    mainMd: '# Test Page\n\n## 概述\n\n| 属性 | 内容 |\n|------|------|\n| 页面类型 | 列表页 |\n| 路径 | /test |\n| 页面功能 | 测试 |\n',
    searchAreaMd:
      '## 查询条件\n\n| 字段标签 | 参数名 | 控件类型 | 必填 | 默认值 |\n|----------|--------|----------|------|--------|\n| 名称 | name | Input | | |\n',
    gridAreaMd:
      '## 表格列\n\n| 列名 | 字段名 | 显示内容 | 可编辑 | 宽度 | 排序 | 数据类型 | 对齐 |\n|------|--------|----------|--------|------|------|----------|------|\n| 名称 | name | 名称 | | | | | |\n',
    buttonAreaMd:
      '## 按钮区域\n\n| 按钮名称 | 作用域 | 位置 | 显示条件 | 禁用条件 | 点击结果 | 确认弹窗 |\n|----------|--------|------|----------|----------|----------|----------|\n| 查询 | 页面 | toolbar | | | | |\n',
    apiAreaMd: '',
    ...overrides,
  };
}

describe('sync diff', () => {
  it('returns no changes for identical skeletons', () => {
    const skeleton = makeSkeleton();
    const diff = diffSkeletons('test/page', skeleton, skeleton);
    expect(diff.hasChanges).toBe(false);
    expect(diff.fileDiffs.every((f) => f.status === 'unchanged')).toBe(true);
  });

  it('detects added search field', () => {
    const oldSkeleton = makeSkeleton();
    const newSkeleton = makeSkeleton({
      searchAreaMd:
        '## 查询条件\n\n| 字段标签 | 参数名 | 控件类型 | 必填 | 默认值 |\n|----------|--------|----------|------|--------|\n| 名称 | name | Input | | |\n| 状态 | status | CodeList | | |\n',
    });

    const diff = diffSkeletons('test/page', oldSkeleton, newSkeleton);
    expect(diff.hasChanges).toBe(true);

    const searchDiff = diff.fileDiffs.find((f: FileDiff) => f.fileName === 'search-area.md');
    expect(searchDiff?.status).toBe('modified');
    expect(searchDiff?.structuredChanges).toHaveLength(1);
    expect(searchDiff?.structuredChanges[0]).toMatchObject({
      kind: 'field',
      operation: 'added',
      name: 'status',
      description: '新增 status',
    });
  });

  it('detects removed grid column', () => {
    const oldSkeleton = makeSkeleton();
    const newSkeleton = makeSkeleton({ gridAreaMd: '' });

    const diff = diffSkeletons('test/page', oldSkeleton, newSkeleton);
    expect(diff.hasChanges).toBe(true);

    const gridDiff = diff.fileDiffs.find((f: FileDiff) => f.fileName === 'grid-area.md');
    expect(gridDiff?.status).toBe('removed');
    expect(gridDiff?.structuredChanges).toHaveLength(1);
    expect(gridDiff?.structuredChanges[0]).toMatchObject({
      kind: 'column',
      operation: 'removed',
      name: 'name',
    });
  });

  it('detects modified field component type', () => {
    const oldSkeleton = makeSkeleton();
    const newSkeleton = makeSkeleton({
      searchAreaMd:
        '## 查询条件\n\n| 字段标签 | 参数名 | 控件类型 | 必填 | 默认值 |\n|----------|--------|----------|------|--------|\n| 名称 | name | CodeList | | |\n',
    });

    const diff = diffSkeletons('test/page', oldSkeleton, newSkeleton);
    const searchDiff = diff.fileDiffs.find((f: FileDiff) => f.fileName === 'search-area.md');
    expect(searchDiff?.structuredChanges).toHaveLength(1);
    expect(searchDiff?.structuredChanges[0]).toMatchObject({
      kind: 'field',
      operation: 'modified',
      name: 'name',
    });
  });

  it('detects added button', () => {
    const oldSkeleton = makeSkeleton();
    const newSkeleton = makeSkeleton({
      buttonAreaMd:
        '## 按钮区域\n\n| 按钮名称 | 作用域 | 位置 | 显示条件 | 禁用条件 | 点击结果 | 确认弹窗 |\n|----------|--------|------|----------|----------|----------|----------|\n| 查询 | 页面 | toolbar | | | | |\n| 新增 | 页面 | toolbar | | | | |\n',
    });

    const diff = diffSkeletons('test/page', oldSkeleton, newSkeleton);
    const buttonDiff = diff.fileDiffs.find((f: FileDiff) => f.fileName === 'button-area.md');
    expect(buttonDiff?.structuredChanges).toHaveLength(1);
    expect(buttonDiff?.structuredChanges[0]).toMatchObject({
      kind: 'button',
      operation: 'added',
      name: '新增',
    });
  });

  it('returns unchanged for identical markdown files', () => {
    const md = '## 查询条件\n\n| 字段标签 | 参数名 |\n|----------|--------|\n| 名称 | name |\n';
    const diff = diffMarkdown('search-area.md', md, md);
    expect(diff.status).toBe('unchanged');
    expect(diff.structuredChanges).toHaveLength(0);
  });

  describe('semantic diff suggestions', () => {
    it('warns about removed fields', async () => {
      const oldSkeleton = makeSkeleton();
      const newSkeleton = makeSkeleton({
        searchAreaMd:
          '## 查询条件\n\n| 字段标签 | 参数名 | 控件类型 | 必填 | 默认值 |\n|----------|--------|----------|------|--------|\n',
      });
      const diff = diffSkeletons('test/page', oldSkeleton, newSkeleton);
      const suggestions = await generateSemanticDiffSuggestions(diff);

      const removed = suggestions.find((s: SemanticDiffSuggestion) => s.description.includes('删除'));
      expect(removed).toBeDefined();
      expect(removed?.severity).toBe('warning');
    });

    it('flags modified fields with changed columns', async () => {
      const oldSkeleton = makeSkeleton();
      const newSkeleton = makeSkeleton({
        searchAreaMd:
          '## 查询条件\n\n| 字段标签 | 参数名 | 控件类型 | 必填 | 默认值 |\n|----------|--------|----------|------|--------|\n| 名称 | name | CodeList | | |\n',
      });
      const diff = diffSkeletons('test/page', oldSkeleton, newSkeleton);
      const suggestions = await generateSemanticDiffSuggestions(diff);

      const modified = suggestions.find((s: SemanticDiffSuggestion) => s.description.includes('已修改'));
      expect(modified).toBeDefined();
      expect(modified?.severity).toBe('warning');
    });
  });
});

describe('sync outbox', () => {
  let tmpDir: string;
  let outbox: SyncOutbox;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gant-atlas-sync-'));
    outbox = new SyncOutbox({ outboxDir: join(tmpDir, 'outbox') });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records and lists pending diffs', () => {
    const diff = diffSkeletons('test/page', makeSkeleton(), makeSkeleton());
    outbox.recordPending('test/page', diff);

    const pending = outbox.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].pageId).toBe('test/page');
    expect(pending[0].status).toBe('pending');
    expect(pending[0].diff.hasChanges).toBe(false);
  });

  it('marks a record as applied', () => {
    const diff = diffSkeletons('test/page', makeSkeleton(), makeSkeleton());
    outbox.recordPending('test/page', diff);

    const applied = outbox.markApplied('test/page');
    expect(applied?.status).toBe('applied');
    expect(applied?.appliedAt).toBeDefined();
    expect(outbox.listPending()).toHaveLength(0);
  });

  it('marks a record as rejected with reason', () => {
    const diff = diffSkeletons('test/page', makeSkeleton(), makeSkeleton());
    outbox.recordPending('test/page', diff);

    const rejected = outbox.markRejected('test/page', '字段描述不准确');
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.rejectionReason).toBe('字段描述不准确');
    expect(rejected?.rejectedAt).toBeDefined();
  });

  it('clears a record', () => {
    const diff = diffSkeletons('test/page', makeSkeleton(), makeSkeleton());
    outbox.recordPending('test/page', diff);
    outbox.clearRecord('test/page');
    expect(outbox.getRecord('test/page')).toBeNull();
  });

  it('returns null when marking non-existent records', () => {
    expect(outbox.markApplied('missing/page')).toBeNull();
    expect(outbox.markRejected('missing/page')).toBeNull();
  });
});
