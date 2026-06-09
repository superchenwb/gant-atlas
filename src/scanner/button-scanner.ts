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

const IGNORED_FILES = new Set(['schema.ts', 'services.ts', 'index.ts', 'types.ts']);

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
 * Scan a page directory for buttons and hooks.
 *
 * Reads all .ts/.tsx files except schema.ts, services.ts, index.ts, types.ts
 * and well-known non-source directories.
 */
export async function scanPageButtons(pageDir: string): Promise<PageButtonScanResult> {
  const buttons: ButtonCandidate[] = [];
  const hooks: HookCandidate[] = [];

  let entries: string[] = [];
  try {
    entries = readdirSync(pageDir);
  } catch {
    return { buttons, hooks };
  }

  for (const entry of entries) {
    if (IGNORED_FILES.has(entry)) continue;
    const ext = extname(entry);
    if (ext !== '.ts' && ext !== '.tsx') continue;

    const filePath = join(pageDir, entry);
    try {
      const st = statSync(filePath);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }

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
      }

      // API calls inside the component
      const apiMatches = raw.matchAll(/(\w+Api)\(/g);
      const apis = new Set<string>();
      for (const m of apiMatches) apis.add(m[1]);
      if (apis.size > 0) {
        hints.push(`APIs: ${Array.from(apis).join(', ')}`);
      }

      // Confirm / remove hooks
      const confirmMatch = raw.match(/useConfirm(\w+)/);
      if (confirmMatch) {
        hints.push(`ConfirmHook: useConfirm${confirmMatch[1]}`);
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
      }

      if (hints.length > 0) {
        btn.snippet = `${btn.snippet}\n// Component hints from ${btn.element}:\n// ${hints.join('\n// ')}`;
      }
    } catch {
      // ignore read errors
    }
  }
}
