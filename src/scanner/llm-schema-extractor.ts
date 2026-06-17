/**
 * 动态 schema LLM fallback 提取器
 *
 * 当静态正则 / AST 无法从函数式 schema（如 getBomFormSchema、useSchemaByBomType）
 * 中提取字段时，将相关源码片段交给 LLM 解析，返回结构化的字段 / 列表列。
 *
 * 设计原则：
 * 1. 仅在检测到动态 schema 函数且静态提取为空时才调用 LLM，避免浪费 token。
 * 2. 无 LLM 客户端时静默降级，返回空结果与提示。
 * 3. 输出通过轻量 JSON 解析 + 去重，保持与 code-scanner 类型兼容。
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, extname, join, basename } from 'path';
import type { LlmClient } from '../llm/client.js';
import type { SchemaColumn, SchemaField } from './types.js';

export interface DynamicSchemaResult {
  fields: SchemaField[];
  columns: SchemaColumn[];
  notes: string[];
}

export interface LlmSchemaExtractorOptions {
  /** schema 文件入口路径 */
  schemaFile: string;
  /** 页面类型，用于提示 LLM 侧重字段或列 */
  pageType?: string;
  /** LLM 客户端，测试可注入 mock */
  client?: LlmClient;
  /** 每次请求最大 token（默认 4096） */
  maxTokens?: number;
}

const DYNAMIC_SCHEMA_PATTERNS = [
  // export const getBomFormSchema = (...) => ...
  /export\s+(?:const|function)\s+(?:get|use)[A-Z]\w*Schema\b/,
  // const useSchemaByBomType = (...) => ...
  /(?:const|function)\s+(?:get|use)[A-Z]\w*Schema\b/,
  // schema = useMemo(() => getXxxSchema(...), [...])
  /schema\s*=\s*useMemo\s*\(\s*\(\)\s*=>\s*(?:get|use)[A-Z]\w*Schema/,
];

const MAX_TOTAL_CHARS = 50000;

function hasDynamicSchemaFunction(content: string): boolean {
  return DYNAMIC_SCHEMA_PATTERNS.some((p) => p.test(content));
}

function isSourceFile(name: string): boolean {
  const ext = extname(name);
  return (ext === '.ts' || ext === '.tsx') && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx');
}

/**
 * 收集 schema 入口文件所在目录的所有源码文件，按与 schema 的相关度排序。
 */
function collectRelatedSourceFiles(schemaFile: string): string[] {
  const dir = dirname(schemaFile);
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [schemaFile];
  }

  const files = entries
    .map((e) => join(dir, e))
    .filter((p) => {
      try {
        return statSync(p).isFile() && isSourceFile(basename(p));
      } catch {
        return false;
      }
    });

  // 优先保留入口文件和文件名含 schema 的文件
  const scored = files.map((p) => {
    const base = basename(p).toLowerCase();
    let score = 0;
    if (p === schemaFile) score += 100;
    if (base.includes('schema')) score += 10;
    if (base.includes('common')) score += 5;
    return { path: p, score };
  });

  scored.sort((a, b) => b.score - a.score);

  let total = 0;
  const selected: string[] = [];
  for (const { path } of scored) {
    try {
      const size = statSync(path).size;
      if (total + size > MAX_TOTAL_CHARS && selected.length > 0) break;
      selected.push(path);
      total += size;
    } catch {
      // ignore
    }
  }

  return selected;
}

function buildPrompt(sources: Array<{ path: string; content: string }>, pageType?: string): { system: string; user: string } {
  const sourceText = sources
    .map((s) => `// File: ${s.path}\n${s.content}`)
    .join('\n\n');

  const system =
    '你是一名前端代码分析器，擅长从 TypeScript 源码中提取业务字段和表格列。' +
    '只输出严格 JSON，不要解释、不要 markdown 代码块。';

  const focusHint =
    pageType === 'page-detail'
      ? '该页面是详情页，请重点提取表单字段；表格列如有也一并提取。'
      : pageType === 'page-main'
        ? '该页面是列表页，请重点提取表格列；查询字段如有也一并提取。'
        : '请同时提取表单字段和表格列。';

  const user = `请分析以下页面 schema 源码片段，提取所有可能的业务字段和表格列。

${focusHint}

要求：
1. 字段（field）包含 name/key、title/label、componentType（如 Input、Select、DatePicker）。
2. 列（column）包含 fieldName、title、componentType。
3. 如果标题是 tr('中文')，使用其中的中文字符串作为 title。
4. 对于 switch/case、条件分支返回不同 schema 的函数，返回所有分支中可能出现的字段/列的并集。
5. 忽略 import 语句、样式文件、React 生命周期和纯工具函数。
6. 如果字段/列属于某个分组（如 baseInfo/vppsInfo/changeInfo/grid），在 group 字段中填写分组名。
7. 不确定 componentType 时，请根据上下文合理推断或留空字符串。
8. 只返回严格 JSON，不要任何解释。

返回格式：
{
  "fields": [
    { "name": "字段名", "title": "字段标题", "componentType": "Input", "group": "分组名" }
  ],
  "columns": [
    { "fieldName": "列字段名", "title": "列标题", "componentType": "Text", "group": "分组名" }
  ],
  "notes": ["任何有助于理解 schema 的简短说明"]
}

源码：

${sourceText}`;

  return { system, user };
}

function parseLlmJson(text: string): Partial<DynamicSchemaResult> {
  // 尝试去除 markdown 代码块围栏
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return {};
  }

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<DynamicSchemaResult>;
    return parsed;
  } catch {
    return {};
  }
}

function dedupeFields(fields: SchemaField[]): SchemaField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    const key = f.group ? `${f.group}.${f.name}` : f.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeColumns(columns: SchemaColumn[]): SchemaColumn[] {
  const seen = new Set<string>();
  return columns.filter((c) => {
    const key = c.group ? `${c.group}.${c.fieldName}` : c.fieldName;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 从动态 schema 函数中提取字段/列。
 *
 * 触发条件：
 * - schemaFile 包含 get/use...Schema 等动态函数签名；
 * - 调用方提供了 client。
 *
 * 未满足条件时返回空结果，不抛异常。
 */
export async function extractDynamicSchema(
  options: LlmSchemaExtractorOptions,
): Promise<DynamicSchemaResult> {
  const { schemaFile, pageType, client, maxTokens } = options;
  const result: DynamicSchemaResult = { fields: [], columns: [], notes: [] };

  if (!client) {
    result.notes.push('未配置 LLM 客户端，跳过动态 schema 提取。');
    return result;
  }

  let entryContent: string;
  try {
    entryContent = readFileSync(schemaFile, 'utf-8');
  } catch {
    result.notes.push(`无法读取 schema 文件: ${schemaFile}`);
    return result;
  }

  if (!hasDynamicSchemaFunction(entryContent)) {
    result.notes.push('未检测到动态 schema 函数，无需 LLM fallback。');
    return result;
  }

  const files = collectRelatedSourceFiles(schemaFile);
  const sources: Array<{ path: string; content: string }> = [];
  for (const path of files) {
    try {
      const content = readFileSync(path, 'utf-8');
      sources.push({ path, content });
    } catch {
      // ignore unreadable
    }
  }

  if (sources.length === 0) {
    result.notes.push('未找到可提交的 schema 源码片段。');
    return result;
  }

  const { system, user } = buildPrompt(sources, pageType);

  try {
    const text = await client.complete([{ role: 'user', content: user }], {
      system,
      maxTokens,
    });
    const parsed = parseLlmJson(text);

    if (Array.isArray(parsed.fields)) {
      result.fields = dedupeFields(parsed.fields as SchemaField[]);
    }
    if (Array.isArray(parsed.columns)) {
      result.columns = dedupeColumns(parsed.columns as SchemaColumn[]);
    }
    if (Array.isArray(parsed.notes)) {
      result.notes.push(...(parsed.notes as string[]));
    }

    if (result.fields.length === 0 && result.columns.length === 0) {
      result.notes.push('LLM fallback 未解析出字段或列。');
    } else {
      result.notes.push(`LLM fallback 提取到 ${result.fields.length} 个字段、${result.columns.length} 个列。`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.notes.push(`LLM fallback 失败: ${message}`);
  }

  return result;
}
