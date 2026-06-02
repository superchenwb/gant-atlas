import { readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import type { Store } from './store/sqlite.js';

export interface RouteMapping {
  path: string;
  component: string;
  title?: string;
}

export interface PageCodeInfo {
  pageDir: string;
  module: string;
  pageName: string;
  route?: string;
  fields: Array<{ name: string; title?: string }>;
  columns: Array<{ fieldName: string; title?: string }>;
  apis: string[];
}

export interface CodeToSpecMapping {
  matchedPages: Array<{
    pageId: string;
    codeDir: string;
    route: string;
    matchedFields: number;
    totalCodeFields: number;
    totalSpecFields: number;
    matchedApis: number;
    totalCodeApis: number;
    totalSpecApis: number;
  }>;
  unmatchedCodePages: Array<{ codeDir: string; route: string; reason: string }>;
  unmatchedSpecPages: Array<{ pageId: string; pageTitle: string; reason: string }>;
  fieldMismatches: Array<{
    pageId: string;
    type: 'missing_in_doc' | 'missing_in_code';
    fieldName: string;
    location: string;
  }>;
  apiMismatches: Array<{
    pageId: string;
    type: 'missing_in_doc' | 'missing_in_code';
    apiName: string;
    location: string;
  }>;
}

/**
 * 从路由配置文件提取 route → component 映射
 * 支持 JS/TS 对象字面量格式，如 maps.ts
 */
export function scanRoutes(routesFile: string): RouteMapping[] {
  const raw = readFileSync(routesFile, 'utf-8');
  const mappings: RouteMapping[] = [];

  // Match entries like:
  //   path: '/**/dataauthgroup',
  //   title: '数据权限管理',
  //   component: '@bombusiness/dataauthgroup',
  const entryRegex = /path:\s*['"]([^'"]+)['"]\s*,\s*(?:title|name):\s*['"]([^'"]*)['"]\s*,\s*component:\s*['"]([^'"]+)['"]/g;

  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(raw)) !== null) {
    mappings.push({ path: m[1], title: m[2], component: m[3] });
  }

  // Also try without title/name (some entries only have name, not title)
  const simpleRegex = /path:\s*['"]([^'"]+)['"]\s*,\s*component:\s*['"]([^'"]+)['"]/g;
  while ((m = simpleRegex.exec(raw)) !== null) {
    // Avoid duplicates
    if (!mappings.some((r) => r.path === m![1] && r.component === m![2])) {
      mappings.push({ path: m[1], component: m[2] });
    }
  }

  return mappings;
}

/**
 * 从 schema.ts 提取字段定义
 */
export function scanSchema(schemaFile: string): {
  fields: Array<{ name: string; title?: string }>;
  columns: Array<{ fieldName: string; title?: string }>;
} {
  const raw = readFileSync(schemaFile, 'utf-8');

  const fields: Array<{ name: string; title?: string }> = [];
  const columns: Array<{ fieldName: string; title?: string }> = [];

  // Extract searchSchema fields: fieldName: { title: tr('...'), ... }
  const searchSchemaMatch = raw.match(/export\s+const\s+searchSchema\s*=\s*\{([\s\S]*?)\};/);
  if (searchSchemaMatch) {
    const searchBody = searchSchemaMatch[1];
    const fieldRegex = /(\w+):\s*\{[\s\S]*?title:\s*(?:tr\()?['"]([^'"]*)['"]/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRegex.exec(searchBody)) !== null) {
      fields.push({ name: fm[1], title: fm[2] });
    }
  }

  // Extract gridSchema columns: { fieldName: '...', title: tr('...'), ... }
  const gridSchemaMatch = raw.match(/export\s+const\s+gridSchema\s*=\s*(\[[\s\S]*?\]);/);
  if (gridSchemaMatch) {
    const gridBody = gridSchemaMatch[1];
    const colRegex = /\{[\s\S]*?fieldName:\s*['"]([^'"]*)['"][\s\S]*?title:\s*(?:tr\()?['"]([^'"]*)['"]/g;
    let cm: RegExpExecArray | null;
    while ((cm = colRegex.exec(gridBody)) !== null) {
      columns.push({ fieldName: cm[1], title: cm[2] });
    }
  }

  return { fields, columns };
}

/**
 * 从 services.ts 提取 API 函数名
 */
export function scanServices(servicesFile: string): string[] {
  const raw = readFileSync(servicesFile, 'utf-8');
  const apis: string[] = [];

  // Match: export const dataAuthGroupFindListApi = ...
  // or: export function dataAuthGroupFindListApi(...)
  // or: const dataAuthGroupFindListApi = ...
  const apiRegex = /(?:export\s+)?(?:const|function)\s+([a-z][a-zA-Z0-9]*Api)\s*(?:=|\()/g;

  let m: RegExpExecArray | null;
  while ((m = apiRegex.exec(raw)) !== null) {
    if (!apis.includes(m[1])) apis.push(m[1]);
  }

  return apis;
}

/**
 * 扫描单个页面代码目录
 */
export function scanPageDir(pageDir: string, module: string, pageName: string): PageCodeInfo {
  const info: PageCodeInfo = {
    pageDir,
    module,
    pageName,
    fields: [],
    columns: [],
    apis: [],
  };

  const schemaFile = join(pageDir, 'schema.ts');
  try {
    const schema = scanSchema(schemaFile);
    info.fields = schema.fields;
    info.columns = schema.columns;
  } catch {
    // schema.ts may not exist
  }

  const servicesFile = join(pageDir, 'services.ts');
  try {
    info.apis = scanServices(servicesFile);
  } catch {
    // services.ts may not exist
  }

  return info;
}

/**
 * 构建代码到功能清单的完整映射
 */
export function buildMapping(
  codeDir: string,
  routesFile: string,
  store: Store
): CodeToSpecMapping {
  const routes = scanRoutes(routesFile);
  const result: CodeToSpecMapping = {
    matchedPages: [],
    unmatchedCodePages: [],
    unmatchedSpecPages: [],
    fieldMismatches: [],
    apiMismatches: [],
  };

  // Get all pages from DB
  const allSpecPages = store.searchPages('', undefined);
  const matchedSpecPageIds = new Set<string>();
  const matchedCodeDirs = new Set<string>();

  for (const route of routes) {
    // Resolve component path to actual directory
    const componentPath = resolveComponentPath(route.component, codeDir);
    if (!componentPath) {
      result.unmatchedCodePages.push({
        codeDir: route.component,
        route: route.path,
        reason: '无法解析组件路径',
      });
      continue;
    }

    // Try to match by route pattern
    const pageName = basename(componentPath);
    const moduleName = basename(join(componentPath, '..'));
    const pageId = `${moduleName}/${pageName}`;

    const specPage = allSpecPages.find((p) => p.id === pageId);
    if (!specPage) {
      result.unmatchedCodePages.push({
        codeDir: componentPath,
        route: route.path,
        reason: `未找到对应的 feature-docs 页面 (尝试匹配 ${pageId})`,
      });
      continue;
    }

    matchedSpecPageIds.add(specPage.id);
    matchedCodeDirs.add(componentPath);

    // Scan code for this page
    const codeInfo = scanPageDir(componentPath, moduleName, pageName);

    // Get spec info
    const spec = store.getPageSpec(specPage.id);

    // Match fields
    const specFieldNames = new Set(spec.fields.map((f) => f.fieldName).filter(Boolean));
    const codeFieldNames = new Set(codeInfo.fields.map((f) => f.name));
    let matchedFields = 0;
    for (const cf of codeInfo.fields) {
      if (specFieldNames.has(cf.name)) {
        matchedFields++;
      } else {
        result.fieldMismatches.push({
          pageId: specPage.id,
          type: 'missing_in_doc',
          fieldName: cf.name,
          location: `${componentPath}/schema.ts`,
        });
      }
    }
    for (const sf of spec.fields) {
      if (sf.fieldName && !codeFieldNames.has(sf.fieldName)) {
        result.fieldMismatches.push({
          pageId: specPage.id,
          type: 'missing_in_code',
          fieldName: sf.fieldName,
          location: `${specPage.id}/search-area.md`,
        });
      }
    }

    // Match APIs
    const specApiNames = new Set(spec.apis.map((a) => a.name));
    const codeApiNames = new Set(codeInfo.apis);
    let matchedApis = 0;
    for (const ca of codeInfo.apis) {
      if (specApiNames.has(ca)) {
        matchedApis++;
      } else {
        result.apiMismatches.push({
          pageId: specPage.id,
          type: 'missing_in_doc',
          apiName: ca,
          location: `${componentPath}/services.ts`,
        });
      }
    }
    for (const sa of spec.apis) {
      if (!codeApiNames.has(sa.name)) {
        result.apiMismatches.push({
          pageId: specPage.id,
          type: 'missing_in_code',
          apiName: sa.name,
          location: `${specPage.id}/main.md`,
        });
      }
    }

    result.matchedPages.push({
      pageId: specPage.id,
      codeDir: componentPath,
      route: route.path,
      matchedFields,
      totalCodeFields: codeInfo.fields.length,
      totalSpecFields: spec.fields.length,
      matchedApis,
      totalCodeApis: codeInfo.apis.length,
      totalSpecApis: spec.apis.length,
    });
  }

  // Find unmatched spec pages
  for (const specPage of allSpecPages) {
    if (!matchedSpecPageIds.has(specPage.id)) {
      result.unmatchedSpecPages.push({
        pageId: specPage.id,
        pageTitle: specPage.pageTitle,
        reason: '未找到对应的代码页面',
      });
    }
  }

  return result;
}

/**
 * 解析组件路径别名到实际路径
 * 例如 @bombusiness/dataauthgroup → codeDir/bombusiness/dataauthgroup
 */
function resolveComponentPath(component: string, codeDir: string): string | null {
  // Remove leading @ or @@ aliases
  let cleanPath = component.replace(/^@+/, '');
  // Remove ibom/src/ or ibom/ prefix if present
  cleanPath = cleanPath.replace(/^ibom(?:\/src)?\//, '');
  const fullPath = join(codeDir, cleanPath);

  try {
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return fullPath;
  } catch {
    // Not found
  }

  return null;
}

export { resolveComponentPath };
