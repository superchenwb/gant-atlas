/**
 * Page generation context assembler.
 *
 * Takes raw PageCodeInfo from the code scanner and builds a compact,
 * subagent-friendly PageGenerationContext object. The context is the single
 * input to the page-writer subagent that produces feature-doc Markdown.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import type { PageCodeInfo, RouteMapping } from '../code-scanner.js';

export interface CompactButton {
  name?: string;
  element: string;
  line: number;
  onClick?: string;
  disabled?: string;
  displayCondition?: string;
  /** Permission / auth / access / authority expression text. */
  permission?: string;
  /** Confirm / popconfirm configuration expression text. */
  confirm?: string;
  /** Short code snippet around the button (for LLM context). */
  snippet: string;
}

export interface CompactHook {
  name: string;
  line: number;
  apis: string[];
  /** Short code snippet of the hook body (for LLM context). */
  snippet: string;
}

export type ApiScenario = 'query' | 'save' | 'delete' | 'export' | 'import' | 'link' | 'other';

function inferApiScenario(apiName: string): ApiScenario | undefined {
  const lower = apiName.toLowerCase();
  if (/find|list|query|search|get/.test(lower)) return 'query';
  if (/save|create|update|add|batchsave/.test(lower)) return 'save';
  if (/delete|remove|del/.test(lower)) return 'delete';
  if (/export/.test(lower)) return 'export';
  if (/import/.test(lower)) return 'import';
  if (/link|bind/.test(lower)) return 'link';
  return undefined;
}

export interface PageGenerationContext {
  pageId: string;
  route: string;
  title?: string;
  module: string;
  pageName: string;
  searchFields: Array<{
    name: string;
    title?: string;
    componentType?: string;
    options?: Record<string, unknown>;
    /** Field names this field depends on (for dependency-driven visibility/validation). */
    dependencies?: string[];
    /** Raw source text of the onDependenciesChange handler (arrow function or function expression). */
    onDependenciesChange?: string;
  }>;
  gridColumns: Array<{
    fieldName: string;
    title?: string;
    componentType?: string;
    options?: Record<string, unknown>;
  }>;
  apis: string[];
  buttons: CompactButton[];
  hooks: CompactHook[];
  /** Tab structure detected from page source (e.g. TabsButton items). */
  tabs: Array<{ label: string; key: string }>;
  /** Permission identifiers extracted from auth files. */
  permissions: string[];
  snippets: {
    /** Full or truncated schema file content. */
    schema?: string;
    /** Full services file content. */
    services?: string;
    /** Main page component file content (tsx/ts). */
    pageComponent?: string;
  };
  /** Notes for the subagent (e.g. "columns are dynamically generated"). */
  notes?: string[];
  /** API URLs extracted from hook calls (e.g. '/custMbom/find'). */
  apiUrls?: string[];
  /** Inferred usage scenarios for APIs (query / save / delete / etc). */
  apiScenarios?: Array<{ apiName: string; scenario?: ApiScenario }>;
  /** Page type: page-main or page-detail. */
  pageType?: string;
  /** Extracted metadata from the page component file (e.g. permissions, placeholders). */
  pageMeta?: {
    /** Placeholder text for the input search box. */
    inputSearchPlaceholder?: string;
    /** Page-level auth keys used (e.g. ['create', 'delete']). */
    pageAuth?: string[];
    /** Button list declared in the page component (e.g. ['新增', '删除']). */
    buttonList?: string[];
    /** Row selection type: 'single' or 'multiple'. */
    rowSelectionType?: 'single' | 'multiple';
    /** Row key field name. */
    rowKey?: string;
    /** Whether the grid shows serial numbers. */
    serialNumber?: boolean;
  };
}

const MAX_SNIPPET_LINES = 120;

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + '\n/* ... truncated ... */\n';
}

function readSnippet(filePath: string): string | undefined {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return truncateLines(raw, MAX_SNIPPET_LINES);
  } catch {
    return undefined;
  }
}

/**
 * Extract key metadata from the page component source code.
 * Uses lightweight regex patterns to avoid AST overhead.
 */
function extractPageMeta(pageComponentSource: string): NonNullable<PageGenerationContext['pageMeta']> {
  const meta: NonNullable<PageGenerationContext['pageMeta']> = {};

  // inputSearchProps placeholder
  const placeholderMatch = pageComponentSource.match(/inputSearchProps.*?placeholder\s*:\s*(?:tr\()?['"`]([^'"`]+)['"`]/);
  if (placeholderMatch) {
    meta.inputSearchPlaceholder = placeholderMatch[1];
  }

  // pageAuth usages (e.g. pageAuth.create, pageAuth.delete)
  const authMatches = pageComponentSource.matchAll(/pageAuth\.([a-zA-Z_]\w*)/g);
  const authSet = new Set<string>();
  for (const m of authMatches) authSet.add(m[1]);
  if (authSet.size > 0) meta.pageAuth = Array.from(authSet);

  // buttonList array
  const buttonListMatch = pageComponentSource.match(/buttonList\s*:\s*\[([^\]]+)\]/);
  if (buttonListMatch) {
    const items = buttonListMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g);
    const buttons: string[] = [];
    for (const m of items) buttons.push(m[1]);
    if (buttons.length > 0) meta.buttonList = buttons;
  }

  // useRowSelection type
  const rowSelectionMatch = pageComponentSource.match(/useRowSelection\s*\([^,]+,\s*\{[^}]*type\s*:\s*['"`](single|multiple)['"`]/);
  if (rowSelectionMatch) {
    meta.rowSelectionType = rowSelectionMatch[1] as 'single' | 'multiple';
  }

  // rowkey / rowKey
  const rowKeyMatch = pageComponentSource.match(/\brow[kK]ey\s*=\s*['"`]([^'"`]+)['"`]/);
  if (rowKeyMatch) meta.rowKey = rowKeyMatch[1];

  // serialNumber
  if (/\bserialNumber\b/.test(pageComponentSource)) {
    meta.serialNumber = true;
  }

  return meta;
}

function findPageComponentFile(pageDir: string): string | undefined {
  let entries: string[] = [];
  try {
    entries = readdirSync(pageDir);
  } catch {
    return undefined;
  }

  const codeFiles: string[] = [];
  for (const entry of entries) {
    const ext = extname(entry);
    if (ext !== '.ts' && ext !== '.tsx') continue;
    const base = entry.slice(0, -ext.length);
    if (base === 'schema' || base === 'services' || base === 'types') continue;
    codeFiles.push(entry);
  }

  // 1. Heuristic: if the directory basename matches a file basename, that's the main component.
  const dirBase = pageDir.split('/').pop() || pageDir;
  const main = codeFiles.find((c) => {
    const base = c.slice(0, -extname(c).length);
    return base.toLowerCase() === dirBase.toLowerCase();
  });
  if (main) return join(pageDir, main);

  // 2. Prefer index.tsx / index.ts (common React/Vue page entry).
  const indexTsx = codeFiles.find((c) => c === 'index.tsx');
  if (indexTsx) return join(pageDir, indexTsx);
  const indexTs = codeFiles.find((c) => c === 'index.ts');
  if (indexTs) return join(pageDir, indexTs);

  // 3. Otherwise prefer any .tsx, then any .ts.
  const tsx = codeFiles.find((c) => extname(c) === '.tsx');
  if (tsx) return join(pageDir, tsx);
  if (codeFiles.length > 0) return join(pageDir, codeFiles[0]);
  return undefined;
}

export function buildPageGenerationContext(
  info: PageCodeInfo,
  route: RouteMapping
): PageGenerationContext {
  const pageId = `${info.module}/${info.pageName}`;

  const buttons: CompactButton[] = info.buttons.map((b) => ({
    name: b.name,
    element: b.element,
    line: b.line,
    onClick: b.onClick,
    disabled: b.disabled,
    displayCondition: b.displayCondition,
    permission: b.permission,
    confirm: b.confirm,
    snippet: b.snippet,
  }));

  const hooks: CompactHook[] = info.hooks.map((h) => ({
    name: h.name,
    line: h.line,
    apis: h.apis,
    snippet: h.snippet,
  }));

  const apiScenarios = info.apis.map((apiName) => ({
    apiName,
    scenario: inferApiScenario(apiName),
  }));

  const snippets: PageGenerationContext['snippets'] = {};
  if (info.schemaFilePath) {
    snippets.schema = readSnippet(info.schemaFilePath);
  }
  if (info.servicesFilePath) {
    snippets.services = readSnippet(info.servicesFilePath);
  }

  const pageComponentFile = findPageComponentFile(info.pageDir);
  let pageMeta: PageGenerationContext['pageMeta'];
  if (pageComponentFile) {
    snippets.pageComponent = readSnippet(pageComponentFile);
    if (snippets.pageComponent) {
      pageMeta = extractPageMeta(snippets.pageComponent);
    }
  }

  return {
    pageId,
    route: route.path,
    title: route.title,
    module: info.module,
    pageName: info.pageName,
    searchFields: info.fields,
    gridColumns: info.columns,
    apis: info.apis,
    apiUrls: info.apiUrls,
    apiScenarios,
    buttons,
    hooks,
    tabs: info.tabs,
    permissions: info.permissions,
    snippets,
    notes: info.notes,
    pageMeta,
  };
}
