import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { homedir } from 'os';
import type { Store } from './store/sqlite.js';
import { scanPageButtons, type ButtonCandidate, type HookCandidate } from './scanner/button-scanner.js';
import { isApiFunctionName } from './scanner/utils.js';

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
  required?: boolean | string;
  placeholder?: string;
  defaultValue?: unknown;
  rules?: unknown;
  /** Field names this field depends on (for dependency-driven visibility/validation). */
  dependencies?: string[];
  /** Raw source text of the onDependenciesChange handler (arrow function or function expression). */
  onDependenciesChange?: string;
}

export interface SchemaColumn {
  fieldName: string;
  title?: string;
  componentType?: string;
  options?: Record<string, unknown>;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  fixed?: string | boolean;
  align?: string;
  editable?: boolean | string;
}

export interface PageCodeInfo {
  pageDir: string;
  module: string;
  pageName: string;
  route?: string;
  pageType?: 'page-main' | 'page-detail';
  fields: SchemaField[];
  columns: SchemaColumn[];
  apis: string[];
  buttons: ButtonCandidate[];
  hooks: HookCandidate[];
  tabs: Array<{ label: string; key: string }>;
  permissions: string[];
  /** Path to the schema file actually used, if any */
  schemaFilePath?: string;
  /** Path to the services file actually used, if any */
  servicesFilePath?: string;
  /** Notes for the subagent (e.g. "columns are dynamically generated") */
  notes?: string[];
  /** API URLs extracted from hook calls (e.g. '/custMbom/find') */
  apiUrls?: string[];
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
  // Support conditional expression: condition ? 'A' : 'B'
  if (ts.isConditionalExpression(node)) {
    const whenTrue = extractStringLiteral(ts, node.whenTrue);
    const whenFalse = extractStringLiteral(ts, node.whenFalse);
    if (whenTrue && whenFalse) {
      return `${whenTrue}|${whenFalse}`;
    }
    return whenTrue || whenFalse;
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
  const result = await scanSchemaAST(raw, fields, columns);

  // Filename-based fallback for convention-based naming (e.g. mbomsearchschema/index.ts)
  // When a file is conventionally named but uses export default or factory functions,
  // regex/AST may fail. Use broader regex guided by the filename.
  if (result.fields.length === 0 && /searchschema/i.test(schemaFile)) {
    const propRegex = /(\w+):\s*\{[\s\S]*?title:\s*(?:tr\()?['"`]([^'"`]*)['"`][\s\S]*?componentType:\s*(?:tr\()?['"`]([^'"`]*)['"`]/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRegex.exec(raw)) !== null) {
      result.fields.push({ name: pm[1], title: pm[2], componentType: pm[3] });
    }
  }

  if (result.columns.length === 0 && /gridschema/i.test(schemaFile)) {
    const colRegex = /\{\s*fieldName:\s*['"`]([^'"`]+)['"`][\s\S]*?title:\s*tr\(['"`]([^'"`]+)['"`]\)/g;
    let cm: RegExpExecArray | null;
    while ((cm = colRegex.exec(raw)) !== null) {
      result.columns.push({ fieldName: cm[1], title: cm[2] });
    }
  }

  return result;
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
  // Object literal: recursively extract key-value pairs
  if (ts.isObjectLiteralExpression(node)) {
    const obj: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const val = extractOptionValue(ts, prop.initializer);
        if (val !== undefined) {
          obj[prop.name.text] = val;
        } else {
          // Fallback: preserve source text for complex expressions
          obj[prop.name.text] = prop.initializer.getText?.() ?? '[complex]';
        }
      }
    }
    return obj;
  }
  // Function call: preserve the full call expression text (e.g. getCodeList('STATUS'))
  if (ts.isCallExpression(node)) {
    return node.getText?.() ?? '[call]';
  }
  // Template literal with expressions: preserve text
  if (ts.isTemplateExpression(node) || ts.isTemplateLiteral(node)) {
    return node.getText?.() ?? '[template]';
  }
  // Identifier: preserve name (e.g. imported constants)
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  // Property access: preserve text (e.g. Constants.STATUS)
  if (ts.isPropertyAccessExpression(node)) {
    return node.getText?.() ?? '[property]';
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
      } else {
        // Preserve source text for expressions we can't parse (e.g. computed values)
        const text = prop.initializer.getText?.();
        if (text) options[prop.name.text] = text;
      }
    }
  }
  return options;
}

/**
 * Recursively extract columns from a gridSchema array literal, including nested children.
 */
function extractColumnsFromArray(
  ts: typeof import('typescript'),
  arrayNode: import('typescript').ArrayLiteralExpression,
  columns: SchemaColumn[]
) {
  for (const element of arrayNode.elements) {
    let objNode: import('typescript').ObjectLiteralExpression | null = null;
    let wrapperName: string | undefined;
    let extraArgs: unknown[] | undefined;

    // Direct object literal: { fieldName: '...', title: '...' }
    if (ts.isObjectLiteralExpression(element)) {
      objNode = element;
    }
    // Call expression wrapping: getCodeListColumn({ ... }, 'CODE_TYPE')
    if (ts.isCallExpression(element) && element.arguments.length > 0 && ts.isObjectLiteralExpression(element.arguments[0])) {
      objNode = element.arguments[0];
      // Extract wrapper function name
      if (ts.isIdentifier(element.expression)) {
        wrapperName = element.expression.text;
      } else if (ts.isPropertyAccessExpression(element.expression) && ts.isIdentifier(element.expression.name)) {
        wrapperName = element.expression.name.text;
      }
      // Collect extra arguments (beyond the first object literal)
      if (element.arguments.length > 1) {
        extraArgs = [];
        for (let i = 1; i < element.arguments.length; i++) {
          const arg = element.arguments[i];
          const val = extractOptionValue(ts, arg);
          if (val !== undefined) {
            extraArgs.push(val);
          } else {
            const text = arg.getText?.();
            if (text) extraArgs.push(text);
          }
        }
        if (extraArgs.length === 0) extraArgs = undefined;
      }
    }

    if (!objNode) continue;
    extractColumnFromObject(ts, objNode, columns, wrapperName, extraArgs);
  }
}

/**
 * Extract a single column (and its children) from an object literal node.
 */
function extractColumnFromObject(
  ts: typeof import('typescript'),
  objNode: import('typescript').ObjectLiteralExpression,
  columns: SchemaColumn[],
  wrapperName?: string,
  extraArgs?: unknown[]
) {
  let fieldName: string | undefined;
  let title: string | undefined;
  let componentType: string | undefined;
  let options: Record<string, unknown> | undefined;
  let width: number | string | undefined;
  let minWidth: number | string | undefined;
  let maxWidth: number | string | undefined;
  let fixed: string | boolean | undefined;
  let align: string | undefined;
  let editable: boolean | string | undefined;
  let childrenArray: import('typescript').ArrayLiteralExpression | null = null;

  for (const prop of objNode.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const propName = prop.name.text;
      if (propName === 'fieldName') {
        const val = extractStringLiteral(ts, prop.initializer);
        if (val !== undefined) fieldName = val;
      } else if (propName === 'title') {
        const val = extractStringLiteral(ts, prop.initializer);
        if (val !== undefined) title = val;
      } else if (propName === 'componentType') {
        const val = extractStringLiteral(ts, prop.initializer);
        if (val !== undefined) componentType = val;
      } else if (propName === 'options' && ts.isObjectLiteralExpression(prop.initializer)) {
        options = extractOptions(ts, prop.initializer);
      } else if (propName === 'children' && ts.isArrayLiteralExpression(prop.initializer)) {
        childrenArray = prop.initializer;
      } else if (propName === 'width') {
        width = ts.isNumericLiteral(prop.initializer) ? Number(prop.initializer.text) : extractStringLiteral(ts, prop.initializer);
      } else if (propName === 'minWidth') {
        minWidth = ts.isNumericLiteral(prop.initializer) ? Number(prop.initializer.text) : extractStringLiteral(ts, prop.initializer);
      } else if (propName === 'maxWidth') {
        maxWidth = ts.isNumericLiteral(prop.initializer) ? Number(prop.initializer.text) : extractStringLiteral(ts, prop.initializer);
      } else if (propName === 'fixed') {
        if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) fixed = true;
        else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) fixed = false;
        else fixed = extractStringLiteral(ts, prop.initializer);
      } else if (propName === 'align') {
        align = extractStringLiteral(ts, prop.initializer);
      } else if (propName === 'editable') {
        if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) editable = true;
        else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) editable = false;
        else editable = prop.initializer.getText?.();
      }
    }
  }

  if (fieldName) {
    // Merge wrapper/extra args into options
    let mergedOptions = options;
    if (wrapperName || (extraArgs && extraArgs.length > 0)) {
      mergedOptions = { ...options };
      if (wrapperName) mergedOptions._wrapper = wrapperName;
      if (extraArgs && extraArgs.length > 0) mergedOptions._args = extraArgs;
    }

    const existingColumn = columns.find((c) => c.fieldName === fieldName);
    if (existingColumn) {
      if (title !== undefined) existingColumn.title = title;
      if (componentType !== undefined) existingColumn.componentType = componentType;
      if (mergedOptions !== undefined) existingColumn.options = mergedOptions;
      if (width !== undefined) existingColumn.width = width;
      if (minWidth !== undefined) existingColumn.minWidth = minWidth;
      if (maxWidth !== undefined) existingColumn.maxWidth = maxWidth;
      if (fixed !== undefined) existingColumn.fixed = fixed;
      if (align !== undefined) existingColumn.align = align;
      if (editable !== undefined) existingColumn.editable = editable;
    } else {
      columns.push({ fieldName, title, componentType, options: mergedOptions, width, minWidth, maxWidth, fixed, align, editable });
    }
  }

  // Recursively extract children columns
  if (childrenArray) {
    extractColumnsFromArray(ts, childrenArray, columns);
  }
}

/**
 * Unwrap common wrappers around an array literal:
 * - ArrayLiteralExpression → itself
 * - CallExpression where callee is a property access on an array (e.g. arr.filter(...)) → the array
 * - ArrowFunction / FunctionExpression body → unwrap recursively
 * - AsExpression → unwrap recursively
 */
function unwrapArrayLiteral(
  ts: typeof import('typescript'),
  node: import('typescript').Node
): import('typescript').ArrayLiteralExpression | undefined {
  if (ts.isArrayLiteralExpression(node)) {
    return node;
  }
  if (ts.isAsExpression(node)) {
    return unwrapArrayLiteral(ts, node.expression);
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    return unwrapArrayLiteral(ts, node.expression.expression);
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return unwrapArrayLiteral(ts, node.body);
  }
  return undefined;
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

  // Phase 1: collect all array-literal variables so we can resolve spread elements
  const arrayVars = new Map<string, import('typescript').ArrayLiteralExpression>();

  function collect(node: import('typescript').Node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const arr = unwrapArrayLiteral(ts, decl.initializer);
          if (arr) {
            arrayVars.set(decl.name.text, arr);
          }
        }
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(sourceFile);

  function extractSearchFieldsFromObject(objNode: import('typescript').ObjectLiteralExpression) {
    for (const prop of objNode.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ts.isObjectLiteralExpression(prop.initializer)) {
        const propName = prop.name.text;
        let title: string | undefined;
        let componentType: string | undefined;
        let options: Record<string, unknown> | undefined;
        let required: boolean | string | undefined;
        let placeholder: string | undefined;
        let defaultValue: unknown;
        let rules: unknown;
        let dependencies: string[] | undefined;
        let onDependenciesChange: string | undefined;

        for (const innerProp of prop.initializer.properties) {
          if (ts.isPropertyAssignment(innerProp) && ts.isIdentifier(innerProp.name)) {
            const innerName = innerProp.name.text;
            if (innerName === 'title') {
              title = extractStringLiteral(ts, innerProp.initializer);
            } else if (innerName === 'componentType') {
              componentType = extractStringLiteral(ts, innerProp.initializer);
            } else if (innerName === 'options' && ts.isObjectLiteralExpression(innerProp.initializer)) {
              options = extractOptions(ts, innerProp.initializer);
            } else if (innerName === 'required') {
              if (innerProp.initializer.kind === ts.SyntaxKind.TrueKeyword) required = true;
              else if (innerProp.initializer.kind === ts.SyntaxKind.FalseKeyword) required = false;
              else required = innerProp.initializer.getText?.();
            } else if (innerName === 'placeholder') {
              placeholder = extractStringLiteral(ts, innerProp.initializer);
            } else if (innerName === 'defaultValue') {
              defaultValue = extractOptionValue(ts, innerProp.initializer);
            } else if (innerName === 'rules') {
              rules = extractOptionValue(ts, innerProp.initializer);
            } else if (innerName === 'dependencies' && ts.isArrayLiteralExpression(innerProp.initializer)) {
              dependencies = [];
              for (const dep of innerProp.initializer.elements) {
                const depStr = extractStringLiteral(ts, dep);
                if (depStr) dependencies.push(depStr);
              }
              if (dependencies.length === 0) dependencies = undefined;
            } else if (innerName === 'onDependenciesChange') {
              // Preserve the raw source text of the handler for LLM interpretation
              onDependenciesChange = innerProp.initializer.getText?.();
            }
          }
        }

        const existingField = fields.find((f) => f.name === propName);
        if (existingField) {
          if (title !== undefined) existingField.title = title;
          if (componentType !== undefined) existingField.componentType = componentType;
          if (options !== undefined) existingField.options = options;
          if (required !== undefined) existingField.required = required;
          if (placeholder !== undefined) existingField.placeholder = placeholder;
          if (defaultValue !== undefined) existingField.defaultValue = defaultValue;
          if (rules !== undefined) existingField.rules = rules;
          if (dependencies !== undefined) existingField.dependencies = dependencies;
          if (onDependenciesChange !== undefined) existingField.onDependenciesChange = onDependenciesChange;
        } else {
          fields.push({ name: propName, title, componentType, options, required, placeholder, defaultValue, rules, dependencies, onDependenciesChange });
        }
      }
    }
  }

  function extractColumnsFromArrayWithSpreads(
    ts: typeof import('typescript'),
    arrayNode: import('typescript').ArrayLiteralExpression,
    columns: SchemaColumn[]
  ) {
    for (const element of arrayNode.elements) {
      // Direct object literal
      if (ts.isObjectLiteralExpression(element)) {
        extractColumnFromObject(ts, element, columns);
        continue;
      }
      // Call expression wrapping: getCodeListColumn({ ... }, 'CODE_TYPE')
      if (ts.isCallExpression(element) && element.arguments.length > 0 && ts.isObjectLiteralExpression(element.arguments[0])) {
        let wrapperName: string | undefined;
        if (ts.isIdentifier(element.expression)) wrapperName = element.expression.text;
        else if (ts.isPropertyAccessExpression(element.expression) && ts.isIdentifier(element.expression.name)) {
          wrapperName = element.expression.name.text;
        }
        let extraArgs: unknown[] | undefined;
        if (element.arguments.length > 1) {
          extraArgs = [];
          for (let i = 1; i < element.arguments.length; i++) {
            const arg = element.arguments[i];
            const val = extractOptionValue(ts, arg);
            if (val !== undefined) extraArgs.push(val);
            else {
              const text = arg.getText?.();
              if (text) extraArgs.push(text);
            }
          }
          if (extraArgs.length === 0) extraArgs = undefined;
        }
        extractColumnFromObject(ts, element.arguments[0], columns, wrapperName, extraArgs);
        continue;
      }
      // Spread element referencing a known array variable
      if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
        const spreadArr = arrayVars.get(element.expression.text);
        if (spreadArr) {
          extractColumnsFromArrayWithSpreads(ts, spreadArr, columns);
        }
        continue;
      }
    }
  }

  function visit(node: import('typescript').Node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        // searchSchema = { ... }
        if (ts.isIdentifier(decl.name) && decl.name.text === 'searchSchema' && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          extractSearchFieldsFromObject(decl.initializer);
        }

        // Support *SearchSchema naming convention (e.g. mbomSearchSchema)
        if (ts.isIdentifier(decl.name) && /searchschema$/i.test(decl.name.text) && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          extractSearchFieldsFromObject(decl.initializer);
        }

        // gridSchema = [ ... ]
        if (ts.isIdentifier(decl.name) && decl.name.text === 'gridSchema' && decl.initializer) {
          const arr = unwrapArrayLiteral(ts, decl.initializer);
          if (arr) extractColumnsFromArrayWithSpreads(ts, arr, columns);
        }

        // Support *GridSchema naming convention (e.g. mbomBaseGridSchema)
        if (ts.isIdentifier(decl.name) && /gridschema$/i.test(decl.name.text) && decl.initializer) {
          const arr = unwrapArrayLiteral(ts, decl.initializer);
          if (arr) extractColumnsFromArrayWithSpreads(ts, arr, columns);
        }

        // Support any arrow/function whose name ends with Schema and body is an array
        if (ts.isIdentifier(decl.name) && /schema$/i.test(decl.name.text) && decl.initializer) {
          const arr = unwrapArrayLiteral(ts, decl.initializer);
          if (arr) extractColumnsFromArrayWithSpreads(ts, arr, columns);
        }
      }
    }

    // Handle export default { ... } or export default [...]
    if (ts.isExportAssignment(node) && node.expression) {
      let expr = node.expression;
      // unwrap `as Type` expressions
      if (ts.isAsExpression(expr)) {
        expr = expr.expression;
      }

      if (ts.isObjectLiteralExpression(expr)) {
        extractSearchFieldsFromObject(expr);
      }

      const arr = unwrapArrayLiteral(ts, expr);
      if (arr) extractColumnsFromArrayWithSpreads(ts, arr, columns);
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
  // or: const deleteByIdAPI = ...
  const apiRegex = /(?:export\s+)?(?:const|function)\s+([a-zA-Z][a-zA-Z0-9]*(?:Api|API))\s*(?:=|\()/g;

  let m: RegExpExecArray | null;
  while ((m = apiRegex.exec(raw)) !== null) {
    const name = m[1];
    if (isApiFunctionName(name) && !apis.includes(name)) apis.push(name);
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
    // export function xxxApi(...) or xxxAPI(...)
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      if (isApiFunctionName(name) && name[0] >= 'a' && name[0] <= 'z' && !apis.includes(name)) {
        apis.push(name);
      }
    }

    // export const xxxApi = ... or xxxAPI = ...
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text;
          if (isApiFunctionName(name) && name[0] >= 'a' && name[0] <= 'z' && !apis.includes(name)) {
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
 * 文件角色检测结果
 */
interface FileRoleMatch {
  /** Best candidate for schema (fields/columns definitions) */
  schemaFile: string | undefined;
  /** Best candidate for services (API definitions) */
  servicesFile: string | undefined;
}

/**
 * Detect file roles by content patterns instead of hardcoded names.
 *
 * Strategy:
 * 1. Check conventional names first (schema.ts/schema.tsx, services.ts/services.tsx)
 *    — if they exist AND match content patterns, use them directly (fast path).
 * 2. Otherwise, scan all .ts/.tsx files in the directory and classify by content:
 *    - Schema: contains `searchSchema` or `gridSchema` export
 *    - Services: contains `xxxApi` function/const definitions
 */
function detectFileRoles(pageDir: string): FileRoleMatch {
  let entries: string[];
  try {
    entries = readdirSync(pageDir);
  } catch {
    return { schemaFile: undefined, servicesFile: undefined };
  }

  const tsFiles = entries.filter((e) => {
    const ext = extname(e);
    return ext === '.ts' || ext === '.tsx';
  });

  if (tsFiles.length === 0) {
    return { schemaFile: undefined, servicesFile: undefined };
  }

  // Fast path: check conventional names first
  const conventionalNames = {
    schema: ['schema.ts', 'schema.tsx'],
    services: ['services.ts', 'services.tsx', 'service.ts', 'service.tsx', 'api.ts', 'api.tsx'],
  };

  let schemaFile: string | undefined;
  let servicesFile: string | undefined;

  // Check conventional schema names
  for (const name of conventionalNames.schema) {
    if (tsFiles.includes(name)) {
      const content = tryReadFile(join(pageDir, name));
      if (content && isSchemaContent(content)) {
        schemaFile = join(pageDir, name);
        break;
      }
    }
  }

  // Check conventional services names
  for (const name of conventionalNames.services) {
    if (tsFiles.includes(name)) {
      const content = tryReadFile(join(pageDir, name));
      if (content && isServicesContent(content)) {
        servicesFile = join(pageDir, name);
        break;
      }
    }
  }

  // If both found via conventional names, we're done
  if (schemaFile && servicesFile) {
    return { schemaFile, servicesFile };
  }

  // Slow path: scan all files by content
  for (const name of tsFiles) {
    const filePath = join(pageDir, name);
    const content = tryReadFile(filePath);
    if (!content) continue;

    if (!schemaFile && isSchemaContent(content)) {
      schemaFile = filePath;
    }
    if (!servicesFile && isServicesContent(content)) {
      servicesFile = filePath;
    }

    if (schemaFile && servicesFile) break;
  }

  return { schemaFile, servicesFile };
}

/**
 * Read file contents, returning undefined on failure.
 */
function tryReadFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Detect if file content contains schema definitions.
 * Looks for exports named `searchSchema`, `gridSchema`, `columnSchema`, `formSchema`.
 */
function isSchemaContent(content: string): boolean {
  return /(?:export\s+)?(?:const|let|var)\s+(?:search|grid|column|form)[Ss]chema\b/.test(content);
}

/**
 * Detect if file content contains API function definitions.
 * Looks for exports matching xxxApi / xxxAPI naming convention.
 */
function isServicesContent(content: string): boolean {
  return /(?:export\s+)?(?:const|function)\s+[a-zA-Z][a-zA-Z0-9]*(?:Api|API)\s*(?:=|\()/.test(content);
}

/**
 * Detect dynamic column generation patterns in page component code.
 * Returns a note string if dynamic columns are detected, undefined otherwise.
 */
function detectDynamicColumns(content: string): string | undefined {
  const patterns = [
    /\b(getColumns|useColumns|buildColumns|generateColumns|createColumns)\s*\(/,
    /\bcolumn(?:Config|Defs|Map)\s*[:=]/,
    /columns\s*=\s*use[A-Z]\w+\(/,
    /const\s+\w*[Cc]olumns\w*\s*=\s*use[A-Z]\w+\(/,
    /gridSchema\s*=\s*(?!\[)[\w$]+/,
    /columnSchema\s*=\s*(?!\[)[\w$]+/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(content)) {
      return '表格列可能是动态生成的，具体定义见页面组件代码。';
    }
  }

  return undefined;
}

/**
 * Recursively scan a directory for API definitions in all .ts/.tsx files.
 */
async function scanServicesRecursive(dir: string): Promise<string[]> {
  const apis: string[] = [];
  const seen = new Set<string>();

  function walk(currentDir: string) {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      let stat: import('fs').Stats;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = extname(entry);
        if (ext === '.ts' || ext === '.tsx') {
          try {
            const fileApis = scanServicesFile(fullPath);
            for (const api of fileApis) {
              if (!seen.has(api)) {
                seen.add(api);
                apis.push(api);
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  walk(dir);
  return apis;
}

/**
 * Find the main component file in a page directory (index.tsx or index.ts).
 */
function findMainComponentFile(pageDir: string): string | undefined {
  for (const name of ['index.tsx', 'index.ts']) {
    const fullPath = join(pageDir, name);
    try {
      if (statSync(fullPath).isFile()) return fullPath;
    } catch {
      // continue
    }
  }
  return undefined;
}

/**
 * Resolve a path-alias import to an actual filesystem path.
 */
function resolveAliasPath(importPath: string, pathAliases: Record<string, string>, codeDir: string): string | undefined {
  for (const [alias, target] of Object.entries(pathAliases)) {
    const normalizedAlias = alias.replace(/\/$/, '');
    if (importPath.startsWith(normalizedAlias)) {
      const relativePath = importPath.slice(normalizedAlias.length);
      const normalizedTarget = target.replace(/\/$/, '');

      // Primary: resolve relative to codeDir
      let resolved = join(codeDir, normalizedTarget, relativePath);
      try {
        const st = statSync(resolved);
        if (st.isDirectory() || st.isFile()) {
          return resolved;
        }
      } catch {
        // Fallback: try resolving from ancestor directories (handle monorepo
        // setups where pathAliases are relative to repo root but codeDir is
        // a nested package src directory)
        let currentDir = codeDir;
        while (currentDir !== dirname(currentDir)) {
          currentDir = dirname(currentDir);
          resolved = join(currentDir, normalizedTarget, relativePath);
          try {
            const st = statSync(resolved);
            if (st.isDirectory() || st.isFile()) {
              return resolved;
            }
          } catch {
            // continue
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Given a barrel export file, find all schema definition files
 * by resolving each relative import to an actual file.
 */
function findSchemaFilesInBarrel(barrelContent: string, dir: string): string[] {
  const files: string[] = [];
  const regex = /from\s+['"](\.\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(barrelContent)) !== null) {
    const relPath = m[1];
    const candidates = [
      join(dir, relPath, 'index.ts'),
      join(dir, relPath) + '.ts',
      join(dir, relPath) + '.tsx',
    ];
    for (const candidate of candidates) {
      try {
        if (statSync(candidate).isFile()) {
          files.push(candidate);
          break;
        }
      } catch {
        // continue
      }
    }
  }
  return files;
}

/**
 * Resolve external schema files imported by the page component.
 * Returns an array of schema file paths if found, undefined otherwise.
 */
function resolveExternalSchema(
  pageDir: string,
  codeDir: string | undefined,
  pathAliases: Record<string, string> | undefined
): string[] | undefined {
  if (!codeDir || !pathAliases) return undefined;

  const mainFile = findMainComponentFile(pageDir);
  if (!mainFile) return undefined;

  const content = tryReadFile(mainFile);
  if (!content) return undefined;

  // Look for schema imports
  const importRegex = /import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  let schemaImportPath: string | undefined;

  while ((match = importRegex.exec(content)) !== null) {
    const importedNames = match[1];
    const importPath = match[2];
    if (/(?:search|grid|column|form)schema\b/i.test(importedNames)) {
      // Only consider imports from paths that look like schema definitions
      if (importPath.includes('/schema/') || importPath.includes('schema')) {
        schemaImportPath = importPath;
        break;
      }
    }
  }

  if (!schemaImportPath) return undefined;

  const resolvedPath = resolveAliasPath(schemaImportPath, pathAliases, codeDir);
  if (!resolvedPath) return undefined;

  // Try barrel export first
  const barrelFile = join(resolvedPath, 'index.ts');
  try {
    if (statSync(barrelFile).isFile()) {
      const barrelContent = readFileSync(barrelFile, 'utf-8');
      const barrelFiles = findSchemaFilesInBarrel(barrelContent, resolvedPath);
      if (barrelFiles.length > 0) return barrelFiles;
      // If barrel contains schema definitions directly, use it
      if (/\b(?:export\s+)?(?:const|let|var)\s+(?:search|grid|column|form)schema\b/i.test(barrelContent)) {
        return [barrelFile];
      }
    }
  } catch {
    // not a barrel export
  }

  // Try direct file
  const directFiles: string[] = [];
  try {
    if (statSync(resolvedPath + '.ts').isFile()) directFiles.push(resolvedPath + '.ts');
  } catch { /* continue */ }
  try {
    if (statSync(resolvedPath + '.tsx').isFile()) directFiles.push(resolvedPath + '.tsx');
  } catch { /* continue */ }

  return directFiles.length > 0 ? directFiles : undefined;
}

/**
 * Extract API URLs from hook calls in a page component file.
 * Uses TypeScript AST to find useXxx(...) calls and extract string literal arguments.
 */
async function extractHookApiUrls(filePath: string): Promise<string[]> {
  const raw = tryReadFile(filePath);
  if (!raw) return [];

  const ts = await import('typescript');
  const isTsx = extname(filePath) === '.tsx';
  const sourceFile = ts.createSourceFile(
    filePath,
    raw,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const urls: string[] = [];
  const seen = new Set<string>();

  function visit(node: import('typescript').Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text.startsWith('use')) {
      for (const arg of node.arguments) {
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          const text = arg.text;
          if (text.startsWith('/') && !seen.has(text)) {
            seen.add(text);
            urls.push(text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return urls;
}

/**
 * Resolve external hook APIs by scanning hook directories referenced in imports.
 */
async function resolveExternalHookApis(
  pageDir: string,
  codeDir: string | undefined,
  pathAliases: Record<string, string> | undefined
): Promise<string[]> {
  if (!codeDir || !pathAliases) return [];

  const mainFile = findMainComponentFile(pageDir);
  if (!mainFile) return [];

  const content = tryReadFile(mainFile);
  if (!content) return [];

  const apis: string[] = [];
  const seen = new Set<string>();

  const importRegex = /import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const importedNames = match[1];
    const importPath = match[2];

    if (!/\buse[A-Z]\w+\b/.test(importedNames)) continue;

    const resolvedPath = resolveAliasPath(importPath, pathAliases, codeDir);
    if (!resolvedPath) continue;

    let hookDir = resolvedPath;
    try {
      if (!statSync(resolvedPath).isDirectory()) {
        hookDir = dirname(resolvedPath);
      }
    } catch {
      continue;
    }

    const hookApis = await scanServicesRecursive(hookDir);
    for (const api of hookApis) {
      if (!seen.has(api)) {
        seen.add(api);
        apis.push(api);
      }
    }
  }

  return apis;
}

/**
 * 扫描单个页面代码目录
 */
export async function scanPageDir(
  pageDir: string,
  module: string,
  pageName: string,
  options?: {
    codeDir?: string;
    pathAliases?: Record<string, string>;
    route?: RouteMapping;
  }
): Promise<PageCodeInfo> {
  const info: PageCodeInfo = {
    pageDir,
    module,
    pageName,
    fields: [],
    columns: [],
    apis: [],
    buttons: [],
    hooks: [],
    tabs: [],
    permissions: [],
  };

  // Detect file roles by content patterns (not hardcoded names)
  const roles = detectFileRoles(pageDir);

  if (roles.schemaFile) {
    info.schemaFilePath = roles.schemaFile;
    try {
      const schema = await scanSchema(roles.schemaFile);
      info.fields = schema.fields;
      info.columns = schema.columns;
    } catch {
      // Schema file exists but could not be parsed
    }
  }

  // If no local schema found, try resolving external schema via imports
  if (info.fields.length === 0 && info.columns.length === 0) {
    const externalSchemas = resolveExternalSchema(pageDir, options?.codeDir, options?.pathAliases);
    if (externalSchemas && externalSchemas.length > 0) {
      info.schemaFilePath = externalSchemas[0];
      for (const schemaFile of externalSchemas) {
        try {
          const schema = await scanSchema(schemaFile);
          info.fields.push(...schema.fields);
          info.columns.push(...schema.columns);
        } catch {
          // External schema exists but could not be parsed
        }
      }
    }
  }

  if (roles.servicesFile) {
    info.servicesFilePath = roles.servicesFile;
    try {
      info.apis = await scanServices(roles.servicesFile);
    } catch {
      // Services file exists but could not be parsed
    }
  }

  // Also recursively scan sub-directories for scattered API definitions
  const recursiveApis = await scanServicesRecursive(pageDir);
  for (const api of recursiveApis) {
    if (!info.apis.includes(api)) {
      info.apis.push(api);
    }
  }

  const buttonScan = await scanPageButtons(pageDir);
  info.buttons = buttonScan.buttons;
  info.hooks = buttonScan.hooks;
  info.tabs = buttonScan.tabs;
  info.permissions = buttonScan.permissions;

  // Extract API URLs from hook calls in the main component file
  const mainFile = findMainComponentFile(pageDir);
  if (mainFile) {
    try {
      const hookUrls = await extractHookApiUrls(mainFile);
      if (hookUrls.length > 0) {
        info.apiUrls = hookUrls;
      }
    } catch {
      // ignore extraction errors
    }
  }

  // Scan external hook directories for API definitions
  const externalHookApis = await resolveExternalHookApis(pageDir, options?.codeDir, options?.pathAliases);
  for (const api of externalHookApis) {
    if (!info.apis.includes(api)) {
      info.apis.push(api);
    }
  }

  // Detect dynamic columns if static schema yielded none
  if (info.columns.length === 0) {
    let entries: string[];
    try {
      entries = readdirSync(pageDir);
    } catch {
      entries = [];
    }
    for (const name of entries) {
      const ext = extname(name);
      if (ext !== '.ts' && ext !== '.tsx') continue;
      const base = name.slice(0, -ext.length);
      if (base === 'schema' || base === 'services' || base === 'types') continue;
      const content = tryReadFile(join(pageDir, name));
      if (content) {
        const note = detectDynamicColumns(content);
        if (note) {
          info.notes = [note];
          break;
        }
      }
    }
  }

  // Infer page type from code structure
  info.pageType = inferPageType(info, options?.route);

  return info;
}

/**
 * Infer the page type from code structure.
 *
 * Heuristics:
 * - page-main: has grid columns (list/table view), optionally with search fields.
 * - page-detail: has form fields but no grid columns, or route contains detail/edit/view.
 */
function inferPageType(
  info: PageCodeInfo,
  route?: RouteMapping
): 'page-main' | 'page-detail' | undefined {
  const hasColumns = info.columns.length > 0;
  const hasFields = info.fields.length > 0;
  const routePath = route?.path ?? info.route ?? '';

  // Detail pages often have detail/edit/view in their route
  const detailRoutePattern = /\/(?:detail|edit|view|info)|\bdetail\b|\bedit\b|\bview\b/i;
  if (detailRoutePattern.test(routePath) && !hasColumns) {
    return 'page-detail';
  }

  // Main list page: has grid columns
  if (hasColumns) {
    return 'page-main';
  }

  // Form-only page without grid: could be detail or search-only
  // Default to detail if route suggests it, otherwise undefined
  if (hasFields && detailRoutePattern.test(routePath)) {
    return 'page-detail';
  }

  return undefined;
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
    const codeInfo = await scanPageDir(componentPath, moduleName, pageName, { route });

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
 * 从全局 ~/.gant-atlas/projects.json 加载项目配置中的 pathAliases。
 * 支持两种 JSON 结构：{ projects: [...] } 或 [...]。
 */
export function loadPathAliases(codeDir: string): Record<string, string> {
  try {
    const projectsPath = join(homedir(), '.gant-atlas', 'projects.json');
    if (!statSync(projectsPath).isFile()) return {};

    const raw = readFileSync(projectsPath, 'utf-8');
    const data = JSON.parse(raw) as { projects?: unknown[] } | unknown[];
    const projects = Array.isArray(data) ? data : (data.projects ?? []);

    const project = projects.find((p: unknown) => {
      if (!p || typeof p !== 'object') return false;
      const { codeDir: pDir } = p as { codeDir?: string };
      if (typeof pDir !== 'string') return false;
      return (
        codeDir === pDir ||
        codeDir.startsWith(pDir + '/') ||
        pDir.startsWith(codeDir + '/')
      );
    });

    if (
      project &&
      typeof project === 'object' &&
      'pathAliases' in project &&
      project.pathAliases &&
      typeof project.pathAliases === 'object'
    ) {
      return project.pathAliases as Record<string, string>;
    }
  } catch {
    // Ignore missing or malformed config
  }
  return {};
}

/**
 * 解析组件路径别名到实际路径
 * 例如 @bombusiness/dataauthgroup → codeDir/bombusiness/dataauthgroup
 *
 * 解析策略：
 * 1. 优先使用 ~/.gant-atlas/projects.json 中配置的 pathAliases
 * 2. 回退到 legacy 行为：去掉 @/@@/ibom 前缀后直接拼接
 */
export function resolveComponentPath(component: string, codeDir: string): string | null {
  const aliases = loadPathAliases(codeDir);
  const sortedAliases = Object.entries(aliases).sort((a, b) => b[0].length - a[0].length);

  for (const [prefix, base] of sortedAliases) {
    if (component.startsWith(prefix)) {
      const fullPath = join(codeDir, base, component.slice(prefix.length));
      try {
        if (statSync(fullPath).isDirectory()) return fullPath;
      } catch {
        // Not found under this alias
      }
    }
  }

  // Legacy fallback
  let cleanPath = component.replace(/^@+/, '');
  cleanPath = cleanPath.replace(/^ibom(?:\/src)?\//, '');
  const fullPath = join(codeDir, cleanPath);

  try {
    const st = statSync(fullPath);
    if (st.isDirectory()) return fullPath;
  } catch {
    // Not found
  }

  return null;
}

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

  const apiRegex = /(?:export\s+)?(?:const|function)\s+([a-zA-Z][a-zA-Z0-9]*(?:Api|API))\s*(?:=|\()/g;

  let m: RegExpExecArray | null;
  while ((m = apiRegex.exec(raw)) !== null) {
    const name = m[1];
    if (isApiFunctionName(name) && !apis.includes(name)) apis.push(name);
  }

  return apis;
}
