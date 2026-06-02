import { describe, it, expect } from 'vitest';
import {
  parseMarkdown,
  splitCells,
  extractKeyValueTable,
  extractAPIReferences,
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

describe('extractAPIReferences', () => {
  it('extracts API names with Api suffix', () => {
    const raw = '调用 dataAuthGroupFindListApi 查询列表，然后使用 dataAuthGroupSaveApi 保存。';
    const result = extractAPIReferences(raw);
    expect(result).toContain('dataAuthGroupFindListApi');
    expect(result).toContain('dataAuthGroupSaveApi');
    expect(result.length).toBe(2);
  });

  it('returns unique API names without duplicates', () => {
    const raw = 'dataAuthGroupFindListApi 被调用多次，dataAuthGroupFindListApi 再次调用。';
    const result = extractAPIReferences(raw);
    expect(result).toEqual(['dataAuthGroupFindListApi']);
  });

  it('ignores words without Api suffix', () => {
    const raw = '这是一个普通文本，没有 API 引用，只有一些普通单词 like hello world。';
    const result = extractAPIReferences(raw);
    expect(result.length).toBe(0);
  });

  it('ignores Api prefix words (must be camelCase starting with lowercase)', () => {
    const raw = 'ApiGateway 不是有效的，DataAuthGroupFindListApi 以大写开头也不匹配。';
    const result = extractAPIReferences(raw);
    expect(result).not.toContain('ApiGateway');
    expect(result).not.toContain('DataAuthGroupFindListApi');
    expect(result.length).toBe(0);
  });

  it('handles empty or whitespace-only input', () => {
    expect(extractAPIReferences('')).toEqual([]);
    expect(extractAPIReferences('   ')).toEqual([]);
  });

  it('extracts from markdown table content', () => {
    const raw = `| 场景 | 说明 |
|------|------|
| 查询 | 使用 userFindListApi 查询 |
| 保存 | 使用 userSaveApi 保存 |`;
    const result = extractAPIReferences(raw);
    expect(result).toContain('userFindListApi');
    expect(result).toContain('userSaveApi');
    expect(result.length).toBe(2);
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
