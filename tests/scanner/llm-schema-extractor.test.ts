import { describe, it, expect } from 'vitest';
import { extractDynamicSchema } from '../../src/scanner/llm-schema-extractor.js';
import type { LlmClient } from '../../src/llm/client.js';
import { join } from 'path';

function mockLlmClient(response: string): LlmClient {
  return {
    async complete() {
      return response;
    },
  };
}

const fixtureSchema = join(process.cwd(), 'tests', 'fixtures', 'test-module', 'dynamic-detail-page', 'schema.ts');

describe('extractDynamicSchema', () => {
  it('returns empty result when no client is provided', async () => {
    const result = await extractDynamicSchema({ schemaFile: fixtureSchema });
    expect(result.fields).toEqual([]);
    expect(result.columns).toEqual([]);
    expect(result.notes).toContain('未配置 LLM 客户端，跳过动态 schema 提取。');
  });

  it('extracts fields and columns from mock LLM response', async () => {
    const client = mockLlmClient(JSON.stringify({
      fields: [
        { name: 'code', title: '编码', componentType: 'Input', group: 'base' },
        { name: 'name', title: '名称', componentType: 'Input', group: 'base' },
        { name: 'effectiveDate', title: '生效日期', componentType: 'DatePicker', group: 'base' },
      ],
      columns: [
        { fieldName: 'code', title: '编码', componentType: 'Text' },
        { fieldName: 'name', title: '名称', componentType: 'Text' },
      ],
      notes: ['动态 schema 提取完成'],
    }));

    const result = await extractDynamicSchema({ schemaFile: fixtureSchema, client });

    expect(result.fields.map((f) => f.name)).toEqual(['code', 'name', 'effectiveDate']);
    expect(result.fields.find((f) => f.name === 'effectiveDate')?.title).toBe('生效日期');
    expect(result.columns.map((c) => c.fieldName)).toEqual(['code', 'name']);
    expect(result.notes).toContain('动态 schema 提取完成');
  });

  it('deduplicates fields and columns from LLM response', async () => {
    const client = mockLlmClient(JSON.stringify({
      fields: [
        { name: 'code', title: '编码' },
        { name: 'code', title: '编码重复' },
      ],
      columns: [
        { fieldName: 'code', title: '编码' },
        { fieldName: 'code', title: '编码重复' },
      ],
    }));

    const result = await extractDynamicSchema({ schemaFile: fixtureSchema, client });
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].title).toBe('编码');
    expect(result.columns).toHaveLength(1);
  });

  it('handles markdown fenced LLM response', async () => {
    const client = mockLlmClient(`\`\`\`json\n${JSON.stringify({
      fields: [{ name: 'code', title: '编码' }],
      columns: [],
      notes: [],
    })}\n\`\`\``);

    const result = await extractDynamicSchema({ schemaFile: fixtureSchema, client });
    expect(result.fields).toHaveLength(1);
  });

  it('gracefully handles invalid JSON from LLM', async () => {
    const client = mockLlmClient('这不是 JSON');
    const result = await extractDynamicSchema({ schemaFile: fixtureSchema, client });
    expect(result.fields).toEqual([]);
    expect(result.columns).toEqual([]);
    expect(result.notes).toContain('LLM fallback 未解析出字段或列。');
  });

  it('gracefully handles LLM client errors', async () => {
    const client: LlmClient = {
      async complete() {
        throw new Error('网络错误');
      },
    };
    const result = await extractDynamicSchema({ schemaFile: fixtureSchema, client });
    expect(result.fields).toEqual([]);
    expect(result.columns).toEqual([]);
    expect(result.notes.some((n) => n.includes('LLM fallback 失败'))).toBe(true);
  });
});
