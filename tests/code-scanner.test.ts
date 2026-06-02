import { describe, it, expect } from 'vitest';
import { scanRoutes, scanSchema, scanServices, resolveComponentPath } from '../src/code-scanner.js';
import { join } from 'path';

describe('scanRoutes', () => {
  it('extracts route mappings from JS object format', () => {
    const routesFile = join(process.cwd(), 'tests', 'fixtures', 'routes-maps.ts');
    const routes = scanRoutes(routesFile);
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/**/simple-page', component: '@simple-page' }),
      ])
    );
  });
});

describe('scanSchema', () => {
  it('extracts search fields and grid columns', () => {
    const schemaFile = join(process.cwd(), 'tests', 'fixtures', 'test-module', 'simple-page', 'schema.ts');
    const result = scanSchema(schemaFile);

    expect(result.fields.length).toBe(2);
    expect(result.fields[0]).toEqual({ name: 'userName', title: '用户名' });
    expect(result.fields[1]).toEqual({ name: 'status', title: '状态' });

    expect(result.columns.length).toBe(2);
    expect(result.columns[0]).toEqual({ fieldName: 'userName', title: '用户名' });
    expect(result.columns[1]).toEqual({ fieldName: 'status', title: '状态标签' });
  });
});

describe('scanServices', () => {
  it('extracts API function names', () => {
    const servicesFile = join(process.cwd(), 'tests', 'fixtures', 'test-module', 'simple-page', 'services.ts');
    const apis = scanServices(servicesFile);

    expect(apis).toContain('simplePageFindListApi');
    expect(apis).toContain('simplePageSaveApi');
    expect(apis.length).toBe(2);
  });

  it('ignores non-Api suffixed functions', () => {
    const servicesFile = join(process.cwd(), 'tests', 'fixtures', 'test-module', 'simple-page', 'services.ts');
    const apis = scanServices(servicesFile);

    expect(apis).not.toContain('helperFunction');
    expect(apis).not.toContain('DataAuthGroupFindListApi');
  });
});

describe('resolveComponentPath', () => {
  it('resolves @alias paths', () => {
    const codeDir = join(process.cwd(), 'tests', 'fixtures', 'test-module');
    const resolved = resolveComponentPath('@simple-page/page-a', codeDir);
    expect(resolved).toBe(join(codeDir, 'simple-page', 'page-a'));
  });

  it('resolves @@ibom alias to codeDir root', () => {
    const codeDir = join(process.cwd(), 'tests', 'fixtures', 'test-module');
    // @@ibom/simple-page/page-a -> simple-page/page-a (ibom prefix stripped)
    const resolved = resolveComponentPath('@@ibom/simple-page/page-a', codeDir);
    expect(resolved).toBe(join(codeDir, 'simple-page', 'page-a'));
  });

  it('resolves @ibom/src prefix', () => {
    const codeDir = join(process.cwd(), 'tests', 'fixtures', 'test-module');
    // @ibom/src/simple-page -> simple-page (ibom/src prefix stripped)
    const resolved = resolveComponentPath('@ibom/src/simple-page', codeDir);
    expect(resolved).toBe(join(codeDir, 'simple-page'));
  });

  it('returns null for non-existent paths', () => {
    const resolved = resolveComponentPath('@nonexistent/page', '/tmp');
    expect(resolved).toBeNull();
  });
});

import { createStore } from '../src/store/sqlite.js';
import { buildMapping } from '../src/code-scanner.js';
import { rmSync } from 'fs';

describe('buildMapping', () => {
  const dbPath = join(process.cwd(), 'tests', 'scanner-test.db');
  const fixturesDir = join(process.cwd(), 'tests', 'fixtures');
  const routesFile = join(fixturesDir, 'routes-maps.ts');

  it('builds mapping between code and spec', () => {
    const store = createStore(dbPath);

    // Insert matching spec page
    store.insertPage({
      id: 'test-module/simple-page',
      module: 'test-module',
      pageName: 'simple-page',
      pageTitle: 'Simple Page',
      pageType: 'list',
      route: '/test/page',
    });
    store.insertField({
      id: 'test-module/simple-page/field/0',
      pageId: 'test-module/simple-page',
      fieldLabel: '用户名',
      fieldName: 'userName',
      componentType: 'Input',
      required: true,
    });
    store.insertField({
      id: 'test-module/simple-page/field/1',
      pageId: 'test-module/simple-page',
      fieldLabel: '状态',
      fieldName: 'status',
      componentType: 'Select',
      required: false,
    });
    store.insertAPI({ id: 'api/simplePageFindListApi', name: 'simplePageFindListApi' });
    store.insertAPI({ id: 'api/simplePageSaveApi', name: 'simplePageSaveApi' });
    store.insertPageAPI('test-module/simple-page', 'api/simplePageFindListApi');
    store.insertPageAPI('test-module/simple-page', 'api/simplePageSaveApi');

    const mapping = buildMapping(
      join(fixturesDir, 'test-module'),
      routesFile,
      store
    );

    store.db.close();
    try { rmSync(dbPath); } catch { /* ignore */ }

    expect(mapping.matchedPages.length).toBeGreaterThanOrEqual(1);
    const matched = mapping.matchedPages.find((p) => p.pageId === 'test-module/simple-page');
    expect(matched).toBeDefined();
    expect(matched!.matchedFields).toBe(2);
    expect(matched!.matchedApis).toBe(2);
  });
});
