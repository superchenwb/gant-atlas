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
}

export interface CompactHook {
  name: string;
  line: number;
  apis: string[];
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
  }));

  const hooks: CompactHook[] = info.hooks.map((h) => ({
    name: h.name,
    line: h.line,
    apis: h.apis,
  }));

  const snippets: PageGenerationContext['snippets'] = {};
  if (info.schemaFilePath) {
    snippets.schema = readSnippet(info.schemaFilePath);
  }
  if (info.servicesFilePath) {
    snippets.services = readSnippet(info.servicesFilePath);
  }

  const pageComponentFile = findPageComponentFile(info.pageDir);
  if (pageComponentFile) {
    snippets.pageComponent = readSnippet(pageComponentFile);
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
    buttons,
    hooks,
    snippets,
    notes: info.notes,
  };
}
