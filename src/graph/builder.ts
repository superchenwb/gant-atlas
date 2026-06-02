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

function isKeyValueTable(table: { headers: string[]; rows: Record<string, string>[] }): boolean {
  const firstHeader = table.headers[0]?.trim().toLowerCase();
  return firstHeader === '属性' || firstHeader === 'key';
}

function parseSearchArea(files: string[], pagePath: string, pageId: string): Field[] {
  const file = files.find((f) => f.toLowerCase() === 'search-area.md');
  if (!file) return [];

  const raw = readFileSync(join(pagePath, file), 'utf-8');
  const parsed = parseMarkdown(raw);

  const fields: Field[] = [];
  for (const table of parsed.tables) {
    if (table.rows.length === 0) continue;

    if (isKeyValueTable(table)) {
      // yadea-wiki format: each table is a single field definition
      const kv = extractKeyValueTable(table);
      if (Object.keys(kv).length === 0) continue;

      const fieldLabel = kv['字段标签'] || kv['列名'] || '';
      const fieldName = kv['参数名'] || kv['字段名'] || '';
      if (!fieldLabel && !fieldName) continue;

      fields.push({
        id: `${pageId}/field/${fields.length}`,
        pageId,
        fieldLabel,
        fieldName,
        componentType: kv['控件类型'] || '',
        required: (kv['必填'] || '').trim() === '是',
        defaultValue: kv['默认值'],
      });
    } else {
      // Fixture format: flat table where each row is a field
      for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        const fieldLabel = row['字段标签'] || row['列名'] || '';
        const fieldName = row['参数名'] || row['字段名'] || '';
        if (!fieldLabel && !fieldName) continue;

        fields.push({
          id: `${pageId}/field/${fields.length}`,
          pageId,
          fieldLabel,
          fieldName,
          componentType: row['控件类型'] || '',
          required: (row['必填'] || '').trim() === '是',
          defaultValue: row['默认值'],
        });
      }
    }
  }

  return fields;
}

function parseGridArea(files: string[], pagePath: string, pageId: string): GridColumn[] {
  const file = files.find((f) => f.toLowerCase() === 'grid-area.md');
  if (!file) return [];

  const raw = readFileSync(join(pagePath, file), 'utf-8');
  const parsed = parseMarkdown(raw);

  const columns: GridColumn[] = [];
  for (const table of parsed.tables) {
    if (table.rows.length === 0) continue;

    if (isKeyValueTable(table)) {
      const kv = extractKeyValueTable(table);
      if (Object.keys(kv).length === 0) continue;

      const columnTitle = kv['列标题'] || kv['列名'] || '';
      if (!columnTitle) continue;

      const widthRaw = kv['宽度'] || kv['列宽'];
      const width = widthRaw ? parseInt(widthRaw, 10) : undefined;
      const safeWidth = width && !isNaN(width) ? width : undefined;

      columns.push({
        id: `${pageId}/column/${columns.length}`,
        pageId,
        columnTitle,
        fieldName: kv['字段名'],
        displayContent: kv['展示内容'] || kv['显示内容'] || columnTitle,
        editable: (kv['是否可编辑'] || kv['可编辑'] || '').trim() === '是',
        width: safeWidth,
        sortable: (kv['排序'] || '').trim() === '是',
        dataType: kv['数据类型'],
        align: (kv['对齐'] as 'left' | 'center' | 'right') || undefined,
      });
    } else {
      for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        const columnTitle = row['列名'] || '';
        if (!columnTitle) continue;

        const widthRaw = row['宽度'];
        const width = widthRaw ? parseInt(widthRaw, 10) : undefined;
        const safeWidth = width && !isNaN(width) ? width : undefined;

        columns.push({
          id: `${pageId}/column/${columns.length}`,
          pageId,
          columnTitle,
          fieldName: row['字段名'],
          displayContent: row['显示内容'] || columnTitle,
          editable: (row['可编辑'] || '').trim() === '是',
          width: safeWidth,
          sortable: (row['排序'] || '').trim() === '是',
          dataType: row['数据类型'],
          align: row['对齐'] as 'left' | 'center' | 'right' | undefined,
        });
      }
    }
  }

  return columns;
}

function parseButtonArea(files: string[], pagePath: string, pageId: string): Button[] {
  const file = files.find((f) => f.toLowerCase() === 'button-area.md');
  if (!file) return [];

  const raw = readFileSync(join(pagePath, file), 'utf-8');
  const parsed = parseMarkdown(raw);

  const buttons: Button[] = [];
  for (const table of parsed.tables) {
    if (table.rows.length === 0) continue;

    if (isKeyValueTable(table)) {
      const kv = extractKeyValueTable(table);
      if (Object.keys(kv).length === 0) continue;

      const buttonName = kv['按钮名称'] || kv['操作名称'] || '';
      if (!buttonName) continue;

      buttons.push({
        id: `${pageId}/button/${buttons.length}`,
        pageId,
        buttonName,
        scope: kv['作用域'] || kv['操作类型'] || '',
        position: kv['位置'] || '',
        displayCondition: kv['显示条件'] || '',
        disabledCondition: kv['禁用条件'] || '',
        clickResult: kv['点击结果'] || kv['关联操作'] || '',
        confirmRequired: (kv['确认弹窗'] || '').trim() === '是',
      });
    } else {
      for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        const buttonName = row['按钮名称'] || '';
        if (!buttonName) continue;

        buttons.push({
          id: `${pageId}/button/${buttons.length}`,
          pageId,
          buttonName,
          scope: row['作用域'] || row['操作类型'] || '',
          position: row['位置'] || '',
          displayCondition: row['显示条件'] || '',
          disabledCondition: row['禁用条件'] || '',
          clickResult: row['点击结果'] || row['关联操作'] || '',
          confirmRequired: (row['确认弹窗'] || '').trim() === '是',
        });
      }
    }
  }

  return buttons;
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
