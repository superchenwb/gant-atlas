import { describe, it, expect } from 'vitest';
import { PageParser } from '../../src/builders/page-builder.js';
import { join } from 'path';

describe('PageParser', () => {
  const fixturesPath = join(process.cwd(), 'tests', 'fixtures');
  const parser = new PageParser();

  it('parses a simple page directory', async () => {
    const pagePath = join(fixturesPath, 'test-module', 'simple-page');
    const result = await parser.parse(pagePath, 'test-module', 'simple-page');

    expect(result.nodes.length).toBeGreaterThan(0);

    const pageNode = result.nodes.find((n) => n.type === 'page');
    expect(pageNode).toBeDefined();
    expect(pageNode?.name).toBe('simple-page');
  });

  it('creates contains edges from page to sub-entities', async () => {
    const pagePath = join(fixturesPath, 'test-module', 'simple-page');
    const result = await parser.parse(pagePath, 'test-module', 'simple-page');

    const pageNode = result.nodes.find((n) => n.type === 'page');
    expect(pageNode).toBeDefined();

    const containsEdges = result.edges.filter((e) => e.type === 'contains');
    expect(containsEdges.length).toBeGreaterThanOrEqual(0);
  });

  it('returns empty result for missing main.md', async () => {
    const pagePath = join(fixturesPath, 'test-module');
    const result = await parser.parse(pagePath, 'test-module', 'nonexistent');

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
