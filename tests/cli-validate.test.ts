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
    store.insertNode({
      id: 'page:test/page',
      type: 'page',
      name: 'page',
      title: 'Test Page',
      summary: '',
      tags: ['list'],
      module: 'test',
      meta: { route: '/test', pageType: 'list' },
    });
    store.insertNode({
      id: 'field:test/page/f1',
      type: 'field',
      name: 'name',
      title: 'Name',
      summary: '',
      tags: [],
      meta: { componentType: 'Input', required: false },
    });
    store.insertNode({
      id: 'column:test/page/c1',
      type: 'column',
      name: 'name',
      title: 'Name',
      summary: 'Name',
      tags: [],
      meta: { editable: false },
    });
    store.insertEdge({ source: 'page:test/page', target: 'field:test/page/f1', type: 'contains' });
    store.insertEdge({ source: 'page:test/page', target: 'column:test/page/c1', type: 'contains' });
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
    store.insertNode({
      id: 'page:test/page',
      type: 'page',
      name: 'page',
      title: 'Test Page',
      summary: '',
      tags: [],
      module: 'test',
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
    store.insertNode({
      id: 'page:test-module/simple-page',
      type: 'page',
      name: 'simple-page',
      title: 'Simple Page',
      summary: '',
      tags: ['list'],
      module: 'test-module',
      meta: { route: '/test/page', pageType: 'list' },
    });
    store.insertNode({
      id: 'field:test-module/simple-page/f1',
      type: 'field',
      name: 'userName',
      title: '用户名',
      summary: '',
      tags: [],
      meta: { componentType: 'Input', required: true },
    });
    store.insertNode({ id: 'api:api/simplePageFindListApi', type: 'api', name: 'simplePageFindListApi', title: 'simplePageFindListApi', summary: '', tags: [] });
    store.insertEdge({ source: 'page:test-module/simple-page', target: 'field:test-module/simple-page/f1', type: 'contains' });
    store.insertEdge({ source: 'page:test-module/simple-page', target: 'api:api/simplePageFindListApi', type: 'calls' });
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
