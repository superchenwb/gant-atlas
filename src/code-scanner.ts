import { readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import type { Store } from './store/sqlite.js';

export interface RouteMapping {
  path: string;
  component: string;
  title?: string;
}

export interface SchemaField {
  name: string;
  title?: string;
  componentType?: string;
  options?: Record<string, unknown>;
}

export interface SchemaColumn {
  fieldName: string;
  title?: string;
  componentType?: string;
  options?: Record<string, unknown>;
}

export interface PageCodeInfo {
  pageDir: string;
  module: string;
  pageName: string;
  route?: string;
  fields: SchemaField[];
  columns: SchemaColumn[];
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
 *
 * 正则作为快速路径；当正则无法匹配时自动回退到 TypeScript AST 解析，
 * 以容忍代码格式化差异（换行、属性顺序、注释等）。
 */
export async function scanRoutes(routesFile: string): Promise<RouteMapping[]> {
  const raw = readFileSync(routesFile, 'utf-8');
  const mappings = scanRoutesRegex(raw);

  // AST fallback when regex yields nothing — handles property reordering,
  // line breaks between properties, or extra comments.
  if (mappings.length === 0) {
    return scanRoutesAST(raw);
  }
  return mappings;
}

function scanRoutesRegex(raw: string): RouteMapping[] {
  const mappings: RouteMapping[] = [];

  const entryRegex = /path:\s*['"]([^'"]+)['"]\s*,\s*(?:title|name):\s*['"]([^'"]*)['"]\s*,\s*component:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(raw)) !== null) {
    mappings.push({ path: m[1], title: m[2], component: m[3] });
  }

  const simpleRegex = /path:\s*['"]([^'"]+)['"]\s*,\s*component:\s*['"]([^'"]+)['"]/g;
  while ((m = simpleRegex.exec(raw)) !== null) {
    if (!mappings.some((r) => r.path === m![1] && r.component === m![2])) {
      mappings.push({ path: m[1], component: m[2] });
    }
  }

  return mappings;
}

function extractStringLiteral(ts: typeof import('typescript'), node: import('typescript').Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isCallExpression(node) && node.arguments.length > 0) {
    const firstArg = node.arguments[0];
    if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
      return firstArg.text;
    }
  }
  return undefined;
}

async function scanRoutesAST(raw: string): Promise<RouteMapping[]> {
  const ts = await import('typescript');
  const sourceFile = ts.createSourceFile('routes.ts', raw, ts.ScriptTarget.Latest, true);
  const mappings: RouteMapping[] = [];

  function visit(node: import('typescript').Node) {
    if (ts.isObjectLiteralExpression(node)) {
      let path: string | undefined;
      let component: string | undefined;
      let title: string | undefined;

      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const text = extractStringLiteral(ts, prop.initializer);
          if (prop.name.text === 'path') path = text;
          else if (prop.name.text === 'component') component = text;
          else if (prop.name.text === 'title' || prop.name.text === 'name') title = text;
        }
      }

      if (path && component && !mappings.some((r) => r.path === path && r.component === component)) {
        mappings.push({ path, component, title });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return mappings;
}

/**
 * 从 schema.ts 提取字段定义（含控件类型和选项）
 * 正则作为快速路径；当正则无法匹配或缺少 componentType 时自动回退到 TypeScript AST 解析
 */
export async function scanSchema(schemaFile: string): Promise<{
  fields: SchemaField[];
  columns: SchemaColumn[];
}> {
  const raw = readFileSync(schemaFile, 'utf-8');

  const fields: SchemaField[] = [];
  const columns: SchemaColumn[] = [];

  // Extract searchSchema fields by tracking brace depth to handle nested options
  // Supports type annotations: export const searchSchema: SearchFormSchema = { ... };
  const searchSchemaMatch = raw.match(/export\s+const\s+searchSchema[^=]*=\s*\{([\s\S]*?)\};/);
  if (searchSchemaMatch) {
    const searchBody = searchSchemaMatch[1];
    const propRegex = /(\w+):\s*\{/g;
    let pm: RegExpExecArray | null;
    let lastEnd = 0;
    while ((pm = propRegex.exec(searchBody)) !== null) {
      if (pm.index < lastEnd) continue; // skip nested matches inside previous block
      const start = pm.index + pm[0].length;
      let braceDepth = 1;
      let end = start;
      while (braceDepth > 0 && end < searchBody.length) {
        if (searchBody[end] === '{') braceDepth++;
        else if (searchBody[end] === '}') braceDepth--;
        end++;
      }
      lastEnd = end;
      const block = searchBody.slice(start, end - 1);
      const titleMatch = block.match(/title:\s*(?:tr\()?['"]([^'"]*)['"]/);
      const ctMatch = block.match(/componentType:\s*(?:tr\()?['"]([^'"]*)['"]/);
      fields.push({
        name: pm[1],
        title: titleMatch ? titleMatch[1] : undefined,
        componentType: ctMatch ? ctMatch[1] : undefined,
      });
    }
  }

  // Extract gridSchema columns by tracking brace depth
  // Supports type annotations: export const gridSchema: ColumnDefs<any> = [...];
  const gridSchemaMatch = raw.match(/export\s+const\s+gridSchema[^=]*=\s*(\[[\s\S]*?\]);/);
  if (gridSchemaMatch) {
    const gridBody = gridSchemaMatch[1];
    let i = 0;
    while (i < gridBody.length) {
      const openBrace = gridBody.indexOf('{', i);
      if (openBrace === -1) break;
      let braceDepth = 1;
      let end = openBrace + 1;
      while (braceDepth > 0 && end < gridBody.length) {
        if (gridBody[end] === '{') braceDepth++;
        else if (gridBody[end] === '}') braceDepth--;
        end++;
      }
      const block = gridBody.slice(openBrace + 1, end - 1);
      const fieldNameMatch = block.match(/fieldName:\s*['"]([^'"]*)['"]/);
      const titleMatch = block.match(/title:\s*(?:tr\()?['"]([^'"]*)['"]/);
      const ctMatch = block.match(/componentType:\s*(?:tr\()?['"]([^'"]*)['"]/);
      if (fieldNameMatch) {
        const existingColumn = columns.find((c) => c.fieldName === fieldNameMatch[1]);
        if (existingColumn) {
          if (titleMatch) existingColumn.title = titleMatch[1];
          if (ctMatch) existingColumn.componentType = ctMatch[1];
        } else {
          columns.push({
            fieldName: fieldNameMatch[1],
            title: titleMatch ? titleMatch[1] : undefined,
            componentType: ctMatch ? ctMatch[1] : undefined,
          });
        }
      }
      i = end;
    }
  }

  // AST fallback always runs to supplement options and catch anything regex missed.
  // Regex provides a fast path for name/title/componentType; AST enriches with options.
  return scanSchemaAST(raw, fields, columns);
}

function extractOptionValue(ts: typeof import('typescript'), node: import('typescript').Node): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((e) => extractOptionValue(ts, e)).filter((v) => v !== undefined);
  }
  return undefined;
}

function extractOptions(ts: typeof import('typescript'), node: import('typescript').ObjectLiteralExpression): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const val = extractOptionValue(ts, prop.initializer);
      if (val !== undefined) {
        options[prop.name.text] = val;
      }
    }
  }
  return options;
}

async function scanSchemaAST(
  raw: string,
  existingFields: SchemaField[],
  existingColumns: SchemaColumn[]
): Promise<{
  fields: SchemaField[];
  columns: SchemaColumn[];
}> {
  const ts = await import('typescript');
  const sourceFile = ts.createSourceFile('schema.ts', raw, ts.ScriptTarget.Latest, true);

  const fields = existingFields.length > 0 ? existingFields : [] as SchemaField[];
  const columns = existingColumns.length > 0 ? existingColumns : [] as SchemaColumn[];

  function visit(node: import('typescript').Node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        // searchSchema = { ... }
        if (ts.isIdentifier(decl.name) && decl.name.text === 'searchSchema' && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          for (const prop of decl.initializer.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ts.isObjectLiteralExpression(prop.initializer)) {
              const propName = prop.name.text;
              let title: string | undefined;
              let componentType: string | undefined;
              let options: Record<string, unknown> | undefined;

              for (const innerProp of prop.initializer.properties) {
                if (ts.isPropertyAssignment(innerProp) && ts.isIdentifier(innerProp.name)) {
                  if (innerProp.name.text === 'title') {
                    title = extractStringLiteral(ts, innerProp.initializer);
                  } else if (innerProp.name.text === 'componentType') {
                    componentType = extractStringLiteral(ts, innerProp.initializer);
                  } else if (innerProp.name.text === 'options' && ts.isObjectLiteralExpression(innerProp.initializer)) {
                    options = extractOptions(ts, innerProp.initializer);
                  }
                }
              }

              const existingField = fields.find((f) => f.name === propName);
              if (existingField) {
                if (title !== undefined) existingField.title = title;
                if (componentType !== undefined) existingField.componentType = componentType;
                if (options !== undefined) existingField.options = options;
              } else {
                fields.push({ name: propName, title, componentType, options });
              }
            }
          }
        }

        // gridSchema = [ ... ]
        if (ts.isIdentifier(decl.name) && decl.name.text === 'gridSchema' && decl.initializer && ts.isArrayLiteralExpression(decl.initializer)) {
          for (const element of decl.initializer.elements) {
            let objNode: import('typescript').ObjectLiteralExpression | null = null;

            // Direct object literal: { fieldName: '...', title: '...' }
            if (ts.isObjectLiteralExpression(element)) {
              objNode = element;
            }
            // Call expression wrapping: getCodeListColumn({ ... }) or getLevelColumn({ ... })
            if (ts.isCallExpression(element) && element.arguments.length > 0 && ts.isObjectLiteralExpression(element.arguments[0])) {
              objNode = element.arguments[0];
            }

            if (!objNode) continue;

            let fieldName: string | undefined;
            let title: string | undefined;
            let componentType: string | undefined;
            let options: Record<string, unknown> | undefined;

            for (const prop of objNode.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                if (prop.name.text === 'fieldName') {
                  const val = extractStringLiteral(ts, prop.initializer);
                  if (val !== undefined) fieldName = val;
                } else if (prop.name.text === 'title') {
                  const val = extractStringLiteral(ts, prop.initializer);
                  if (val !== undefined) title = val;
                } else if (prop.name.text === 'componentType') {
                  const val = extractStringLiteral(ts, prop.initializer);
                  if (val !== undefined) componentType = val;
                } else if (prop.name.text === 'options' && ts.isObjectLiteralExpression(prop.initializer)) {
                  options = extractOptions(ts, prop.initializer);
                }
              }
            }

            if (fieldName) {
              const existingColumn = columns.find((c) => c.fieldName === fieldName);
              if (existingColumn) {
                if (title !== undefined) existingColumn.title = title;
                if (componentType !== undefined) existingColumn.componentType = componentType;
                if (options !== undefined) existingColumn.options = options;
              } else {
                columns.push({ fieldName, title, componentType, options });
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { fields, columns };
}

/**
 * 从 services.ts 提取 API 函数名
 * 正则作为快速路径；当正则无法匹配时自动回退到 TypeScript AST 解析
 */
export async function scanServices(servicesFile: string): Promise<string[]> {
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

  // AST fallback when regex yields nothing
  if (apis.length === 0) {
    return scanServicesAST(raw);
  }
  return apis;
}

async function scanServicesAST(raw: string): Promise<string[]> {
  const ts = await import('typescript');
  const sourceFile = ts.createSourceFile('services.ts', raw, ts.ScriptTarget.Latest, true);
  const apis: string[] = [];

  function visit(node: import('typescript').Node) {
    // export function xxxApi(...)
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      if (name.endsWith('Api') && name[0] >= 'a' && name[0] <= 'z' && !apis.includes(name)) {
        apis.push(name);
      }
    }

    // export const xxxApi = ...
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text;
          if (name.endsWith('Api') && name[0] >= 'a' && name[0] <= 'z' && !apis.includes(name)) {
            apis.push(name);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return apis;
}

/**
 * 扫描单个页面代码目录
 */
export async function scanPageDir(pageDir: string, module: string, pageName: string): Promise<PageCodeInfo> {
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
    const schema = await scanSchema(schemaFile);
    info.fields = schema.fields;
    info.columns = schema.columns;
  } catch {
    // schema.ts may not exist
  }

  const servicesFile = join(pageDir, 'services.ts');
  try {
    info.apis = await scanServices(servicesFile);
  } catch {
    // services.ts may not exist
  }

  return info;
}

/**
 * 构建代码到功能清单的完整映射
 */
export async function buildMapping(
  codeDir: string,
  routesFile: string,
  store: Store
): Promise<CodeToSpecMapping> {
  const routes = await scanRoutes(routesFile);
  const result: CodeToSpecMapping = {
    matchedPages: [],
    unmatchedCodePages: [],
    unmatchedSpecPages: [],
    fieldMismatches: [],
    apiMismatches: [],
  };

  // Get all pages from DB
  const allSpecPages = store.listNodesByType('page');
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

    const specPage = allSpecPages.find((p) => p.id === `page:${pageId}`);
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
    const codeInfo = await scanPageDir(componentPath, moduleName, pageName);

    // Get spec info from nodes/edges
    const pageEdges = store.getEdgesFromSource(specPage.id);
    const specFieldNames: string[] = [];
    const specApiNames: string[] = [];

    for (const edge of pageEdges) {
      if (edge.type === 'contains') {
        const node = store.getNodeById(edge.target);
        if (node?.type === 'field') specFieldNames.push(node.name);
      }
      if (edge.type === 'calls') {
        const node = store.getNodeById(edge.target);
        if (node?.type === 'api') specApiNames.push(node.name);
      }
    }

    // field -> api edges
    for (const edge of pageEdges) {
      if (edge.type === 'contains') {
        const fieldEdges = store.getEdgesFromSource(edge.target);
        for (const fe of fieldEdges) {
          if (fe.type === 'calls') {
            const apiNode = store.getNodeById(fe.target);
            if (apiNode?.type === 'api') specApiNames.push(apiNode.name);
          }
        }
      }
    }

    const uniqueSpecFieldNames = new Set(specFieldNames);
    const uniqueSpecApiNames = new Set(specApiNames);

    // Match fields
    const codeFieldNames = new Set(codeInfo.fields.map((f) => f.name));
    let matchedFields = 0;
    for (const cf of codeInfo.fields) {
      if (uniqueSpecFieldNames.has(cf.name)) {
        matchedFields++;
      } else {
        result.fieldMismatches.push({
          pageId: pageId,
          type: 'missing_in_doc',
          fieldName: cf.name,
          location: `${componentPath}/schema.ts`,
        });
      }
    }
    for (const sf of uniqueSpecFieldNames) {
      if (!codeFieldNames.has(sf)) {
        result.fieldMismatches.push({
          pageId: pageId,
          type: 'missing_in_code',
          fieldName: sf,
          location: `${pageId}/search-area.md`,
        });
      }
    }

    // Match APIs
    const codeApiNames = new Set(codeInfo.apis);
    let matchedApis = 0;
    for (const ca of codeInfo.apis) {
      if (uniqueSpecApiNames.has(ca)) {
        matchedApis++;
      } else {
        result.apiMismatches.push({
          pageId: pageId,
          type: 'missing_in_doc',
          apiName: ca,
          location: `${componentPath}/services.ts`,
        });
      }
    }
    for (const sa of uniqueSpecApiNames) {
      if (!codeApiNames.has(sa)) {
        result.apiMismatches.push({
          pageId: pageId,
          type: 'missing_in_code',
          apiName: sa,
          location: `${pageId}/main.md`,
        });
      }
    }

    result.matchedPages.push({
      pageId: pageId,
      codeDir: componentPath,
      route: route.path,
      matchedFields,
      totalCodeFields: codeInfo.fields.length,
      totalSpecFields: uniqueSpecFieldNames.size,
      matchedApis,
      totalCodeApis: codeInfo.apis.length,
      totalSpecApis: uniqueSpecApiNames.size,
    });
  }

  // Find unmatched spec pages
  for (const specPage of allSpecPages) {
    const rawId = specPage.id.replace(/^page:/, '');
    if (!matchedSpecPageIds.has(specPage.id)) {
      result.unmatchedSpecPages.push({
        pageId: rawId,
        pageTitle: specPage.title,
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

// ─── Phase 1: Component + Service scanning enhancements ───

export interface ComponentInfo {
  name: string;
  filePath: string;
  pageId?: string;
}

export interface ServiceInfo {
  name: string;
  filePath: string;
  method?: string;
  endpoint?: string;
}

/**
 * 扫描代码目录中的 React/Vue 组件文件。
 * 复用 regex + AST fallback 模式。
 */
export async function scanComponents(codeDir: string): Promise<ComponentInfo[]> {
  const { readdirSync, statSync } = await import('fs');
  const { join, relative, extname } = await import('path');

  const components: ComponentInfo[] = [];
  const seen = new Set<string>();

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        // Skip common non-source directories
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = extname(entry);
        if (ext === '.tsx' || ext === '.jsx' || ext === '.vue') {
          const name = entry.replace(ext, '');
          // Skip index files and test files
          if (name === 'index' || name.endsWith('.test') || name.endsWith('.spec')) continue;
          const relPath = relative(codeDir, fullPath);
          if (!seen.has(relPath)) {
            seen.add(relPath);
            components.push({ name, filePath: relPath });
          }
        }
      }
    }
  }

  walk(codeDir);
  return components;
}

/**
 * 扫描 src/services/ 或 src/api/ 目录，提取 API 函数定义。
 * 复用 regex + AST fallback 模式。
 */
export async function scanServicesDir(servicesDir: string): Promise<ServiceInfo[]> {
  const { readdirSync, statSync } = await import('fs');
  const { join, relative, extname } = await import('path');

  const services: ServiceInfo[] = [];
  const seen = new Set<string>();

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = extname(entry);
        if (ext === '.ts' || ext === '.js') {
          try {
            const apis = scanServicesFile(fullPath);
            const relPath = relative(dir, fullPath);
            for (const api of apis) {
              if (!seen.has(api)) {
                seen.add(api);
                services.push({ name: api, filePath: relPath });
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  walk(servicesDir);

  // AST fallback: if regex found nothing, try AST on each file
  if (services.length === 0) {
    try {
      const entries = readdirSync(servicesDir);
      for (const entry of entries) {
        const fullPath = join(servicesDir, entry);
        const stat = statSync(fullPath);
        if (stat.isFile() && (extname(entry) === '.ts' || extname(entry) === '.js')) {
          const raw = readFileSync(fullPath, 'utf-8');
          const apis = await scanServicesAST(raw);
          const relPath = relative(servicesDir, fullPath);
          for (const api of apis) {
            if (!seen.has(api)) {
              seen.add(api);
              services.push({ name: api, filePath: relPath });
            }
          }
        }
      }
    } catch {
      // directory may not exist
    }
  }

  return services;
}

function scanServicesFile(filePath: string): string[] {
  const raw = readFileSync(filePath, 'utf-8');
  const apis: string[] = [];

  const apiRegex = /(?:export\s+)?(?:const|function)\s+([a-z][a-zA-Z0-9]*Api)\s*(?:=|\()/g;

  let m: RegExpExecArray | null;
  while ((m = apiRegex.exec(raw)) !== null) {
    if (!apis.includes(m[1])) apis.push(m[1]);
  }

  return apis;
}
