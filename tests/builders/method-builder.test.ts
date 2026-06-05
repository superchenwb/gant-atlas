import { describe, it, expect } from 'vitest';
import { MethodParser } from '../../src/builders/method-builder.js';

describe('MethodParser', () => {
  const parser = new MethodParser();

  it('canHandle matches hooks directory', () => {
    expect(parser.canHandle('/project/hooks/useAuth.ts')).toBe(true);
    expect(parser.canHandle('/project/utils/formatDate.ts')).toBe(true);
    expect(parser.canHandle('/project/pages/list.ts')).toBe(false);
  });

  it('returns empty for non-existent file', async () => {
    const result = await parser.parse('/nonexistent/hooks/useAuth.md');
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
