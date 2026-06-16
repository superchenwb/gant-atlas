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
import { join, extname, basename } from 'path';
import { isApiFunctionName, extractApiNamesFromText } from './utils.js';

export interface ButtonCandidate {
  /** Button text extracted from JSX children or label/text/title props. */
  name?: string;
  /** JSX element name, e.g. Button, ActionButton, a. */
  element: string;
  /** Short code snippet around the button (for LLM context). */
  snippet: string;
  /** 1-based line number. */
  line: number;
  /** Source file path where this button was found. */
  filePath?: string;
  /** onClick handler expression text, if any. */
  onClick?: string;
  /** API function names found in onClick handler body. */
  apiCalls?: string[];
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
  /** Source file path where this hook was defined. */
  filePath?: string;
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

/**
 * Extract human-readable label text from an attribute initializer.
 * Prefers string literals, then tries to unwrap tr('xxx') calls inside JSX expressions.
 */
function extractLabelAttributeValue(
  ts: typeof import('typescript'),
  initializer: import('typescript').Expression | undefined
): string | undefined {
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }
  const text = initializer.getText?.();
  if (text) {
    const trMatch = text.match(/tr\(['"`]([^'"`]+)['"`]\)/);
    if (trMatch) return trMatch[1];
  }
  return undefined;
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
      } else if (ts.isJsxExpression(child) && child.expression) {
        // Support {tr('xxx')} and bare string literals
        const expr = child.expression;
        if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
          texts.push(expr.text);
        } else if (
          ts.isCallExpression(expr) &&
          ts.isIdentifier(expr.expression) &&
          expr.expression.text === 'tr' &&
          expr.arguments.length > 0 &&
          (ts.isStringLiteral(expr.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(expr.arguments[0]))
        ) {
          texts.push(expr.arguments[0].text);
        }
      }
    }
    if (texts.length > 0) name = texts.join(' ');
  }
  // Fallback to common text props if no children text found.
  if (!name) {
    for (const propName of ['label', 'text', 'title', 'name', 'content', 'tooltip', 'registerDropDownKey']) {
      const attr = findJsxAttribute(ts, open.attributes, propName);
      if (attr?.initializer) {
        const val = extractLabelAttributeValue(ts, attr.initializer);
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

  // Extract API calls from onClick handler body
  let apiCalls: string[] | undefined;
  if (onClickAttr?.initializer) {
    const foundApis = new Set<string>();
    function findApiInNode(n: import('typescript').Node) {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const name = n.expression.text;
        if (isApiFunctionName(name) && !foundApis.has(name)) {
          foundApis.add(name);
        }
      }
      ts.forEachChild(n, findApiInNode);
    }
    findApiInNode(onClickAttr.initializer);
    if (foundApis.size > 0) apiCalls = Array.from(foundApis);
  }

  return {
    name,
    element,
    snippet,
    line,
    onClick: onClickAttr?.initializer
      ? extractAttributeValue(ts, onClickAttr.initializer)
      : undefined,
    apiCalls,
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
      if (isApiFunctionName(name) && !apis.includes(name)) apis.push(name);
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
      if (btn) {
        btn.filePath = filePath;
        buttons.push(btn);
      }
    }

    // Hooks
    const hookName = extractHookName(ts, node);
    if (hookName) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const snippet = node.getText(sourceFile).slice(0, 600);
      const apis = collectApiCalls(ts, node);
      hooks.push({ name: hookName, snippet, line, apis, filePath });
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
 * Detect event-handler callback names that should not be surfaced as action buttons.
 * Examples: onPBomSearchFormValueChange, onCellEditChange, onSelectionChange.
 */
const EVENT_HANDLER_PATTERNS = [
  /on[A-Z].*ValueChange$/,
  /on[A-Z].*FormValueChange$/,
  /on[A-Z].*CellEditChange$/,
  /on[A-Z].*SearchFormValueChange$/,
  /on[A-Z].*SelectionChange$/,
  /on[A-Z].*PageChange$/,
  /on[A-Z].*RowClick$/,
  /on[A-Z].*CellClick$/,
  /on[A-Z].*Mouse\w+$/,
  /on[A-Z].*Key\w+$/,
  /on[A-Z].*Focus$/,
  /on[A-Z].*Blur$/,
  /on[A-Z].*Input$/,
];

function isEventHandlerName(name: string): boolean {
  return EVENT_HANDLER_PATTERNS.some((p) => p.test(name));
}

function isEventHandlerWrapperHook(name: string): boolean {
  // Catch common event handler wrappers, including typos like CellEidtChange.
  if (/use[A-Z].*(?:ValueChange|FormValueChange|SearchFormValueChange|Cell\w*Change|SelectionChange|RowClick|CellClick)/.test(name)) {
    return true;
  }
  // Broad fallback: hooks whose name ends with Change and don't call APIs are likely event wrappers.
  return /use[A-Z].*Change$/.test(name);
}

/**
 * Infer a human-readable button label from an action callback name.
 */
const ACTION_LABEL_MAP: Record<string, string> = {
  ondelete: '删除',
  onremove: '删除',
  ondel: '删除',
  onbatchdelete: '批量删除',
  onbomarchived: '归档',
  onarchive: '归档',
  onpreview: '预览',
  onview: '查看',
  onedit: '编辑',
  oncreate: '新增',
  onadd: '新增',
  onsave: '保存',
  onsubmit: '提交',
  oncancel: '取消',
  oncopy: '复制',
  onexport: '导出',
  onimport: '导入',
  onbatchexport: '批量导出',
  onbatchimport: '批量导入',
  onbatchsave: '批量保存',
  onbatchsubmit: '批量提交',
  onbatchupdate: '批量更新',
  onrestore: '恢复',
  onrefresh: '刷新',
  onsearch: '查询',
  onreset: '重置',
  ondownload: '下载',
  onupload: '上传',
  onprint: '打印',
  onenable: '启用',
  ondisable: '禁用',
  onapprove: '审批',
  onreject: '驳回',
  onrevoke: '撤销',
  onrelease: '发布',
  onpublish: '发布',
  onsync: '同步',
  onsyncdata: '同步数据',
  oncompare: '对比',
  onmerge: '合并',
  onsplit: '拆分',
  onmove: '移动',
  onupgrade: '升级',
  ondowngrade: '降级',
  onapply: '应用',
  onassign: '分配',
  onunassign: '取消分配',
  onlock: '锁定',
  onunlock: '解锁',
  onbind: '绑定',
  onunbind: '解绑',
  onlink: '关联',
  onunlink: '取消关联',
  onvalidate: '校验',
  oncalculate: '计算',
  ongenerate: '生成',
  ongencode: '生成编码',
};

function inferActionLabel(actionName: string): string {
  const lower = actionName.toLowerCase();
  return ACTION_LABEL_MAP[lower] ?? actionName;
}

/**
 * Extract action callbacks (e.g. const onDelete = useCallback(...)) from a custom hook
 * and synthesize ButtonCandidate entries for them.
 *
 * Many procomponents-based pages pass action callbacks to Grid via `context` prop;
 * the actual button JSX lives inside the Grid component, not the page source.
 * This heuristic surfaces those row-level actions.
 */
async function extractActionButtonsFromHook(hook: HookCandidate): Promise<ButtonCandidate[]> {
  if (!hook.filePath) return [];

  let raw: string;
  try {
    raw = readFileSync(hook.filePath, 'utf-8');
  } catch {
    return [];
  }

  const buttons: ButtonCandidate[] = [];
  const ts = await import('typescript');
  const sourceFile = ts.createSourceFile(
    hook.filePath,
    raw,
    ts.ScriptTarget.Latest,
    true,
    extname(hook.filePath) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  function visit(node: import('typescript').Node) {
    // Handle: const onXxx = useCallback(...) or const onXxx = () => { ... }
    if (ts.isVariableDeclaration(node)) {
      const candidates: { name: string; initializer: import('typescript').Expression | undefined }[] = [];

      if (ts.isIdentifier(node.name) && /^on[A-Z]\w*$/.test(node.name.text)) {
        candidates.push({ name: node.name.text, initializer: node.initializer });
      }

      // Handle destructuring aliases: const { onItemClick: onPreview } = useModalOpen();
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (
            ts.isBindingElement(element) &&
            ts.isIdentifier(element.name) &&
            /^on[A-Z]\w*$/.test(element.name.text)
          ) {
            candidates.push({ name: element.name.text, initializer: node.initializer });
          }
        }
      }

      for (const candidate of candidates) {
        if (!candidate.initializer) continue;
        // Skip event handler callbacks (e.g. onPBomSearchFormValueChange)
        if (isEventHandlerName(candidate.name)) continue;
        const apis = collectApiCalls(ts, candidate.initializer);
        const label = inferActionLabel(candidate.name);
        // Only surface synthetic buttons for known actions or callbacks that call APIs.
        // Unknown onXxxChange/onXxxValueChange handlers are treated as event callbacks.
        if (apis.length === 0 && label === candidate.name) continue;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        buttons.push({
          name: label,
          element: 'ContextAction',
          snippet: node.getText(sourceFile).slice(0, 400),
          line,
          filePath: hook.filePath,
          onClick: candidate.name,
          apiCalls: apis.length > 0 ? apis : undefined,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return buttons;
}

/**
 * Scan a page directory for buttons and hooks.
 *
 * Recursively reads all .ts/.tsx files (excluding well-known non-source files
 * like schema.ts, services.ts, etc.) to discover button components and custom hooks.
 */
export async function scanPageButtons(
  pageDir: string,
  options?: {
    labelMap?: Record<string, string>;
  },
): Promise<PageButtonScanResult> {
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

  // Filter out framework/external hooks that don't call APIs.
  // Keep hooks that either call APIs or are defined in a dedicated hooks file.
  const filteredHooks = hooks.filter((h) => {
    if (h.apis && h.apis.length > 0) return true;
    const fileName = h.filePath ? basename(h.filePath) : '';
    if (fileName !== 'hooks.ts' && fileName !== 'hooks.tsx') return false;
    // Skip event handler wrapper hooks even in hooks.ts (e.g. usePBomSearchFormValueChange)
    return !isEventHandlerWrapperHook(h.name);
  });

  // Extract action callbacks (e.g. onDelete, onArchive) from custom hooks.
  // These are often passed to Grid via context prop and rendered as row buttons.
  for (const hook of filteredHooks) {
    const actionButtons = await extractActionButtonsFromHook(hook);
    buttons.push(...actionButtons);
  }

  // Enhance custom button components by reading their source code
  await enhanceCustomButtonSnippets(buttons, pageDir, options?.labelMap);

  // Extract permission identifiers from auth files
  const permissions = extractPermissions(pageDir);

  return { buttons, hooks: filteredHooks, tabs, permissions };
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
async function enhanceCustomButtonSnippets(
  buttons: ButtonCandidate[],
  pageDir: string,
  labelMap?: Record<string, string>,
): Promise<void> {
  for (const btn of buttons) {
    // Skip standard button elements
    if (BUTTON_ELEMENT_NAMES.has(btn.element) || !/[Bb]utton/.test(btn.element)) continue;

    // Resolve source file: prefer element name convention, fallback to filePath
    let sourceFile: string | undefined;

    // Primary: try element name → directory convention (e.g. AddButton → addbutton/index.tsx)
    const componentDir = join(pageDir, btn.element.toLowerCase());
    for (const file of ['index.tsx', 'index.ts', `${btn.element}.tsx`, `${btn.element}.ts`]) {
      const candidate = join(componentDir, file);
      try {
        if (statSync(candidate).isFile()) {
          sourceFile = candidate;
          break;
        }
      } catch { /* not found */ }
    }

    // Fallback: use filePath (where the button JSX was found)
    if (!sourceFile && btn.filePath) {
      try {
        const st = statSync(btn.filePath);
        if (st.isFile()) sourceFile = btn.filePath;
      } catch { /* not found */ }
    }

    if (!sourceFile) continue;

    try {
      const raw = readFileSync(sourceFile, 'utf-8');
      const hints: string[] = [];

      // Inner standard button call: Button.GradientPrimaryAdd, Button.Remove, etc.
      const innerBtnMatch = raw.match(/Button\.([A-Za-z]+)/);
      if (innerBtnMatch) {
        hints.push(`InnerButton: Button.${innerBtnMatch[1]}`);
      }

      // Translated texts (first 3 unique ones)
      const trMatches = raw.matchAll(/tr\(['"`]([^'"`]+)['"`]\)/g);
      const texts = new Set<string>();
      for (const m of trMatches) {
        texts.add(m[1]);
        if (texts.size >= 3) break;
      }
      if (texts.size > 0) {
        const textArray = Array.from(texts);
        hints.push(`Labels: ${textArray.join(' | ')}`);

        // Prefer a concise translated label (typical button labels are short).
        // Longer texts and message-like texts are usually tooltips/messages.
        const messageLikePattern = /不能|没有|请|已经|成功|失败|数据|体现|最新|选择.*并/;
        const conciseLabel = textArray.find(
          (t) => t.length <= 12 && !messageLikePattern.test(t),
        );
        if (!btn.name && conciseLabel) {
          btn.name = conciseLabel;
        }
      }

      // Infer from custom component element name if still unnamed
      // (e.g. PreferredLibraryButton → 按优选库新增, AsyncButton → 异步操作)
      if (!btn.name) {
        const variant = innerBtnMatch ? innerBtnMatch[1] : btn.element;
        btn.name = inferNameFromButtonVariant(variant, labelMap);
      }

      // API calls inside the component
      const apiNames = extractApiNamesFromText(raw);
      if (apiNames.length > 0) {
        hints.push(`APIs: ${apiNames.join(', ')}`);

        // Promote API calls to onClick hint if no onClick was captured
        if (!btn.onClick) {
          btn.onClick = apiNames.join(', ');
        }
        // Also populate apiCalls for button→API mapping
        if (!btn.apiCalls || btn.apiCalls.length === 0) {
          btn.apiCalls = apiNames;
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
 * Covers generic UI action patterns only. Project-specific mappings can be
 * supplied via the optional `labelMap` parameter.
 */
function inferNameFromButtonVariant(
  variant: string,
  labelMap?: Record<string, string>,
): string | undefined {
  const defaultMap: Record<string, string> = {
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

  const map = labelMap ? { ...defaultMap, ...labelMap } : defaultMap;

  // Exact match first
  if (map[variant]) return map[variant];

  // Prefix match: e.g. "PrimaryExport" -> try "Export"
  for (const [key, label] of Object.entries(map)) {
    if (variant.endsWith(key)) return label;
  }

  // Infix match: e.g. "PreferredLibraryButton" -> contains "PreferredLibrary"
  // Only apply to a curated subset to avoid over-matching.
  const INFIX_KEYS = ['PreferredLibrary', 'PlatformBOM', 'PlatformBom', 'BatchEdit', 'LinkChange', 'CompleteCheck', 'SuitableVehicle', 'CombineManager', 'CombineView', 'ColorView', 'ReferenceCreate', 'ReferenceOtherVehicle'];
  for (const key of INFIX_KEYS) {
    if (variant.includes(key) && map[key]) return map[key];
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
