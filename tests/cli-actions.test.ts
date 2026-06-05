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
    const pages = store.listNodesByType('page');
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
    store.insertNode({ id: 'page:mod/page', type: 'page', name: 'page', title: 'Page', summary: '', tags: [], module: 'mod', meta: { route: '/test', pageType: 'list' } });
    store.insertNode({ id: 'field:mod/page/f1', type: 'field', name: 'f1', title: 'F1', summary: '', tags: [] });
    store.insertEdge({ source: 'page:mod/page', target: 'field:mod/page/f1', type: 'contains' });
    store.close();

    const spec = runQueryPage('mod/page', dbPath);
    expect(spec).not.toBeNull();
    expect((spec as { page: { title: string } }).page.title).toBe('Page');
  });

  it('returns null when page not found', () => {
    const store = createStore(dbPath);
    store.insertNode({ id: 'page:mod/page', type: 'page', name: 'page', title: 'Page', summary: '', tags: [] });
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
    store.insertNode({
      id: 'page:test-module/simple-page',
      type: 'page',
      name: 'simple-page',
      title: 'Simple Page',
      summary: '',
      tags: [],
      module: 'test-module',
      meta: { route: '/test/page', pageType: 'list' },
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
    store.insertNode({ id: 'page:test/page', type: 'page', name: 'page', title: 'Page', summary: '', tags: [], module: 'test', meta: { route: '/test', pageType: 'list' } });
    store.insertNode({ id: 'field:test/page/f1', type: 'field', name: 'name', title: 'Name', summary: '', tags: [], meta: { componentType: 'Input', required: false } });
    store.insertNode({ id: 'column:test/page/c1', type: 'column', name: 'name', title: 'Name', summary: 'Name', tags: [], meta: { editable: false } });
    store.insertEdge({ source: 'page:test/page', target: 'field:test/page/f1', type: 'contains' });
    store.insertEdge({ source: 'page:test/page', target: 'column:test/page/c1', type: 'contains' });
    store.close();

    const result = await runValidate(dbPath);
    expect(result.hasIssues).toBe(false);
    expect(result.consistency.totalIssues).toBe(0);
  });

  it('returns issues for incomplete page', async () => {
    const store = createStore(dbPath);
    store.insertNode({ id: 'page:test/page', type: 'page', name: 'page', title: 'Page', summary: '', tags: [], module: 'test' });
    store.close();

    const result = await runValidate(dbPath);
    expect(result.hasIssues).toBe(true);
    expect(result.consistency.totalIssues).toBeGreaterThan(0);
  });

  it('includes mapping report when codeDir and routesFile provided', async () => {
    const store = createStore(dbPath);
    store.insertNode({
      id: 'page:test-module/simple-page',
      type: 'page',
      name: 'simple-page',
      title: 'Simple Page',
      summary: '',
      tags: [],
      module: 'test-module',
      meta: { route: '/test/page', pageType: 'list' },
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
