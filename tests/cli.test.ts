import { describe, it, expect, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import { createStore } from '../src/store/sqlite.js';
import { rmSync } from 'fs';

const CLI = join(process.cwd(), 'src', 'index.ts');
const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const fixturesDir = join(process.cwd(), 'tests', 'fixtures');

describe('CLI ingest command', () => {
  const dbPath = join(process.cwd(), 'tests', 'cli-ingest.db');
  const docsPath = join(fixturesDir);

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('imports feature docs into database', () => {
    execSync(`${tsx} ${CLI} ingest --docsPath ${docsPath} --db ${dbPath}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const store = createStore(dbPath);
    const pages = store.searchPages('', undefined);
    store.close();

    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it('supports --force to rebuild', () => {
    execSync(`${tsx} ${CLI} ingest --docsPath ${docsPath} --db ${dbPath}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const result = spawnSync(tsx, [CLI, 'ingest', '--docsPath', docsPath, '--db', dbPath, '--force'], {
      encoding: 'utf-8',
    });

    const stderr = result.stderr || '';
    expect(stderr).toContain('导入完成');
    expect(stderr).toContain('更新');
  });
});

describe('CLI query command', () => {
  const dbPath = join(process.cwd(), 'tests', 'cli-query.db');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns page spec as JSON', () => {
    const store = createStore(dbPath);
    store.insertPage({
      id: 'test/page',
      module: 'test',
      pageName: 'page',
      pageTitle: 'Query Test',
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
    store.close();

    const output = execSync(`${tsx} ${CLI} query page test/page --db ${dbPath}`, {
      encoding: 'utf-8',
    });

    const spec = JSON.parse(output);
    expect(spec.page.pageTitle).toBe('Query Test');
    expect(spec.fields).toHaveLength(1);
  });

  it('exits 1 for missing page', () => {
    const store = createStore(dbPath);
    store.insertPage({ id: 'test/page', module: 'test', pageName: 'page', pageTitle: 'Test' });
    store.close();

    let exitCode: number | null = null;
    try {
      execSync(`${tsx} ${CLI} query page missing/page --db ${dbPath}`, {
        encoding: 'utf-8',
      });
    } catch (err: any) {
      exitCode = err.status;
    }

    expect(exitCode).toBe(1);
  });
});

describe('CLI map command', () => {
  const dbPath = join(process.cwd(), 'tests', 'cli-map.db');
  const routesFile = join(fixturesDir, 'routes-maps.ts');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('outputs mapping between code and spec', () => {
    const store = createStore(dbPath);
    store.insertPage({
      id: 'test-module/simple-page',
      module: 'test-module',
      pageName: 'simple-page',
      pageTitle: 'Simple Page',
      pageType: 'list',
      route: '/test/page',
    });
    store.close();

    const output = execSync(
      `${tsx} ${CLI} map --codeDir ${join(fixturesDir, 'test-module')} --routesFile ${routesFile} --db ${dbPath}`,
      { encoding: 'utf-8' }
    );

    const mapping = JSON.parse(output);
    expect(mapping.matchedPages).toBeDefined();
    expect(mapping.unmatchedCodePages).toBeDefined();
    expect(mapping.unmatchedSpecPages).toBeDefined();
  });
});
