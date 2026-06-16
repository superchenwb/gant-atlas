import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { rmSync } from 'fs';
import { runGenerate, runIngest, runQueryPage } from '../src/cli/actions.js';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures');

describe('CLI generate command', () => {
  const dbPath = join(process.cwd(), 'tests', 'cli-generate.db');
  const docsPath = join(process.cwd(), 'tests', 'cli-generated-docs');
  const routesFile = join(fixturesDir, 'routes-maps.ts');
  const codeDir = join(fixturesDir, 'test-module');

  afterEach(() => {
    try { rmSync(dbPath); } catch { /* ignore */ }
    try { rmSync(docsPath, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('generates feature-doc skeleton from code', async () => {
    const result = await runGenerate({
      codeDir,
      routesFile,
      docsPath,
      force: true,
    });

    expect(result.generated.length).toBeGreaterThan(0);
    expect(result.generated.some((f) => f.endsWith('main.md'))).toBe(true);
    expect(result.generated.some((f) => f.endsWith('search-area.md'))).toBe(true);
    expect(result.generated.some((f) => f.endsWith('grid-area.md'))).toBe(true);
    expect(result.generated.some((f) => f.endsWith('api-area.md'))).toBe(true);
  });

  it('generates docs that can be ingested and queried end-to-end', async () => {
    // Step 1: Generate Markdown from code
    const generateResult = await runGenerate({
      codeDir,
      routesFile,
      docsPath,
      force: true,
    });
    expect(generateResult.generated.length).toBeGreaterThan(0);

    // Step 2: Ingest generated docs into the graph database
    const ingestResult = await runIngest(docsPath, dbPath);
    expect(ingestResult.totalPages).toBeGreaterThanOrEqual(1);
    expect(ingestResult.updated).toBeGreaterThanOrEqual(1);

    // Step 3: Query the generated page spec
    const spec = runQueryPage('test-module/simple-page', dbPath);
    expect(spec).not.toBeNull();

    const { page, nodes, edges } = spec as {
      page: { title: string; id: string };
      nodes: Array<{ type: string; name: string; title: string }>;
      edges: Array<{ source: string; target: string; type: string }>;
    };

    expect(page.title).toBe('测试页面');

    const fieldNames = nodes.filter((n) => n.type === 'field').map((n) => n.name);
    expect(fieldNames).toContain('userName');
    expect(fieldNames).toContain('status');

    const columnNames = nodes.filter((n) => n.type === 'column').map((n) => n.name);
    expect(columnNames).toContain('userName');
    expect(columnNames).toContain('status');

    const buttonNames = nodes.filter((n) => n.type === 'button').map((n) => n.name);
    expect(buttonNames).toContain('新增');
    expect(buttonNames).toContain('删除');

    const apiNames = nodes.filter((n) => n.type === 'api').map((n) => n.name);
    expect(apiNames).toContain('simplePageFindListApi');
    expect(apiNames).toContain('simplePageSaveApi');

    // Verify page contains its children via edges
    const pageEdges = edges.filter((e) => e.source === page.id);
    expect(pageEdges.length).toBeGreaterThanOrEqual(4);
  });
});
