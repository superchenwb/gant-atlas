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

export interface TabInfo {
  /** Tab label text (e.g. '特征清单'). */
  label: string;
  /** Tab key (e.g. 'featureList'). */
  key: string;
}

export interface PageButtonScanResult {
  buttons: ButtonCandidate[];
  hooks: HookCandidate[];
  tabs: TabInfo[];
  /** Permission identifiers extracted from auth files. */
  permissions: string[];
}

const BUTTON_ELEMENT_NAMES = new Set([
  'Button',
  'ActionButton',
  'ToolbarButton',
  'IconButton',
  'ButtonGroup',
]);

const IGNORED_FILES = new Set(['schema.ts', 'schema.tsx', 'services.ts', 'service.ts', 'index.ts', 'types.ts', 'store.ts', 'auth.ts', 'style.ts']);

/**
 * Files to ignore only in sub-directories (not the page root).
 * Used by legacy scanning; Phase 2 (*button* dirs) uses IGNORED_FILES instead
 * to keep index.tsx — it IS the button component entry.
 */

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
  const tabs: TabInfo[] = [];

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

    // Tab items: extract { label: tr('xxx'), key: 'yyy' } patterns from array/object literals
    if (ts.isArrayLiteralExpression(node)) {
      extractTabsFromArray(ts, node, tabs);
    }
    // Also catch useMemo(() => [...], [...]) returning tab arrays
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isArrowFunction(node.arguments[0])) {
      const body = node.arguments[0].body;
      if (ts.isArrayLiteralExpression(body)) {
        extractTabsFromArray(ts, body, tabs);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { buttons, hooks, tabs, permissions: [] };
}

/**
 * Generic tab extraction: find objects with both 'label' and 'key' properties
 * in an array literal. Works with any Tab component (TabsButton, Tabs, etc.).
 */
function extractTabsFromArray(
  ts: typeof import('typescript'),
  arr: import('typescript').ArrayLiteralExpression,
  tabs: TabInfo[]
): void {
  for (const elem of arr.elements) {
    if (!ts.isObjectLiteralExpression(elem)) continue;
    let label: string | undefined;
    let key: string | undefined;

    for (const prop of elem.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
      // Extract string value, handling tr('xxx') wrapper
      const val = extractTabStringLiteral(ts, prop.initializer);
      if (prop.name.text === 'label' && val) label = val;
      if (prop.name.text === 'key' && val) key = val;
    }

    if (label || key) {
      tabs.push({
        label: label ?? key ?? '',
        key: key ?? label ?? '',
      });
    }
  }
}

/**
 * Extract a string value from a node, unwrapping tr('xxx') calls.
 */
function extractTabStringLiteral(
  ts: typeof import('typescript'),
  node: import('typescript').Node
): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  // Unwrap tr('xxx') or tr("xxx")
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'tr') {
    if (node.arguments.length > 0) {
      return extractTabStringLiteral(ts, node.arguments[0]);
    }
  }
  // Handle variable references — extract source text for LLM interpretation
  // e.g. ConfigTabsType.featureList → "ConfigTabsType.featureList"
  if (ts.isPropertyAccessExpression(node)) {
    return node.getText();
  }
  // e.g. featureList (bare identifier)
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  return undefined;
}

/**
 * Two-phase source file collection for button scanning.
 *
 * Phase 1: scan root-level files (catches index.tsx inline buttons).
 * Phase 2: recursively discover all *button* directories at any depth,
 *          scanning files within them. This reaches nested button components
 *          like featuregridlist/linkfeaturebutton/ without coupling to
 *          parent directory naming conventions.
 */
function collectSourceFiles(pageDir: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  // Phase 1: root-level files
  let rootEntries: string[];
  try {
    rootEntries = readdirSync(pageDir);
  } catch {
    return [];
  }

  for (const entry of rootEntries) {
    const fullPath = join(pageDir, entry);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }

    if (st.isFile()) {
      const ext = extname(entry);
      if ((ext === '.ts' || ext === '.tsx') && !IGNORED_FILES.has(entry)) {
        if (!seen.has(fullPath)) {
          seen.add(fullPath);
          files.push(fullPath);
        }
      }
    }
  }

  // Phase 2: discover *button* directories at any depth
  const buttonDirs: string[] = [];
  findButtonDirs(pageDir, buttonDirs);

  for (const dir of buttonDirs) {
    let dirEntries: string[];
    try {
      dirEntries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of dirEntries) {
      const fullPath = join(dir, entry);
      try {
        if (!statSync(fullPath).isFile()) continue;
      } catch {
        continue;
      }
      const ext = extname(entry);
      // In *button* directories, keep index.tsx — it IS the button component entry
      if ((ext === '.ts' || ext === '.tsx') && !IGNORED_FILES.has(entry)) {
        if (!seen.has(fullPath)) {
          seen.add(fullPath);
          files.push(fullPath);
        }
      }
    }
  }

  return files;
}

/**
 * Walk the tree and collect directories whose name contains "button".
 * Generic — does not depend on specific naming conventions.
 */
function findButtonDirs(dir: string, result: string[], depth = 0): void {
  if (depth > 6) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const fullPath = join(dir, entry);
    try {
      if (!statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }
    if (/button/i.test(entry)) {
      result.push(fullPath);
    }
    // Always recurse deeper — we want to find button dirs at any level
    findButtonDirs(fullPath, result, depth + 1);
  }
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
  const tabs: TabInfo[] = [];

  const sourceFiles = collectSourceFiles(pageDir);

  for (const filePath of sourceFiles) {
    try {
      const result = await scanFile(filePath);
      buttons.push(...result.buttons);
      hooks.push(...result.hooks);
      if (result.tabs.length > 0) tabs.push(...result.tabs);
    } catch {
      // Per-file resilience: skip files that fail to parse.
    }
  }

  // Enhance custom button components by reading their source code
  await enhanceCustomButtonSnippets(buttons, pageDir);

  // Extract permission identifiers from auth files
  const permissions = extractPermissions(pageDir);

  return { buttons, hooks, tabs, permissions };
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

/**
 * Extract permission identifiers from auth-like files.
 * Reads auth.ts/auth.tsx and collects string literals from
 * auth-related function calls.
 * Generic — does not depend on specific function names.
 */
export function extractPermissions(pageDir: string): string[] {
  const permissions: string[] = [];

  for (const fileName of ['auth.ts', 'auth.tsx']) {
    const filePath = join(pageDir, fileName);
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Pattern 1: useXxxAuth / useXxxPermission / useXxxAccess — extract string values from object arg
    const authObjMatches = raw.matchAll(/use\w*(?:Auth|Permission|Access)\s*\(\s*\{([^}]+)\}/gs);
    for (const m of authObjMatches) {
      const strValues = m[1].matchAll(/['"`]([^'"`]+)['"`]/g);
      for (const sv of strValues) {
        if (!permissions.includes(sv[1])) permissions.push(sv[1]);
      }
    }

    // Pattern 2: checkAuth('perm') / hasPermission('perm') / getAuth('perm')
    const directMatches = raw.matchAll(/(?:checkAuth|hasAuth|hasPermission|getAuth)\s*\(\s*['"`]([^'"`]+)['"`]/g);
    for (const dm of directMatches) {
      if (!permissions.includes(dm[1])) permissions.push(dm[1]);
    }

    // Pattern 3: moduleAuth('xxx') / auth('xxx') — string literals passed to auth-like functions
    const moduleAuthMatches = raw.matchAll(/(?:moduleAuth|auth|usePageAuth)\s*\(\s*['"`]([^'"`]+)['"`]/g);
    for (const mm of moduleAuthMatches) {
      if (!permissions.includes(mm[1])) permissions.push(mm[1]);
    }

    // Pattern 4: usePageAuth({ key: string }) — extract string values from object literal
    const pageAuthMatches = raw.matchAll(/usePageAuth\s*\(\s*\{([^}]+)\}/gs);
    for (const pm of pageAuthMatches) {
      const kvPairs = pm[1].matchAll(/['"`]([^'"`]+)['"`]/g);
      for (const kv of kvPairs) {
        if (!permissions.includes(kv[1])) permissions.push(kv[1]);
      }
    }
  }

  return permissions;
}
