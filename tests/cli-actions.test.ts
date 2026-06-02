import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { rmSync } from 'fs';
import { createStore } from '../src/store/sqlite.js';
import { runIngest, runQueryPage, runMap, runValidate, computePageHash } from '../src/cli/actions.js';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures');

describe('runIngest', () => {
  const dbPath = join(process.cwd(), 'tests', 'actions-ingest.db');
  const docsPath = join(fixturesDir);

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('imports feature docs into database', async () => {
    const result = await runIngest(docsPath, dbPath);

    expect(result.totalPages).toBeGreaterThanOrEqual(1);

    const store = createStore(dbPath);
    const pages = store.searchPages('', undefined);
    store.close();

    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it('skips unchanged pages on second run', async () => {
    await runIngest(docsPath, dbPath);
    const result = await runIngest(docsPath, dbPath);

    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.updated).toBe(0);
  });

  it('rebuilds with force flag', async () => {
    await runIngest(docsPath, dbPath);
    const result = await runIngest(docsPath, dbPath, true);

    expect(result.totalPages).toBeGreaterThanOrEqual(1);
  });
});

describe('runQueryPage', () => {
  const dbPath = join(process.cwd(), 'tests', 'actions-query.db');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns page spec when found', () => {
    const store = createStore(dbPath);
    store.insertPage({ id: 'mod/page', module: 'mod', pageName: 'page', pageTitle: 'Page', pageType: 'list', route: '/test' });
    store.close();

    const spec = runQueryPage('mod/page', dbPath);
    expect(spec).not.toBeNull();
    expect((spec as { page: { pageTitle: string } }).page.pageTitle).toBe('Page');
  });

  it('returns null when page not found', () => {
    const store = createStore(dbPath);
    store.insertPage({ id: 'mod/page', module: 'mod', pageName: 'page', pageTitle: 'Page' });
    store.close();

    const spec = runQueryPage('missing/page', dbPath);
    expect(spec).toBeNull();
  });
});

describe('runMap', () => {
  const dbPath = join(process.cwd(), 'tests', 'actions-map.db');
  const routesFile = join(fixturesDir, 'routes-maps.ts');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns mapping between code and spec', async () => {
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

    const mapping = await runMap(join(fixturesDir, 'test-module'), routesFile, dbPath);
    expect(mapping.matchedPages).toBeDefined();
    expect(mapping.unmatchedCodePages).toBeDefined();
    expect(mapping.unmatchedSpecPages).toBeDefined();
  });
});

describe('runValidate', () => {
  const dbPath = join(process.cwd(), 'tests', 'actions-validate.db');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns no issues for complete page', async () => {
    const store = createStore(dbPath);
    store.insertPage({ id: 'test/page', module: 'test', pageName: 'page', pageTitle: 'Page', pageType: 'list', route: '/test' });
    store.insertField({ id: 'test/page/f1', pageId: 'test/page', fieldLabel: 'Name', fieldName: 'name', componentType: 'Input', required: false });
    store.insertGridColumn({ id: 'test/page/c1', pageId: 'test/page', columnTitle: 'Name', fieldName: 'name', displayContent: '', editable: false, width: 100, sortable: false, dataType: 'string', align: 'left' });
    store.close();

    const result = await runValidate(dbPath);
    expect(result.hasIssues).toBe(false);
    expect(result.consistency.totalIssues).toBe(0);
  });

  it('returns issues for incomplete page', async () => {
    const store = createStore(dbPath);
    store.insertPage({ id: 'test/page', module: 'test', pageName: 'page', pageTitle: 'Page' });
    store.close();

    const result = await runValidate(dbPath);
    expect(result.hasIssues).toBe(true);
    expect(result.consistency.totalIssues).toBeGreaterThan(0);
  });

  it('includes mapping report when codeDir and routesFile provided', async () => {
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

    const routesFile = join(fixturesDir, 'routes-maps.ts');
    const result = await runValidate(dbPath, join(fixturesDir, 'test-module'), routesFile);

    expect(result.mapping).toBeDefined();
    expect(result.mapping!.matchedPages).toBeDefined();
  });
});

describe('computePageHash', () => {
  it('returns stable hash for same content', () => {
    const pagePath = join(fixturesDir, 'test-module', 'simple-page');
    const h1 = computePageHash(pagePath);
    const h2 = computePageHash(pagePath);
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });
});
