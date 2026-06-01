import { parseMarkdown, extractKeyValueTable, findTablesByTitle } from '../parser/markdown.js';
import type {
  Page,
  Field,
  GridColumn,
  Button,
  API,
  ParsedFeatureDoc,
} from '../types/index.js';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 遍历功能清单目录，构建完整的业务知识图谱
 */
export function buildGraph(docsPath: string): ParsedFeatureDoc[] {
  const modules = listModules(docsPath);
  const docs: ParsedFeatureDoc[] = [];

  for (const module of modules) {
    const modulePath = join(docsPath, module);
    const pages = listPages(modulePath);

    for (const page of pages) {
      const pagePath = join(modulePath, page);
      const doc = buildPageDoc(module, page, pagePath);
      if (doc) docs.push(doc);
    }
  }

  return buildRelations(docs);
}

function listModules(docsPath: string): string[] {
  const entries = readdirSync(docsPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function listPages(modulePath: string): string[] {
  const entries = readdirSync(modulePath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function buildPageDoc(module: string, pageName: string, pagePath: string): ParsedFeatureDoc | null {
  const files = readdirSync(pagePath);
  const mainFile = files.find((f) => f.toLowerCase() === 'main.md');
  if (!mainFile) return null;

  const page = parseMain(join(pagePath, mainFile), module, pageName);
  const fields = parseSearchArea(files, pagePath, page.id);
  const columns = parseGridArea(files, pagePath, page.id);
  const buttons = parseButtonArea(files, pagePath, page.id);
  const apis = parseAPIs(page);

  return {
    page,
    fields,
    columns,
    buttons,
    apis,
    relations: {
      pageHasFields: [],
      pageHasColumns: [],
      pageHasButtons: [],
      fieldCallsApis: [],
      buttonTriggersModals: [],
    },
  };
}

function parseMain(filePath: string, module: string, pageName: string): Page {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parseMarkdown(raw);

  const kv = extractKeyValueTable(findTablesByTitle(parsed.tables, '概述')[0] || parsed.tables[0]);
  const routeMatch = raw.match(/- 路径:\s*(.+)/);

  return {
    id: `${module}/${pageName}`,
    module,
    pageName,
    pageTitle: parsed.title || pageName,
    pageType: kv['页面类型'],
    route: routeMatch?.[1]?.trim() || kv['路径'],
    pageFunction: kv['页面功能'],
  };
}

function parseSearchArea(files: string[], pagePath: string, pageId: string): Field[] {
  const file = files.find((f) => f.toLowerCase() === 'search-area.md');
  if (!file) return [];

  const raw = readFileSync(join(pagePath, file), 'utf-8');
  const parsed = parseMarkdown(raw);
  const table = parsed.tables[0];
  if (!table) return [];

  return table.rows.map((row, idx) => ({
    id: `${pageId}/field/${idx}`,
    pageId,
    fieldLabel: row['字段标签'] || row['列名'] || '',
    fieldName: row['参数名'] || row['字段名'] || '',
    componentType: row['控件类型'] || '',
    required: (row['必填'] || '').trim() === '是',
    defaultValue: row['默认值'],
  }));
}

function parseGridArea(files: string[], pagePath: string, pageId: string): GridColumn[] {
  const file = files.find((f) => f.toLowerCase() === 'grid-area.md');
  if (!file) return [];

  const raw = readFileSync(join(pagePath, file), 'utf-8');
  const parsed = parseMarkdown(raw);
  const table = parsed.tables[0];
  if (!table) return [];

  return table.rows.map((row, idx) => ({
    id: `${pageId}/column/${idx}`,
    pageId,
    columnTitle: row['列名'] || '',
    fieldName: row['字段名'],
    displayContent: row['显示内容'] || row['列名'] || '',
    editable: (row['可编辑'] || '').trim() === '是',
    width: row['宽度'] ? parseInt(row['宽度'], 10) : undefined,
    sortable: (row['排序'] || '').trim() === '是',
    dataType: row['数据类型'],
    align: row['对齐'] as 'left' | 'center' | 'right' | undefined,
  }));
}

function parseButtonArea(files: string[], pagePath: string, pageId: string): Button[] {
  const file = files.find((f) => f.toLowerCase() === 'button-area.md');
  if (!file) return [];

  const raw = readFileSync(join(pagePath, file), 'utf-8');
  const parsed = parseMarkdown(raw);
  const table = parsed.tables[0];
  if (!table) return [];

  return table.rows.map((row, idx) => ({
    id: `${pageId}/button/${idx}`,
    pageId,
    buttonName: row['按钮名称'] || '',
    scope: row['作用域'] || row['操作类型'] || '',
    position: row['位置'] || '',
    displayCondition: row['显示条件'] || '',
    disabledCondition: row['禁用条件'] || '',
    clickResult: row['点击结果'] || row['关联操作'] || '',
    confirmRequired: (row['确认弹窗'] || '').trim() === '是',
  }));
}

function parseAPIs(_page: Page): API[] {
  // APIs are extracted from main.md association table in a real implementation
  // For now, return empty — they will be populated from main.md parsing if present
  return [];
}

/**
 * Phase 2: 建立实体间关系，检测 orphan
 */
function buildRelations(docs: ParsedFeatureDoc[]): ParsedFeatureDoc[] {
  const apiMap = new Map<string, API>();
  for (const doc of docs) {
    for (const api of doc.apis) {
      apiMap.set(api.name, api);
    }
  }

  for (const doc of docs) {
    const { page, fields, columns, buttons } = doc;

    doc.relations.pageHasFields = fields.map((f) => ({ pageId: page.id, fieldId: f.id }));
    doc.relations.pageHasColumns = columns.map((c) => ({ pageId: page.id, columnId: c.id }));
    doc.relations.pageHasButtons = buttons.map((b) => ({ pageId: page.id, buttonId: b.id }));

    // Map field -> API if fieldName matches an API name
    for (const field of fields) {
      const api = apiMap.get(field.fieldName);
      if (api) {
        doc.relations.fieldCallsApis.push({ fieldId: field.id, apiId: api.id });
      }
    }
  }

  return docs;
}

export { buildRelations };
