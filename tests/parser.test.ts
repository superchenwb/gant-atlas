import { describe, it, expect } from 'vitest';
import {
  parseMarkdown,
  splitCells,
  extractKeyValueTable,
  inferDocType,
} from '../src/parser/markdown.js';

describe('parseMarkdown', () => {
  it('parses title and sections', () => {
    const raw = '# Hello\n\n## Section A\nContent A\n\n## Section B\nContent B';
    const result = parseMarkdown(raw);
    expect(result.title).toBe('Hello');
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
  });

  it('parses tables with key-value rows', () => {
    const raw = `| Key | Value |
| --- | ----- |
| Name | Test |`;
    const result = parseMarkdown(raw);
    expect(result.tables.length).toBe(1);
    expect(result.tables[0].rows[0]['Key']).toBe('Name');
  });

  it('handles escaped pipes in cells', () => {
    const raw = `| ColA | ColB |
| ---- | ---- |
| a \\| b | c |`;
    const result = parseMarkdown(raw);
    expect(result.tables[0].rows[0]['ColA']).toBe('a | b');
  });

  it('handles unclosed backticks gracefully (T9)', () => {
    const raw = `| Col | Col2 |
| --- | ---- |
| \`open | val |`;
    // Should not throw; should parse with a warning logged
    const result = parseMarkdown(raw);
    expect(result.tables.length).toBe(1);
  });

  it('degrades gracefully on malformed tables (T8)', () => {
    const raw = `| A | B |
| bad row without separator
| 1 | 2 |`;
    const result = parseMarkdown(raw);
    // Should not throw; should continue parsing
    expect(result).toBeDefined();
  });
});

describe('splitCells', () => {
  it('splits basic cells', () => {
    expect(splitCells(' a | b | c ')).toEqual(['a', 'b', 'c']);
  });

  it('handles escaped pipes', () => {
    expect(splitCells('a \\| b | c')).toEqual(['a | b', 'c']);
  });

  it('respects backtick code spans', () => {
    expect(splitCells('`a | b` | c')).toEqual(['`a | b`', 'c']);
  });

  it('handles unclosed backticks by resetting state (T9)', () => {
    const cells = splitCells('`open | close`');
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });
});

describe('extractKeyValueTable', () => {
  it('extracts key-value pairs', () => {
    const table = {
      headers: ['Key', 'Value'],
      rows: [{ Key: 'name', Value: 'test' }],
    };
    expect(extractKeyValueTable(table)).toEqual({ name: 'test' });
  });
});

describe('inferDocType', () => {
  it('recognizes main.md', () => {
    expect(inferDocType('main.md')).toBe('main');
  });

  it('recognizes search-area.md', () => {
    expect(inferDocType('search-area.md')).toBe('search-area');
  });
});
