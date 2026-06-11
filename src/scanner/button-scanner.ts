/**
 * Button and hook scanner for TSX/TS page files.
 *
 * Uses dynamic TypeScript AST import (same strategy as code-scanner.ts) to
 * extract JSX button elements and custom hooks that call API functions.
 *
 * This is intentionally lightweight: we do not need full tree-sitter WASM
 * grammars for our goal (business-feature documentation). The TypeScript
 * compiler API handles JSX/TSX well enough for button/hook extraction.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

export interface ButtonCandidate {
  /** Button text extracted from JSX children or label/text/title props. */
  name?: string;
  /** JSX element name, e.g. Button, ActionButton, a. */
  element: string;
  /** Short code snippet around the button (for LLM context). */
  snippet: string;
  /** 1-based line number. */
  line: number;
  /** onClick handler expression text, if any. */
  onClick?: string;
  /** disabled condition expression text, if any. */
  disabled?: string;
  /** display/visible condition expression text, if any. */
  displayCondition?: string;
  /** Permission / auth / access / authority expression text. */
  permission?: string;
  /** Confirm / popconfirm configuration expression text. */
  confirm?: string;
}

export interface HookCandidate {
  /** Hook function name, e.g. useDataAuthGroupList. */
  name: string;
  /** Short code snippet of the hook body. */
  snippet: string;
  /** 1-based line number where the hook is defined. */
  line: number;
  /** API names called inside the hook (functions ending with Api). */
  apis: string[];
}

export interface PageButtonScanResult {
  buttons: ButtonCandidate[];
  hooks: HookCandidate[];
}

const BUTTON_ELEMENT_NAMES = new Set([
  'Button',
  'ActionButton',
  'ToolbarButton',
  'IconButton',
  'ButtonGroup',
  'a',
  'Link',
]);

const IGNORED_FILES = new Set(['schema.ts', 'schema.tsx', 'services.ts', 'service.ts', 'index.ts', 'types.ts', 'store.ts', 'auth.ts', 'style.ts']);

/**
 * Files to ignore only in sub-directories (not the page root).
 * The page entry file (index.tsx) must be scanned for inline buttons.
 */
const IGNORED_IN_SUBDIRS = new Set(['schema.ts', 'schema.tsx', 'services.ts', 'service.ts', 'index.ts', 'index.tsx', 'types.ts', 'store.ts', 'auth.ts', 'style.ts']);

function isButtonLikeElement(name: string): boolean {
  return BUTTON_ELEMENT_NAMES.has(name) || /[Bb]utton/.test(name);
}

function extractJsxElementName(
  ts: typeof import('typescript'),
  node: import('typescript').JsxOpeningElement | import('typescript').JsxSelfClosingElement
): string | undefined {
  if (ts.isIdentifier(node.tagName)) return node.tagName.text;
  if (ts.isPropertyAccessExpression(node.tagName) && ts.isIdentifier(node.tagName.name)) {
    return node.tagName.name.text;
  }
  return undefined;
}

function extractAttributeValue(
  ts: typeof import('typescript'),
  initializer: import('typescript').Expression | undefined
): string | undefined {
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }
  // For expressions, return the source text.
  return initializer.getText?.();
}

function findJsxAttribute(
  ts: typeof import('typescript'),
  attributes: import('typescript').JsxAttributes,
  name: string
): import('typescript').JsxAttribute | undefined {
  for (const attr of attributes.properties) {
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name) {
      return attr;
    }
  }
  return undefined;
}

function collectButtonFromJsxElement(
  ts: typeof import('typescript'),
  sourceFile: import('typescript').SourceFile,
  node: import('typescript').JsxElement | import('typescript').JsxSelfClosingElement
): ButtonCandidate | undefined {
  let open: import('typescript').JsxOpeningElement | import('typescript').JsxSelfClosingElement;
  if (ts.isJsxElement(node)) {
    open = node.openingElement;
  } else {
    open = node;
  }

  const element = extractJsxElementName(ts, open);
  if (!element || !isButtonLikeElement(element)) return undefined;

  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const snippet = node.getText(sourceFile).slice(0, 400);

  const onClickAttr = findJsxAttribute(ts, open.attributes, 'onClick');
  const disabledAttr = findJsxAttribute(ts, open.attributes, 'disabled');
  const hiddenAttr =
    findJsxAttribute(ts, open.attributes, 'hidden') ||
    findJsxAttribute(ts, open.attributes, 'visible');

  // Extract button text: prefer JSX children, fallback to common text props.
  let name: string | undefined;
  if (ts.isJsxElement(node)) {
    const texts: string[] = [];
    for (const child of node.children) {
      if (ts.isJsxText(child)) {
        const t = child.text.trim();
        if (t) texts.push(t);
      } else if (ts.isJsxExpression(child) && child.expression && ts.isStringLiteral(child.expression)) {
        texts.push(child.expression.text);
      }
    }
    if (texts.length > 0) name = texts.join(' ');
  }
  // Fallback to common text props if no children text found.
  if (!name) {
    for (const propName of ['label', 'text', 'title', 'name']) {
      const attr = findJsxAttribute(ts, open.attributes, propName);
      if (attr?.initializer) {
        const val = extractAttributeValue(ts, attr.initializer);
        if (val) {
          name = val;
          break;
        }
      }
    }
  }

  // Extract permission / auth / access / authority.
  let permission: string | undefined;
  for (const propName of ['permission', 'auth', 'access', 'authority']) {
    const attr = findJsxAttribute(ts, open.attributes, propName);
    if (attr?.initializer) {
      const val = extractAttributeValue(ts, attr.initializer);
      if (val) {
        permission = val;
        break;
      }
    }
  }

  // Extract confirm / popconfirm configuration.
  let confirm: string | undefined;
  for (const propName of ['confirm', 'popconfirm', 'confirmTitle', 'onConfirm']) {
    const attr = findJsxAttribute(ts, open.attributes, propName);
    if (attr?.initializer) {
      const val = extractAttributeValue(ts, attr.initializer);
      if (val) {
        confirm = confirm ? `${confirm}; ${propName}=${val}` : `${propName}=${val}`;
      }
    }
  }

  return {
    name,
    element,
    snippet,
    line,
    onClick: onClickAttr?.initializer
      ? extractAttributeValue(ts, onClickAttr.initializer)
      : undefined,
    disabled: disabledAttr?.initializer
      ? extractAttributeValue(ts, disabledAttr.initializer)
      : undefined,
    displayCondition: hiddenAttr?.initializer
      ? extractAttributeValue(ts, hiddenAttr.initializer)
      : undefined,
    permission,
    confirm,
  };
}

function collectApiCalls(
  ts: typeof import('typescript'),
  node: import('typescript').Node
): string[] {
  const apis: string[] = [];
  function visit(n: import('typescript').Node) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      if (name.endsWith('Api') && !apis.includes(name)) apis.push(name);
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return apis;
}

function extractHookName(
  ts: typeof import('typescript'),
  node: import('typescript').Node
): string | undefined {
  if (ts.isFunctionDeclaration(node) && node.name && node.name.text.startsWith('use')) {
    return node.name.text;
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text.startsWith('use') &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.text;
  }
  return undefined;
}

async function scanFile(filePath: string): Promise<PageButtonScanResult> {
  const raw = readFileSync(filePath, 'utf-8');
  const ts = await import('typescript');
  const isTsx = extname(filePath) === '.tsx';
  const sourceFile = ts.createSourceFile(
    filePath,
    raw,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const buttons: ButtonCandidate[] = [];
  const hooks: HookCandidate[] = [];

  function visit(node: import('typescript').Node) {
    // JSX buttons
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const btn = collectButtonFromJsxElement(ts, sourceFile, node);
      if (btn) buttons.push(btn);
    }

    // Hooks
    const hookName = extractHookName(ts, node);
    if (hookName) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const snippet = node.getText(sourceFile).slice(0, 600);
      const apis = collectApiCalls(ts, node);
      hooks.push({ name: hookName, snippet, line, apis });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { buttons, hooks };
}

/**
 * Recursively walk a directory, collecting source files for button scanning.
 *
 * Strategy:
 * - Root level (depth=0): scan all .ts/.tsx files (catches index.tsx inline buttons).
 * - Sub-directories (depth>0): only recurse into directories whose name contains "button".
 *   This avoids picking up buttons from sub-panels (e.g. dataauthvalue/, editdrawer/)
 *   while capturing all button component directories (e.g. addbutton/, removebutton/).
 */
function collectSourceFiles(dir: string, depth = 0): string[] {
  // Limit recursion depth to avoid scanning too deep into unrelated sub-components.
  if (depth > 2) return [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      // Skip common non-source directories
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      // Only recurse into *button* directories to avoid scanning sub-panels/drawers
      if (depth > 0 && !/button/i.test(entry)) continue;
      files.push(...collectSourceFiles(fullPath, depth + 1));
    } else if (st.isFile()) {
      const ext = extname(entry);
      if (ext !== '.ts' && ext !== '.tsx') continue;
      // At root level (depth=0), ignore only non-source files (schema, services, etc.)
      // but keep index.tsx for inline button detection.
      // In sub-directories, also ignore index.tsx to avoid scanning sub-panel entries.
      const ignoreSet = depth === 0 ? IGNORED_FILES : IGNORED_IN_SUBDIRS;
      if (!ignoreSet.has(entry)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Scan a page directory for buttons and hooks.
 *
 * Recursively reads all .ts/.tsx files (excluding well-known non-source files
 * like schema.ts, services.ts, etc.) to discover button components and custom hooks.
 */
export async function scanPageButtons(pageDir: string): Promise<PageButtonScanResult> {
  const buttons: ButtonCandidate[] = [];
  const hooks: HookCandidate[] = [];

  const sourceFiles = collectSourceFiles(pageDir);

  for (const filePath of sourceFiles) {
    try {
      const result = await scanFile(filePath);
      buttons.push(...result.buttons);
      hooks.push(...result.hooks);
    } catch {
      // Per-file resilience: skip files that fail to parse.
    }
  }

  // Enhance custom button components by reading their source code
  await enhanceCustomButtonSnippets(buttons, pageDir);

  return { buttons, hooks };
}

/**
 * For custom button components (e.g. AddButton, RemoveButton), read their
 * source files and extract key hints (inner standard button, APIs, confirm
 * config, translated texts) to enrich the snippet.
 *
 * Enhancement: the first translated label text found will be promoted to
 * `name` if the button doesn't already have one, so that the generated
 * button-area.md shows a human-readable name instead of the component class name.
 */
async function enhanceCustomButtonSnippets(buttons: ButtonCandidate[], pageDir: string): Promise<void> {
  for (const btn of buttons) {
    // Skip standard button elements
    if (BUTTON_ELEMENT_NAMES.has(btn.element) || !/[Bb]utton/.test(btn.element)) continue;

    // Try to find the component source directory: e.g. AddButton -> addbutton/index.tsx
    const componentDir = join(pageDir, btn.element.toLowerCase());
    let sourceFile: string | undefined;
    for (const file of ['index.tsx', 'index.ts', `${btn.element}.tsx`, `${btn.element}.ts`]) {
      const candidate = join(componentDir, file);
      try {
        const st = statSync(candidate);
        if (st.isFile()) {
          sourceFile = candidate;
          break;
        }
      } catch {
        // not found
      }
    }
    if (!sourceFile) continue;

    try {
      const raw = readFileSync(sourceFile, 'utf-8');
      const hints: string[] = [];

      // Inner standard button call: Button.GradientPrimaryAdd, Button.Remove, etc.
      const innerBtnMatch = raw.match(/Button\.([A-Za-z]+)/);
      if (innerBtnMatch) {
        hints.push(`InnerButton: Button.${innerBtnMatch[1]}`);

        // Infer human-readable name from known Button.* patterns
        if (!btn.name) {
          btn.name = inferNameFromButtonVariant(innerBtnMatch[1]);
        }
      }

      // API calls inside the component
      const apiMatches = raw.matchAll(/(\w+Api)\(/g);
      const apis = new Set<string>();
      for (const m of apiMatches) apis.add(m[1]);
      if (apis.size > 0) {
        hints.push(`APIs: ${Array.from(apis).join(', ')}`);

        // Promote API calls to onClick hint if no onClick was captured
        if (!btn.onClick) {
          btn.onClick = Array.from(apis).join(', ');
        }
      }

      // Confirm / remove hooks
      const confirmMatch = raw.match(/useConfirm(\w*)/);
      if (confirmMatch) {
        hints.push(`ConfirmHook: useConfirm${confirmMatch[1]}`);
        if (!btn.confirm) {
          btn.confirm = '是';
        }
      }

      // Popconfirm or confirm on standard Button
      const popconfirmMatch = raw.match(/(?:Popconfirm|popconfirm|confirm\s*[:=])/);
      if (popconfirmMatch && !btn.confirm) {
        btn.confirm = '是';
      }

      // Translated texts (first 3 unique ones)
      const trMatches = raw.matchAll(/tr\(['"`]([^'"`]+)['"`]\)/g);
      const texts = new Set<string>();
      for (const m of trMatches) {
        texts.add(m[1]);
        if (texts.size >= 3) break;
      }
      if (texts.size > 0) {
        hints.push(`Labels: ${Array.from(texts).join(' | ')}`);

        // Use first translated text as button name if still unnamed
        if (!btn.name) {
          btn.name = Array.from(texts)[0];
        }
      }

      if (hints.length > 0) {
        btn.snippet = `${btn.snippet}\n// Component hints from ${btn.element}:\n// ${hints.join('\n// ')}`;
      }
    } catch {
      // ignore read errors
    }
  }
}

/**
 * Map Button.* variant names to human-readable Chinese labels.
 * Covers the common patterns used in gant-procomponents.
 */
function inferNameFromButtonVariant(variant: string): string | undefined {
  const map: Record<string, string> = {
    // Add variants
    PrimaryAdd: '新增',
    GradientPrimaryAdd: '新增',
    Add: '新增',
    // Remove / Delete variants
    Remove: '删除',
    Delete: '删除',
    DangerRemove: '删除',
    // Edit variants
    Edit: '编辑',
    PrimaryEdit: '编辑',
    // Save variants
    Save: '保存',
    PrimarySave: '保存',
    // Cancel variants
    Cancel: '取消',
    // Import / Export variants
    Import: '导入',
    Export: '导出',
    PrimaryExport: '导出',
    // Submit variants
    Submit: '提交',
    PrimarySubmit: '提交',
    // Query / Search variants
    Search: '查询',
    Query: '查询',
    // Reset variants
    Reset: '重置',
    // Refresh variants
    Refresh: '刷新',
    // Copy variants
    Copy: '复制',
    // Download variants
    Download: '下载',
    // More / Action variants
    More: '更多',
    Action: '操作',
  };

  // Exact match first
  if (map[variant]) return map[variant];

  // Prefix match: e.g. "PrimaryExport" -> try "Export"
  for (const [key, label] of Object.entries(map)) {
    if (variant.endsWith(key)) return label;
  }

  // Suffix heuristic: "GradientPrimaryAdd" -> contains "Add" -> "新增"
  for (const keyword of ['Add', 'Remove', 'Delete', 'Edit', 'Save', 'Import', 'Export', 'Submit', 'Search', 'Copy', 'Download', 'Refresh', 'Reset']) {
    if (variant.includes(keyword)) return map[keyword] ?? keyword;
  }

  return undefined;
}
