import { describe, it, expect } from 'vitest';
import { buildGraph } from '../../src/graph/builder.js';
import { join } from 'path';

describe('buildGraph', () => {
  it('builds graph from fixture docs', () => {
    const docsPath = join(process.cwd(), 'tests', 'fixtures');
    const result = buildGraph(docsPath);
    expect(result.length).toBeGreaterThan(0);

    const doc = result[0];
    expect(doc.page).toBeDefined();
    expect(doc.fields.length).toBeGreaterThan(0);
    expect(doc.columns.length).toBeGreaterThan(0);
    expect(doc.buttons.length).toBeGreaterThan(0);
  });

  it('assigns correct page id', () => {
    const docsPath = join(process.cwd(), 'tests', 'fixtures');
    const result = buildGraph(docsPath);
    expect(result[0].page.id).toContain('simple-page');
  });
});
