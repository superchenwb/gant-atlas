import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { buildGraphAsync } from '../graph/builder.js';
import { createStore } from '../store/sqlite.js';
import { buildMapping } from '../code-scanner.js';
import { runConsistencyChecks } from '../mcp/tools/check-consistency.js';
import type { CodeToSpecMapping } from '../code-scanner.js';

export interface IngestResult {
  totalPages: number;
  updated: number;
  skipped: number;
  removed: number;
}

export async function runIngest(
  docsPath: string,
  dbPath: string,
  force?: boolean
): Promise<IngestResult> {
  const store = createStore(dbPath);

  if (force) {
    store.clearProject();
  }

  const existingHashes = store.getPageHashes();
  const docs = await buildGraphAsync(docsPath);

  const seenPageIds = new Set<string>();
  let updatedCount = 0;
  let skippedCount = 0;

  for (const doc of docs) {
    const pageId = doc.page.id;
    seenPageIds.add(pageId);

    const pagePath = join(docsPath, doc.page.module, doc.page.pageName);
    const currentHash = computePageHash(pagePath);
    const existingHash = existingHashes.get(pageId);

    if (existingHash === currentHash) {
      skippedCount++;
      continue;
    }

    store.deletePageEntities(pageId);
    store.insertPage(doc.page, currentHash);
    for (const field of doc.fields) store.insertField(field);
    for (const col of doc.columns) store.insertGridColumn(col);
    for (const btn of doc.buttons) store.insertButton(btn);
    for (const api of doc.apis) store.insertAPI(api);
    for (const rel of doc.relations.pageHasApis) {
      store.insertPageAPI(rel.pageId, rel.apiId);
    }
    for (const rel of doc.relations.fieldCallsApis) {
      store.insertFieldCallsAPI(rel.fieldId, rel.apiId);
    }
    updatedCount++;
  }

  let removedCount = 0;
  for (const [pageId] of existingHashes) {
    if (!seenPageIds.has(pageId)) {
      store.deletePage(pageId);
      removedCount++;
    }
  }

  store.close();

  return {
    totalPages: docs.length,
    updated: updatedCount,
    skipped: skippedCount,
    removed: removedCount,
  };
}

export function runQueryPage(pageId: string, dbPath: string): unknown | null {
  const store = createStore(dbPath);
  const spec = store.getPageSpec(pageId);
  store.close();

  if (!spec.page) {
    return null;
  }

  return spec;
}

export async function runMap(
  codeDir: string,
  routesFile: string,
  dbPath: string
): Promise<CodeToSpecMapping> {
  const store = createStore(dbPath);
  const mapping = await buildMapping(codeDir, routesFile, store);
  store.close();
  return mapping;
}

export interface ValidateResult {
  consistency: ReturnType<typeof runConsistencyChecks>;
  mapping?: CodeToSpecMapping;
  hasIssues: boolean;
}

export async function runValidate(
  dbPath: string,
  codeDir?: string,
  routesFile?: string
): Promise<ValidateResult> {
  const store = createStore(dbPath);
  const report = runConsistencyChecks(store);

  let mappingReport: CodeToSpecMapping | null = null;
  if (codeDir && routesFile) {
    mappingReport = await buildMapping(codeDir, routesFile, store);
  }

  store.close();

  const mappingHasIssues = mappingReport
    ? mappingReport.unmatchedCodePages.length > 0 ||
      mappingReport.unmatchedSpecPages.length > 0 ||
      mappingReport.fieldMismatches.length > 0 ||
      mappingReport.apiMismatches.length > 0
    : false;

  return {
    consistency: report,
    mapping: mappingReport ?? undefined,
    hasIssues: report.totalIssues > 0 || mappingHasIssues,
  };
}

export function computePageHash(pagePath: string): string {
  const hash = createHash('sha256');
  const files = readdirSync(pagePath)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort();

  for (const file of files) {
    const filePath = join(pagePath, file);
    const stat = statSync(filePath);
    hash.update(file);
    hash.update(stat.mtime.toISOString());
    hash.update(readFileSync(filePath, 'utf-8'));
  }

  return hash.digest('hex');
}
