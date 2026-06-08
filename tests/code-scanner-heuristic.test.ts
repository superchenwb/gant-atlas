import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { scanPageDir } from '../src/code-scanner.js';

const TMP_DIR = join(process.cwd(), '.tmp-heuristic-test');

describe('scanPageDir heuristic file detection', () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('finds schema.ts with conventional name', async () => {
    const pageDir = join(TMP_DIR, 'pageA');
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, 'schema.ts'), `
      export const searchSchema = { userName: { title: '用户名' } };
      export const gridSchema = [{ fieldName: 'userName', title: '用户名' }];
    `);
    writeFileSync(join(pageDir, 'services.ts'), `
      export const pageAFindListApi = (params: any) => {};
    `);

    const info = await scanPageDir(pageDir, 'test', 'pageA');
    expect(info.fields).toHaveLength(1);
    expect(info.fields[0].name).toBe('userName');
    expect(info.columns).toHaveLength(1);
    expect(info.apis).toContain('pageAFindListApi');
  });

  it('finds schema.tsx when schema.ts does not exist', async () => {
    const pageDir = join(TMP_DIR, 'pageB');
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, 'schema.tsx'), `
      export const searchSchema = { status: { title: '状态' } };
      export const gridSchema = [{ fieldName: 'status', title: '状态' }];
    `);
    writeFileSync(join(pageDir, 'api.ts'), `
      export const pageBFindListApi = () => {};
    `);

    const info = await scanPageDir(pageDir, 'test', 'pageB');
    expect(info.fields).toHaveLength(1);
    expect(info.fields[0].name).toBe('status');
    expect(info.apis).toContain('pageBFindListApi');
  });

  it('finds schema by content when filename is non-standard', async () => {
    const pageDir = join(TMP_DIR, 'pageC');
    mkdirSync(pageDir, { recursive: true });
    // Non-standard name: columns.ts instead of schema.ts
    writeFileSync(join(pageDir, 'columns.ts'), `
      export const searchSchema = { code: { title: '编码' } };
      export const gridSchema = [{ fieldName: 'code', title: '编码' }];
    `);
    writeFileSync(join(pageDir, 'http.ts'), `
      export const pageCSaveApi = () => {};
    `);

    const info = await scanPageDir(pageDir, 'test', 'pageC');
    expect(info.fields).toHaveLength(1);
    expect(info.fields[0].name).toBe('code');
    expect(info.apis).toContain('pageCSaveApi');
  });

  it('returns empty arrays when no schema/services found', async () => {
    const pageDir = join(TMP_DIR, 'pageD');
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, 'index.tsx'), `
      export default function PageD() { return <div />; }
    `);

    const info = await scanPageDir(pageDir, 'test', 'pageD');
    expect(info.fields).toHaveLength(0);
    expect(info.columns).toHaveLength(0);
    expect(info.apis).toHaveLength(0);
    // But buttons scan still runs on the directory
    expect(info.buttons).toEqual([]);
    expect(info.hooks).toEqual([]);
  });

  it('handles page directory that does not exist', async () => {
    const info = await scanPageDir('/nonexistent/path', 'test', 'ghost');
    expect(info.fields).toHaveLength(0);
    expect(info.apis).toHaveLength(0);
  });

  it('prefers conventional name over content match when both exist', async () => {
    const pageDir = join(TMP_DIR, 'pageE');
    mkdirSync(pageDir, { recursive: true });
    // Both schema.ts and another file with schema content
    writeFileSync(join(pageDir, 'schema.ts'), `
      export const searchSchema = { fromSchema: { title: 'Schema文件' } };
      export const gridSchema = [];
    `);
    writeFileSync(join(pageDir, 'definitions.ts'), `
      export const searchSchema = { fromDefs: { title: 'Definitions文件' } };
      export const gridSchema = [];
    `);

    const info = await scanPageDir(pageDir, 'test', 'pageE');
    // Should use schema.ts (conventional name), not definitions.ts
    expect(info.fields).toHaveLength(1);
    expect(info.fields[0].name).toBe('fromSchema');
  });
});
