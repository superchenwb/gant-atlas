import { parseMarkdown, extractKeyValueTable, findTablesByTitle, extractAPIReferences } from '../parser/markdown.js';
import type {
  Page,
  Field,
  GridColumn,
  Button,
  API,
  ParsedFeatureDoc,
} from '../types/index.js';
import { readdirSync, readFileSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { loadCustomYml, loadCustomYmlAsync, type CustomYmlConfig } from '../plugins/custom-yml.js';

/**
 * 遍历功能清单目录，构建完整的业务知识图谱（同步版本，向后兼容）
 */
export function buildGraph(docsPath: string): ParsedFeatureDoc[] {
  const modules = listModulesSync(docsPath);
  const docs: ParsedFeatureDoc[] = [];

  for (const module of modules) {
    const modulePath = join(docsPath, module);
    const pages = listPagesSync(modulePath);

    for (const page of pages) {
      const pagePath = join(modulePath, page);
      const doc = buildPageDocSync(module, page, pagePath);
      if (doc) docs.push(doc);
    }
  }

  return buildRelations(docs);
}

/**
 * 异步版本：使用 fs/promises 并发 I/O，千页级场景下显著提速
 */
export async function buildGraphAsync(docsPath: string): Promise<ParsedFeatureDoc[]> {
  const modules = await listModulesAsync(docsPath);
  const docs: ParsedFeatureDoc[] = [];

  await Promise.all(
    modules.map(async (module) => {
      const modulePath = join(docsPath, module);
      const pages = await listPagesAsync(modulePath);

      const pageDocs = await Promise.all(
        pages.map(async (page) => {
          const pagePath = join(modulePath, page);
          return buildPageDocAsync(module, page, pagePath);
        })
      );

      for (const doc of pageDocs) {
        if (doc) docs.push(doc);
      }
    })
  );

  return buildRelations(docs);
}

function resolveFileName(
  files: string[],
  custom: CustomYmlConfig | null,
  key: 'main' | 'search' | 'grid' | 'button',
  defaultName: string
): string | undefined {
  const configuredName = custom?.files?.[key];
  const targetName = configuredName || defaultName;
  return files.find((f) => f.toLowerCase() === targetName.toLowerCase());
}

function listModulesSync(docsPath: string): string[] {
  const entries = readdirSync(docsPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function listModulesAsync(docsPath: string): Promise<string[]> {
  const entries = await readdir(docsPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function listPagesSync(modulePath: string): string[] {
  const entries = readdirSync(modulePath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function listPagesAsync(modulePath: string): Promise<string[]> {
  const entries = await readdir(modulePath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function buildPageDocSync(module: string, pageName: string, pagePath: string): ParsedFeatureDoc | null {
  const files = readdirSync(pagePath);
  const custom = loadCustomYml(pagePath);

  const mainFile = resolveFileName(files, custom, 'main', 'main.md');
  if (!mainFile) return null;

  const page = parseMainSync(join(pagePath, mainFile), module, pageName, custom);
  const fields = parseSearchAreaSync(files, pagePath, page.id, custom);
  const columns = parseGridAreaSync(files, pagePath, page.id, custom);
  const buttons = parseButtonAreaSync(files, pagePath, page.id, custom);
  const apis = parseAPIsSync(files, pagePath, page.id);

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
      pageHasApis: [],
      fieldCallsApis: [],
      buttonTriggersModals: [],
    },
  };
}

async function buildPageDocAsync(module: string, pageName: string, pagePath: string): Promise<ParsedFeatureDoc | null> {
  const files = await readdir(pagePath);
  const custom = await loadCustomYmlAsync(pagePath);

  const mainFile = resolveFileName(files, custom, 'main', 'main.md');
  if (!mainFile) return null;

  const page = await parseMainAsync(join(pagePath, mainFile), module, pageName, custom);

  const [fields, columns, buttons, apis] = await Promise.all([
    parseSearchAreaAsync(files, pagePath, page.id, custom),
    parseGridAreaAsync(files, pagePath, page.id, custom),
    parseButtonAreaAsync(files, pagePath, page.id, custom),
    parseAPIsAsync(files, pagePath, page.id),
  ]);

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
      pageHasApis: [],
      fieldCallsApis: [],
      buttonTriggersModals: [],
    },
  };
}

function parseMainSync(filePath: string, module: string, pageName: string, custom?: CustomYmlConfig | null): Page {
  const raw = readFileSync(filePath, 'utf-8');
  return parseMainContent(raw, module, pageName, custom);
}

async function parseMainAsync(filePath: string, module: string, pageName: string, custom?: CustomYmlConfig | null): Promise<Page> {
  const raw = await readFile(filePath, 'utf-8');
  return parseMainContent(raw, module, pageName, custom);
}

function parseMainContent(raw: string, module: string, pageName: string, custom?: CustomYmlConfig | null): Page {
  const parsed = parseMarkdown(raw);

  const kv = extractKeyValueTable(findTablesByTitle(parsed.tables, '概述')[0] || parsed.tables[0]);
  const routeMatch = raw.match(/- 路径:\s*(.+)/);

  return {
    id: `${module}/${pageName}`,
    module,
    pageName,
    pageTitle: custom?.pageTitle ?? parsed.title ?? pageName,
    pageType: custom?.pageType ?? kv['页面类型'],
    route: custom?.route ?? routeMatch?.[1]?.trim() ?? kv['路径'],
    pageFunction: custom?.pageFunction ?? kv['页面功能'],
  };
}

function isKeyValueTable(table: { headers: string[]; rows: Record<string, string>[] }): boolean {
  const firstHeader = table.headers[0]?.trim().toLowerCase();
  return firstHeader === '属性' || firstHeader === 'key';
}

interface ParseAreaOptions<T> {
  fileName: string;
  fileKey: 'main' | 'search' | 'grid' | 'button';
  idPrefix: string;
  fromKV: (kv: Record<string, string>) => T | null;
  fromRow: (row: Record<string, string>) => T | null;
}

function parseAreaSync<T>(
  files: string[],
  pagePath: string,
  pageId: string,
  options: ParseAreaOptions<T>,
  custom?: CustomYmlConfig | null
): T[] {
  const fileName = custom?.files?.[options.fileKey] || options.fileName;
  const file = files.find((f) => f.toLowerCase() === fileName.toLowerCase());
  if (!file) return [];

  const raw = readFileSync(join(pagePath, file), 'utf-8');
  return parseAreaContent(raw, pageId, options);
}

async function parseAreaAsync<T>(
  files: string[],
  pagePath: string,
  pageId: string,
  options: ParseAreaOptions<T>,
  custom?: CustomYmlConfig | null
): Promise<T[]> {
  const fileName = custom?.files?.[options.fileKey] || options.fileName;
  const file = files.find((f) => f.toLowerCase() === fileName.toLowerCase());
  if (!file) return [];

  const raw = await readFile(join(pagePath, file), 'utf-8');
  return parseAreaContent(raw, pageId, options);
}

function parseAreaContent<T>(raw: string, pageId: string, options: ParseAreaOptions<T>): T[] {
  const parsed = parseMarkdown(raw);

  const items: T[] = [];
  for (const table of parsed.tables) {
    if (table.rows.length === 0) continue;

    if (isKeyValueTable(table)) {
      const kv = extractKeyValueTable(table);
      if (Object.keys(kv).length === 0) continue;

      const item = options.fromKV(kv);
      if (item) {
        (item as Record<string, unknown>).id = `${pageId}/${options.idPrefix}/${items.length}`;
        (item as Record<string, unknown>).pageId = pageId;
        items.push(item);
      }
    } else {
      for (const row of table.rows) {
        const item = options.fromRow(row);
        if (item) {
          (item as Record<string, unknown>).id = `${pageId}/${options.idPrefix}/${items.length}`;
          (item as Record<string, unknown>).pageId = pageId;
          items.push(item);
        }
      }
    }
  }

  return items;
}

function parseSearchAreaSync(files: string[], pagePath: string, pageId: string, custom?: CustomYmlConfig | null): Field[] {
  return parseAreaSync<Field>(files, pagePath, pageId, {
    fileName: 'search-area.md',
    fileKey: 'search',
    idPrefix: 'field',
    fromKV(kv) {
      const fieldLabel = kv['字段标签'] || kv['列名'] || '';
      const fieldName = kv['参数名'] || kv['字段名'] || '';
      if (!fieldLabel && !fieldName) return null;
      return {
        id: '',
        pageId: '',
        fieldLabel,
        fieldName,
        componentType: kv['控件类型'] || '',
        required: (kv['必填'] || '').trim() === '是',
        defaultValue: kv['默认值'] || undefined,
      };
    },
    fromRow(row) {
      const fieldLabel = row['字段标签'] || row['列名'] || '';
      const fieldName = row['参数名'] || row['字段名'] || '';
      if (!fieldLabel && !fieldName) return null;
      return {
        id: '',
        pageId: '',
        fieldLabel,
        fieldName,
        componentType: row['控件类型'] || '',
        required: (row['必填'] || '').trim() === '是',
        defaultValue: row['默认值'] || undefined,
      };
    },
  }, custom);
}

async function parseSearchAreaAsync(files: string[], pagePath: string, pageId: string, custom?: CustomYmlConfig | null): Promise<Field[]> {
  return parseAreaAsync<Field>(files, pagePath, pageId, {
    fileName: 'search-area.md',
    fileKey: 'search',
    idPrefix: 'field',
    fromKV(kv) {
      const fieldLabel = kv['字段标签'] || kv['列名'] || '';
      const fieldName = kv['参数名'] || kv['字段名'] || '';
      if (!fieldLabel && !fieldName) return null;
      return {
        id: '',
        pageId: '',
        fieldLabel,
        fieldName,
        componentType: kv['控件类型'] || '',
        required: (kv['必填'] || '').trim() === '是',
        defaultValue: kv['默认值'] || undefined,
      };
    },
    fromRow(row) {
      const fieldLabel = row['字段标签'] || row['列名'] || '';
      const fieldName = row['参数名'] || row['字段名'] || '';
      if (!fieldLabel && !fieldName) return null;
      return {
        id: '',
        pageId: '',
        fieldLabel,
        fieldName,
        componentType: row['控件类型'] || '',
        required: (row['必填'] || '').trim() === '是',
        defaultValue: row['默认值'] || undefined,
      };
    },
  }, custom);
}

function parseGridAreaSync(files: string[], pagePath: string, pageId: string, custom?: CustomYmlConfig | null): GridColumn[] {
  return parseAreaSync<GridColumn>(files, pagePath, pageId, {
    fileName: 'grid-area.md',
    fileKey: 'grid',
    idPrefix: 'column',
    fromKV(kv) {
      const columnTitle = kv['列标题'] || kv['列名'] || '';
      if (!columnTitle) return null;

      const widthRaw = kv['宽度'] || kv['列宽'];
      const width = widthRaw ? parseInt(widthRaw, 10) : undefined;
      const safeWidth = width && !isNaN(width) ? width : undefined;

      return {
        id: '',
        pageId: '',
        columnTitle,
        fieldName: kv['字段名'],
        displayContent: kv['展示内容'] || kv['显示内容'] || columnTitle,
        editable: (kv['是否可编辑'] || kv['可编辑'] || '').trim() === '是',
        width: safeWidth,
        sortable: (kv['排序'] || '').trim() === '是',
        dataType: kv['数据类型'],
        align: (kv['对齐'] as 'left' | 'center' | 'right') || undefined,
      };
    },
    fromRow(row) {
      const columnTitle = row['列名'] || '';
      if (!columnTitle) return null;

      const widthRaw = row['宽度'];
      const width = widthRaw ? parseInt(widthRaw, 10) : undefined;
      const safeWidth = width && !isNaN(width) ? width : undefined;

      return {
        id: '',
        pageId: '',
        columnTitle,
        fieldName: row['字段名'],
        displayContent: row['显示内容'] || columnTitle,
        editable: (row['可编辑'] || '').trim() === '是',
        width: safeWidth,
        sortable: (row['排序'] || '').trim() === '是',
        dataType: row['数据类型'],
        align: row['对齐'] as 'left' | 'center' | 'right' | undefined,
      };
    },
  }, custom);
}

async function parseGridAreaAsync(files: string[], pagePath: string, pageId: string, custom?: CustomYmlConfig | null): Promise<GridColumn[]> {
  return parseAreaAsync<GridColumn>(files, pagePath, pageId, {
    fileName: 'grid-area.md',
    fileKey: 'grid',
    idPrefix: 'column',
    fromKV(kv) {
      const columnTitle = kv['列标题'] || kv['列名'] || '';
      if (!columnTitle) return null;

      const widthRaw = kv['宽度'] || kv['列宽'];
      const width = widthRaw ? parseInt(widthRaw, 10) : undefined;
      const safeWidth = width && !isNaN(width) ? width : undefined;

      return {
        id: '',
        pageId: '',
        columnTitle,
        fieldName: kv['字段名'],
        displayContent: kv['展示内容'] || kv['显示内容'] || columnTitle,
        editable: (kv['是否可编辑'] || kv['可编辑'] || '').trim() === '是',
        width: safeWidth,
        sortable: (kv['排序'] || '').trim() === '是',
        dataType: kv['数据类型'],
        align: (kv['对齐'] as 'left' | 'center' | 'right') || undefined,
      };
    },
    fromRow(row) {
      const columnTitle = row['列名'] || '';
      if (!columnTitle) return null;

      const widthRaw = row['宽度'];
      const width = widthRaw ? parseInt(widthRaw, 10) : undefined;
      const safeWidth = width && !isNaN(width) ? width : undefined;

      return {
        id: '',
        pageId: '',
        columnTitle,
        fieldName: row['字段名'],
        displayContent: row['显示内容'] || columnTitle,
        editable: (row['可编辑'] || '').trim() === '是',
        width: safeWidth,
        sortable: (row['排序'] || '').trim() === '是',
        dataType: row['数据类型'],
        align: row['对齐'] as 'left' | 'center' | 'right' | undefined,
      };
    },
  }, custom);
}

function parseButtonAreaSync(files: string[], pagePath: string, pageId: string, custom?: CustomYmlConfig | null): Button[] {
  return parseAreaSync<Button>(files, pagePath, pageId, {
    fileName: 'button-area.md',
    fileKey: 'button',
    idPrefix: 'button',
    fromKV(kv) {
      const buttonName = kv['按钮名称'] || kv['操作名称'] || '';
      if (!buttonName) return null;
      return {
        id: '',
        pageId: '',
        buttonName,
        scope: kv['作用域'] || kv['操作类型'] || '',
        position: kv['位置'] || '',
        displayCondition: kv['显示条件'] || '',
        disabledCondition: kv['禁用条件'] || '',
        clickResult: kv['点击结果'] || kv['关联操作'] || '',
        confirmRequired: (kv['确认弹窗'] || '').trim() === '是',
      };
    },
    fromRow(row) {
      const buttonName = row['按钮名称'] || '';
      if (!buttonName) return null;
      return {
        id: '',
        pageId: '',
        buttonName,
        scope: row['作用域'] || row['操作类型'] || '',
        position: row['位置'] || '',
        displayCondition: row['显示条件'] || '',
        disabledCondition: row['禁用条件'] || '',
        clickResult: row['点击结果'] || row['关联操作'] || '',
        confirmRequired: (row['确认弹窗'] || '').trim() === '是',
      };
    },
  }, custom);
}

async function parseButtonAreaAsync(files: string[], pagePath: string, pageId: string, custom?: CustomYmlConfig | null): Promise<Button[]> {
  return parseAreaAsync<Button>(files, pagePath, pageId, {
    fileName: 'button-area.md',
    fileKey: 'button',
    idPrefix: 'button',
    fromKV(kv) {
      const buttonName = kv['按钮名称'] || kv['操作名称'] || '';
      if (!buttonName) return null;
      return {
        id: '',
        pageId: '',
        buttonName,
        scope: kv['作用域'] || kv['操作类型'] || '',
        position: kv['位置'] || '',
        displayCondition: kv['显示条件'] || '',
        disabledCondition: kv['禁用条件'] || '',
        clickResult: kv['点击结果'] || kv['关联操作'] || '',
        confirmRequired: (kv['确认弹窗'] || '').trim() === '是',
      };
    },
    fromRow(row) {
      const buttonName = row['按钮名称'] || '';
      if (!buttonName) return null;
      return {
        id: '',
        pageId: '',
        buttonName,
        scope: row['作用域'] || row['操作类型'] || '',
        position: row['位置'] || '',
        displayCondition: row['显示条件'] || '',
        disabledCondition: row['禁用条件'] || '',
        clickResult: row['点击结果'] || row['关联操作'] || '',
        confirmRequired: (row['确认弹窗'] || '').trim() === '是',
      };
    },
  }, custom);
}

function parseAPIsSync(files: string[], pagePath: string, _pageId: string): API[] {
  const apiNames = new Set<string>();

  for (const file of files) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const raw = readFileSync(join(pagePath, file), 'utf-8');
    for (const name of extractAPIReferences(raw)) {
      apiNames.add(name);
    }
  }

  return Array.from(apiNames).map((name) => ({
    id: `api/${name}`,
    name,
    description: undefined,
  }));
}

async function parseAPIsAsync(files: string[], pagePath: string, _pageId: string): Promise<API[]> {
  const apiNames = new Set<string>();

  await Promise.all(
    files.map(async (file) => {
      if (!file.toLowerCase().endsWith('.md')) return;
      const raw = await readFile(join(pagePath, file), 'utf-8');
      for (const name of extractAPIReferences(raw)) {
        apiNames.add(name);
      }
    })
  );

  return Array.from(apiNames).map((name) => ({
    id: `api/${name}`,
    name,
    description: undefined,
  }));
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

    // Map page -> API if API is mentioned in the page
    for (const api of doc.apis) {
      const resolvedApi = apiMap.get(api.name);
      if (resolvedApi) {
        doc.relations.pageHasApis.push({ pageId: page.id, apiId: resolvedApi.id });
      }
    }

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
