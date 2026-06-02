import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import { createStore } from '../src/store/sqlite.js';
import { rmSync } from 'fs';

const CLI = join(process.cwd(), 'src', 'index.ts');
const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');

describe('CLI validate command', () => {
  const dbPath = join(process.cwd(), 'tests', 'validate-test.db');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('exits 0 when no issues found', () => {
    const store = createStore(dbPath);
    store.insertPage({
      id: 'test/page',
      module: 'test',
      pageName: 'page',
      pageTitle: 'Test Page',
      pageType: 'list',
      route: '/test',
    });
    store.insertField({
      id: 'test/page/f1',
      pageId: 'test/page',
      fieldLabel: 'Name',
      fieldName: 'name',
      componentType: 'Input',
      required: false,
    });
    store.insertGridColumn({
      id: 'test/page/c1',
      pageId: 'test/page',
      columnTitle: 'Name',
      fieldName: 'name',
      displayContent: '',
      editable: false,
      width: 100,
      sortable: false,
      dataType: 'string',
      align: 'left',
    });
    store.close();

    const output = execSync(`${tsx} ${CLI} validate --db ${dbPath}`, {
      encoding: 'utf-8',
    });
    const report = JSON.parse(output);
    expect(report.totalIssues).toBe(0);
    expect(report.summary).toContain('所有检查通过');
  });

  it('exits 1 when issues are found', () => {
    const store = createStore(dbPath);
    store.insertPage({
      id: 'test/page',
      module: 'test',
      pageName: 'page',
      pageTitle: 'Test Page',
      // missing pageType and route
    });
    store.close();

    let exitCode: number | null = null;
    let output = '';
    try {
      execSync(`${tsx} ${CLI} validate --db ${dbPath}`, {
        encoding: 'utf-8',
      });
    } catch (err: any) {
      exitCode = err.status;
      output = err.stdout;
    }

    expect(exitCode).toBe(1);
    const report = JSON.parse(output);
    expect(report.totalIssues).toBeGreaterThan(0);
    expect(report.issues.some((i: any) => i.type === 'incomplete_page')).toBe(true);
  });

  it('includes mapping report when codeDir and routesFile are provided', () => {
    const store = createStore(dbPath);
    store.insertPage({
      id: 'test-module/simple-page',
      module: 'test-module',
      pageName: 'simple-page',
      pageTitle: 'Simple Page',
      pageType: 'list',
      route: '/test/page',
    });
    store.insertField({
      id: 'test-module/simple-page/f1',
      pageId: 'test-module/simple-page',
      fieldLabel: '用户名',
      fieldName: 'userName',
      componentType: 'Input',
      required: true,
    });
    store.insertAPI({ id: 'api/simplePageFindListApi', name: 'simplePageFindListApi' });
    store.insertPageAPI('test-module/simple-page', 'api/simplePageFindListApi');
    store.close();

    const fixturesDir = join(process.cwd(), 'tests', 'fixtures');
    const routesFile = join(fixturesDir, 'routes-maps.ts');

    let output = '';
    try {
      execSync(
        `${tsx} ${CLI} validate --db ${dbPath} --codeDir ${join(fixturesDir, 'test-module')} --routesFile ${routesFile}`,
        { encoding: 'utf-8' }
      );
    } catch (err: any) {
      output = err.stdout;
    }

    const report = JSON.parse(output);
    expect(report.consistency).toBeDefined();
    expect(report.mapping).toBeDefined();
    expect(report.mapping.matchedPages).toBeDefined();
  });
});
