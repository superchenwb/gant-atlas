import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const TMP_DIR = join(process.cwd(), '.tmp-incremental-test');

const SCRIPTS_DIR = join(
  process.cwd(),
  'skills',
  'generate-docs',
  'scripts',
);

// Helper: create a fake page directory with source files
function createFakePage(pageDir: string, files: Record<string, string>) {
  mkdirSync(pageDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(pageDir, name), content);
  }
}

// Helper: compute expected hash (mirrors the script logic)
function computeExpectedHash(files: Record<string, string>): string {
  const hash = createHash('sha256');
  const sortedNames = Object.keys(files).sort();
  for (const name of sortedNames) {
    hash.update(name);
    hash.update(files[name]);
  }
  hash.update(`fileCount:${sortedNames.length}`);
  return hash.digest('hex');
}

describe('incremental-filter.mjs', () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('marks all pages as changed when no previous meta exists', () => {
    const pageDir = join(TMP_DIR, 'module', 'pageA');
    createFakePage(pageDir, {
      'schema.ts': 'export const searchSchema = {};',
      'index.tsx': 'export default function PageA() {}',
    });

    const pagesJson = join(TMP_DIR, 'pages.json');
    const metaJson = join(TMP_DIR, 'generate-meta.json');
    const outputPages = join(TMP_DIR, 'filtered-pages.json');
    const outputMeta = join(TMP_DIR, 'meta-staging.json');

    // Write pages.json with one page
    writeFileSync(
      pagesJson,
      JSON.stringify({
        totalPages: 1,
        pages: [{ pageId: 'module/pageA', pageDir }],
      }),
    );

    // Run incremental-filter without previous meta
    execSync(
      `node ${join(SCRIPTS_DIR, 'incremental-filter.mjs')} ${pagesJson} ${metaJson} ${outputPages} ${outputMeta}`,
    );

    const filtered = JSON.parse(
      require('fs').readFileSync(outputPages, 'utf-8'),
    );
    expect(filtered.totalPages).toBe(1);
    expect(filtered.pages).toHaveLength(1);
    expect(filtered.pages[0].pageId).toBe('module/pageA');
  });

  it('skips pages whose source hash has not changed', () => {
    const pageDirA = join(TMP_DIR, 'module', 'pageA');
    const pageDirB = join(TMP_DIR, 'module', 'pageB');
    createFakePage(pageDirA, {
      'schema.ts': 'export const searchSchema = {};',
    });
    createFakePage(pageDirB, {
      'schema.ts': 'export const searchSchema = {};',
    });

    const hashA = computeExpectedHash({
      'schema.ts': 'export const searchSchema = {};',
    });
    const hashB = computeExpectedHash({
      'schema.ts': 'export const searchSchema = {};',
    });

    const pagesJson = join(TMP_DIR, 'pages.json');
    const metaJson = join(TMP_DIR, 'generate-meta.json');
    const outputPages = join(TMP_DIR, 'filtered-pages.json');
    const outputMeta = join(TMP_DIR, 'meta-staging.json');

    writeFileSync(
      pagesJson,
      JSON.stringify({
        totalPages: 2,
        pages: [
          { pageId: 'module/pageA', pageDir: pageDirA },
          { pageId: 'module/pageB', pageDir: pageDirB },
        ],
      }),
    );

    // Previous meta: pageA unchanged, pageB has different hash (simulating change)
    writeFileSync(
      metaJson,
      JSON.stringify({
        version: 1,
        pages: {
          'module/pageA': { sourceHash: hashA, generatedAt: '2026-01-01T00:00:00Z' },
          'module/pageB': { sourceHash: 'old-hash-wrong', generatedAt: '2026-01-01T00:00:00Z' },
        },
      }),
    );

    execSync(
      `node ${join(SCRIPTS_DIR, 'incremental-filter.mjs')} ${pagesJson} ${metaJson} ${outputPages} ${outputMeta}`,
    );

    const filtered = JSON.parse(
      require('fs').readFileSync(outputPages, 'utf-8'),
    );
    expect(filtered.totalPages).toBe(1);
    expect(filtered.originalTotalPages).toBe(2);
    expect(filtered.skippedPages).toBe(1);
    expect(filtered.pages[0].pageId).toBe('module/pageB');
  });

  it('includes all pages with --full flag', () => {
    const pageDir = join(TMP_DIR, 'module', 'pageA');
    createFakePage(pageDir, { 'schema.ts': 'const x = 1;' });

    const hashA = computeExpectedHash({ 'schema.ts': 'const x = 1;' });

    const pagesJson = join(TMP_DIR, 'pages.json');
    const metaJson = join(TMP_DIR, 'generate-meta.json');
    const outputPages = join(TMP_DIR, 'filtered-pages.json');
    const outputMeta = join(TMP_DIR, 'meta-staging.json');

    writeFileSync(
      pagesJson,
      JSON.stringify({
        totalPages: 1,
        pages: [{ pageId: 'module/pageA', pageDir }],
      }),
    );

    // Previous meta with matching hash
    writeFileSync(
      metaJson,
      JSON.stringify({
        version: 1,
        pages: {
          'module/pageA': { sourceHash: hashA },
        },
      }),
    );

    execSync(
      `node ${join(SCRIPTS_DIR, 'incremental-filter.mjs')} ${pagesJson} ${metaJson} ${outputPages} ${outputMeta} --full`,
    );

    const filtered = JSON.parse(
      require('fs').readFileSync(outputPages, 'utf-8'),
    );
    expect(filtered.totalPages).toBe(1);
    expect(filtered.pages).toHaveLength(1);
  });
});

describe('compute-source-hash.mjs', () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('computes stable hash for same content', () => {
    const pageDir = join(TMP_DIR, 'page');
    createFakePage(pageDir, {
      'schema.ts': 'export const x = 1;',
      'index.tsx': 'export default function Page() {}',
    });

    const script = join(SCRIPTS_DIR, 'compute-source-hash.mjs');
    const result1 = execSync(`node ${script} ${pageDir}`).toString().trim();
    const result2 = execSync(`node ${script} ${pageDir}`).toString().trim();
    expect(result1).toBe(result2);
    expect(result1).toHaveLength(64); // SHA-256 hex
  });

  it('produces different hash when content changes', () => {
    const pageDir = join(TMP_DIR, 'page');
    createFakePage(pageDir, { 'schema.ts': 'const x = 1;' });

    const script = join(SCRIPTS_DIR, 'compute-source-hash.mjs');
    const hash1 = execSync(`node ${script} ${pageDir}`).toString().trim();

    // Modify content
    writeFileSync(join(pageDir, 'schema.ts'), 'const x = 2;');

    const hash2 = execSync(`node ${script} ${pageDir}`).toString().trim();
    expect(hash1).not.toBe(hash2);
  });

  it('ignores non-source files', () => {
    const pageDir = join(TMP_DIR, 'page');
    createFakePage(pageDir, {
      'schema.ts': 'const x = 1;',
      'readme.md': '# documentation',
      'style.css': '.foo { color: red; }',
    });

    const script = join(SCRIPTS_DIR, 'compute-source-hash.mjs');
    const hashWithExtras = execSync(`node ${script} ${pageDir}`).toString().trim();

    // Remove non-source files
    rmSync(join(pageDir, 'readme.md'));
    rmSync(join(pageDir, 'style.css'));

    const hashWithoutExtras = execSync(`node ${script} ${pageDir}`).toString().trim();
    expect(hashWithExtras).toBe(hashWithoutExtras);
  });
});

describe('update-generate-meta.mjs', () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('updates generatedAt for specified pages', () => {
    const metaJson = join(TMP_DIR, 'meta.json');

    // Write initial meta
    writeFileSync(
      metaJson,
      JSON.stringify({
        version: 1,
        pages: {
          'module/pageA': { sourceHash: 'abc123' },
          'module/pageB': { sourceHash: 'def456' },
        },
      }),
    );

    const script = join(SCRIPTS_DIR, 'update-generate-meta.mjs');
    execSync(`node ${script} ${metaJson} module/pageA`);

    const meta = JSON.parse(require('fs').readFileSync(metaJson, 'utf-8'));
    expect(meta.pages['module/pageA'].generatedAt).toBeTruthy();
    expect(meta.pages['module/pageB'].generatedAt).toBeUndefined();
    expect(meta.lastGeneratedAt).toBeTruthy();
  });
});
