import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { runSync, runIngest } from '../src/cli/actions.js';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures');

describe('runSync', () => {
  const dbPath = join(process.cwd(), 'tests', 'cli-sync.db');
  const docsPath = join(process.cwd(), 'tests', 'cli-sync-docs');
  const routesFile = join(fixturesDir, 'routes-maps.ts');
  const codeDir = join(fixturesDir, 'test-module');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
    try { rmSync(docsPath, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(join(process.cwd(), 'tests', '.gant-atlas'), { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function seedDocs() {
    const pageDir = join(docsPath, 'test-module', 'simple-page');
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(
      join(pageDir, 'main.md'),
      '# 测试页面\n\n## 概述\n\n| 属性 | 内容 |\n|------|------|\n| 页面类型 | 列表页 |\n| 路径 | /test/page |\n| 页面功能 | 测试 |\n',
      'utf-8'
    );
    writeFileSync(
      join(pageDir, 'search-area.md'),
      '## 查询条件\n\n| 字段标签 | 参数名 | 控件类型 | 必填 | 默认值 |\n|----------|--------|----------|------|--------|\n| 用户名 | userName | Input | | |\n',
      'utf-8'
    );
    writeFileSync(
      join(pageDir, 'grid-area.md'),
      '## 表格列\n\n| 列名 | 字段名 | 显示内容 | 可编辑 | 宽度 | 排序 | 数据类型 | 对齐 |\n|------|--------|----------|--------|------|------|----------|------|\n| 用户名 | userName | 用户名 | | | | | |\n',
      'utf-8'
    );
    writeFileSync(join(pageDir, 'button-area.md'), '', 'utf-8');
    writeFileSync(join(pageDir, 'api-area.md'), '', 'utf-8');
  }

  it('generates diff for a page and records pending sync', async () => {
    seedDocs();
    await runIngest(docsPath, dbPath);

    const result = await runSync({
      docsPath,
      dbPath,
      codeDir,
      routesFile,
      pageId: 'test-module/simple-page',
    });

    expect(result.type).toBe('diff');
    expect(result.pageId).toBe('test-module/simple-page');
    expect(result.diff).toBeDefined();

    const listResult = await runSync({
      docsPath,
      dbPath,
      codeDir,
      routesFile,
      listPending: true,
    });

    expect(listResult.type).toBe('list');
    expect(listResult.pending).toHaveLength(1);
    expect(listResult.pending![0].pageId).toBe('test-module/simple-page');
  });

  it('lists empty pending when outbox is empty', async () => {
    seedDocs();

    const result = await runSync({
      docsPath,
      dbPath,
      codeDir,
      routesFile,
      listPending: true,
    });

    expect(result.type).toBe('list');
    expect(result.pending).toHaveLength(0);
  });

  it('applies pending sync and updates docs', async () => {
    seedDocs();
    await runIngest(docsPath, dbPath);

    // Generate a pending diff
    await runSync({
      docsPath,
      dbPath,
      codeDir,
      routesFile,
      pageId: 'test-module/simple-page',
    });

    // Apply it
    const applyResult = await runSync({
      docsPath,
      dbPath,
      codeDir,
      routesFile,
      applyPending: true,
    });

    expect(applyResult.type).toBe('apply');
    expect(applyResult.applied).toContain('test-module/simple-page');

    // Docs should now reflect the generated skeleton
    const pageDir = join(docsPath, 'test-module', 'simple-page');
    expect(existsSync(join(pageDir, 'api-area.md'))).toBe(true);
    const apiArea = readFileSync(join(pageDir, 'api-area.md'), 'utf-8');
    expect(apiArea).toContain('# 接口区域');
  });

  it('marks page as stale when sync is rejected', async () => {
    seedDocs();
    await runIngest(docsPath, dbPath);

    await runSync({
      docsPath,
      dbPath,
      codeDir,
      routesFile,
      pageId: 'test-module/simple-page',
    });

    const outboxDir = join(process.cwd(), 'tests', '.gant-atlas', 'sync-outbox');
    const { SyncOutbox } = await import('../src/sync/outbox.js');
    const outbox = new SyncOutbox({ outboxDir, dbPath });
    outbox.markRejected('test-module/simple-page', '描述不准确');

    const { createStore } = await import('../src/store/sqlite.js');
    const store = createStore(dbPath);
    const stalePages = store.getStalePages();
    store.close();

    expect(stalePages.some((p) => p.id === 'page:test-module/simple-page')).toBe(true);
  });
});
