import { createHash } from 'crypto';
import { dump as yamlDump } from 'js-yaml';
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { buildProjectAsync } from '../graph/builder.js';
import { createStore } from '../store/sqlite.js';
import { buildMapping, scanRoutes, scanPageDir, resolveComponentPath } from '../code-scanner.js';
import { generatePageSkeleton } from '../generator.js';
import { runConsistencyChecks } from '../mcp/tools/check-consistency.js';
import { validateStandardPage } from '../validation/page.js';
import type { CodeToSpecMapping } from '../code-scanner.js';
import type { GraphNode, GraphEdge } from '../types/graph.js';

export interface IngestResult {
  totalPages: number;
  updated: number;
  skipped: number;
  removed: number;
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

/**
 * 收集与某个 page 相关的所有 node id（通过 edges 关系）
 */
function collectPageNodeIds(pageId: string, edges: GraphEdge[]): Set<string> {
  const result = new Set<string>([pageId]);
  for (const e of edges) {
    if (e.source === pageId) {
      result.add(e.target);
    }
  }
  // field -> api edges
  for (const e of edges) {
    if (e.type === 'calls' && result.has(e.source)) {
      result.add(e.target);
    }
  }
  return result;
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

  const project = await buildProjectAsync(docsPath);
  const allPageIds = new Set(
    project.nodes.filter((n) => n.type === 'page').map((n) => n.id)
  );

  // 获取现有 page 的 hash
  const existingPages = store.listNodesByType('page');
  const existingHashMap = new Map<string, string>();
  for (const p of existingPages) {
    if (p.contentHash) existingHashMap.set(p.id, p.contentHash);
  }

  const changedPageIds = new Set<string>();
  const skippedPageIds = new Set<string>();

  for (const pageId of allPageIds) {
    const pageNode = project.nodes.find((n) => n.id === pageId)!;
    const pagePath = join(docsPath, pageNode.module ?? '', pageNode.name);
    const currentHash = computePageHash(pagePath);
    const existingHash = existingHashMap.get(pageId);

    if (existingHash === currentHash) {
      skippedPageIds.add(pageId);
    } else {
      changedPageIds.add(pageId);
    }
  }

  const removedPageIds = new Set<string>();
  for (const [pageId] of existingHashMap) {
    if (!allPageIds.has(pageId)) {
      removedPageIds.add(pageId);
    }
  }

  const pagesToDelete = new Set([...changedPageIds, ...removedPageIds]);

  // 删除旧数据
  const existingEdges = store.listEdges();
  for (const pageId of pagesToDelete) {
    const nodeIds = collectPageNodeIds(pageId, existingEdges);
    for (const id of nodeIds) {
      store.deleteNode(id);
    }
  }

  // 插入新/更新的 page 数据
  let updatedCount = 0;
  for (const pageId of changedPageIds) {
    const pageNode = project.nodes.find((n) => n.id === pageId)!;
    const pagePath = join(docsPath, pageNode.module ?? '', pageNode.name);
    const currentHash = computePageHash(pagePath);

    const nodeIds = collectPageNodeIds(pageId, project.edges);
    const nodesToInsert = new Map<string, GraphNode>();
    for (const id of nodeIds) {
      const node = project.nodes.find((n) => n.id === id);
      if (node) {
        nodesToInsert.set(id, id === pageId ? { ...node, contentHash: currentHash } : node);
      }
    }

    for (const node of nodesToInsert.values()) {
      store.insertNode(node);
    }

    for (const e of project.edges) {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
        store.insertEdge(e);
      }
    }

    updatedCount++;
  }

  store.close();

  return {
    totalPages: allPageIds.size,
    updated: updatedCount,
    skipped: skippedPageIds.size,
    removed: removedPageIds.size,
  };
}

export function runQueryPage(pageId: string, dbPath: string): unknown | null {
  const store = createStore(dbPath);
  const page = store.getNodeById(`page:${pageId}`);
  if (!page) {
    store.close();
    return null;
  }

  const edges = store.getEdgesFromSource(page.id);
  const relatedNodes: GraphNode[] = [];
  const relatedEdges: GraphEdge[] = [];

  for (const e of edges) {
    relatedEdges.push(e);
    const node = store.getNodeById(e.target);
    if (node) relatedNodes.push(node);
  }

  // field -> api edges
  const apiEdges: GraphEdge[] = [];
  for (const node of relatedNodes.filter((n) => n.type === 'field')) {
    const fEdges = store.getEdgesFromSource(node.id);
    for (const e of fEdges) {
      if (e.type === 'calls') {
        apiEdges.push(e);
        const api = store.getNodeById(e.target);
        if (api) relatedNodes.push(api);
      }
    }
  }

  store.close();

  return {
    page,
    nodes: relatedNodes,
    edges: [...relatedEdges, ...apiEdges],
  };
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
  structure?: {
    totalPages: number;
    standardPages: number;
    nonStandardPages: number;
    issues: Array<{ pageId: string; title: string; issues: string[] }>;
  };
  mapping?: CodeToSpecMapping;
  hasIssues: boolean;
}

export async function runValidate(
  dbPath: string,
  codeDir?: string,
  routesFile?: string,
  docsPath?: string
): Promise<ValidateResult> {
  const store = createStore(dbPath);
  const report = runConsistencyChecks(store);

  let mappingReport: CodeToSpecMapping | null = null;
  if (codeDir && routesFile) {
    mappingReport = await buildMapping(codeDir, routesFile, store);
  }

  // 标准页面结构检查
  let structureReport: ValidateResult['structure'] | undefined;
  if (docsPath) {
    const pages = store.listNodesByType('page');
    const structureIssues: Array<{ pageId: string; title: string; issues: string[] }> = [];
    let standardCount = 0;

    for (const page of pages) {
      const rawId = page.id.replace(/^page:/, '');
      const pageDir = join(docsPath, page.module || '', page.name);
      try {
        const sr = validateStandardPage(pageDir);
        if (sr.isStandard) {
          standardCount++;
        } else if (!sr.skippedByCustom) {
          structureIssues.push({ pageId: rawId, title: page.title, issues: sr.issues });
        }
      } catch {
        // IO error, skip
      }
    }

    structureReport = {
      totalPages: pages.length,
      standardPages: standardCount,
      nonStandardPages: structureIssues.length,
      issues: structureIssues,
    };

    // 将结构问题合并到一致性报告中
    for (const si of structureIssues) {
      report.issues.push({
        type: 'non_standard_page',
        description: `页面 "${si.pageId}" (${si.title}) 不符合标准页面结构`,
        suggestion: si.issues.join('; '),
      });
    }
    report.totalIssues = report.issues.length;
  }

  store.close();

  const mappingHasIssues = mappingReport
    ? mappingReport.unmatchedCodePages.length > 0 ||
      mappingReport.unmatchedSpecPages.length > 0 ||
      mappingReport.fieldMismatches.length > 0 ||
      mappingReport.apiMismatches.length > 0
    : false;

  const structureHasIssues = structureReport ? structureReport.nonStandardPages > 0 : false;

  return {
    consistency: report,
    structure: structureReport,
    mapping: mappingReport ?? undefined,
    hasIssues: report.totalIssues > 0 || mappingHasIssues || structureHasIssues,
  };
}

export interface ManifestEntry {
  id: string;
  type: string;
  name: string;
  title: string;
  summary?: string;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface ManifestOutput {
  pages: ManifestEntry[];
  fields: ManifestEntry[];
  columns: ManifestEntry[];
  buttons: ManifestEntry[];
  apis: ManifestEntry[];
  components: ManifestEntry[];
  methods: ManifestEntry[];
}

export interface ManifestResult {
  output: ManifestOutput;
  yaml: string;
  json: string;
}

export function runManifest(dbPath: string): ManifestResult {
  const store = createStore(dbPath);
  const nodes = store.listAllNodes();
  const edges = store.listEdges();
  store.close();

  const output: ManifestOutput = {
    pages: [],
    fields: [],
    columns: [],
    buttons: [],
    apis: [],
    components: [],
    methods: [],
  };

  for (const node of nodes) {
    const entry: ManifestEntry = {
      id: node.id,
      type: node.type,
      name: node.name,
      title: node.title,
      summary: node.summary || undefined,
      tags: node.tags.length > 0 ? node.tags : undefined,
      meta: node.meta,
    };

    switch (node.type) {
      case 'page':
        output.pages.push(entry);
        break;
      case 'field':
        output.fields.push(entry);
        break;
      case 'column':
        output.columns.push(entry);
        break;
      case 'button':
        output.buttons.push(entry);
        break;
      case 'api':
        output.apis.push(entry);
        break;
      case 'component':
        output.components.push(entry);
        break;
      case 'method':
        output.methods.push(entry);
        break;
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      pages: output.pages.length,
      fields: output.fields.length,
      columns: output.columns.length,
      buttons: output.buttons.length,
      apis: output.apis.length,
      components: output.components.length,
      methods: output.methods.length,
    },
    ...output,
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      description: e.description,
    })),
  };

  return {
    output,
    yaml: yamlDump(manifest),
    json: JSON.stringify(manifest, null, 2),
  };
}

export interface GenerateResult {
  generated: string[];
  skipped: string[];
}

export async function runGenerate(options: {
  codeDir: string;
  routesFile: string;
  docsPath: string;
  page?: string;
  force?: boolean;
  dryRun?: boolean;
}): Promise<GenerateResult> {
  const routes = await scanRoutes(options.routesFile);
  const generated: string[] = [];
  const skipped: string[] = [];

  for (const route of routes) {
    const componentPath = resolveComponentPath(route.component, options.codeDir);
    if (!componentPath) continue;

    const pageName = basename(componentPath);
    const moduleName = basename(join(componentPath, '..'));
    const pageId = `${moduleName}/${pageName}`;

    if (options.page && options.page !== pageId) continue;

    const pageDir = join(options.docsPath, moduleName, pageName);
    const info = await scanPageDir(componentPath, moduleName, pageName);
    const skeleton = generatePageSkeleton(info, route);

    const files: Record<string, string> = {
      'main.md': skeleton.mainMd,
      'search-area.md': skeleton.searchAreaMd,
      'grid-area.md': skeleton.gridAreaMd,
      'button-area.md': skeleton.buttonAreaMd,
    };

    for (const [fileName, content] of Object.entries(files)) {
      if (!content) continue;

      const filePath = join(pageDir, fileName);

      if (options.dryRun) {
        console.log(`\n--- ${filePath} ---\n${content}`);
        generated.push(filePath);
        continue;
      }

      const exists = existsSync(filePath);
      if (exists && !options.force) {
        skipped.push(filePath);
        continue;
      }

      mkdirSync(pageDir, { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
      generated.push(filePath);
    }
  }

  return { generated, skipped };
}

// ─── Status: show stale pages ───

export function runStatus(dbPath: string): { stalePages: GraphNode[]; totalPages: number } {
  const store = createStore(dbPath);
  const stalePages = store.getStalePages();
  const totalPages = store.listNodesByType('page').length;
  store.close();
  return { stalePages, totalPages };
}
