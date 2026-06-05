import { describe, it, expect } from 'vitest';
import { ComponentParser } from '../../src/builders/component-builder.js';

describe('ComponentParser', () => {
  const parser = new ComponentParser();

  it('canHandle matches components directory', () => {
    expect(parser.canHandle('/project/components/Button')).toBe(true);
    expect(parser.canHandle('/project/pages/list')).toBe(false);
  });

  it('returns empty for non-existent directory', async () => {
    const result = await parser.parse('/nonexistent/components/Test');
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
