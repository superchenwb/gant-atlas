/**
 * SQLite 性能基准测试
 *
 * 验证关键查询的 p99 响应时间 < 100ms 承诺。
 * 生成大规模数据（1000+ pages, 10000+ nodes），测量核心操作耗时。
 */

import { createStore } from '../../src/store/sqlite.js';
import { runQueryPage } from '../../src/cli/actions.js';
import { runConsistencyChecks } from '../../src/mcp/tools/check-consistency.js';
import { rmSync } from 'fs';

// ─── 配置 ───

const PAGE_COUNT = 1000;
const FIELDS_PER_PAGE = 6;   // search fields
const COLUMNS_PER_PAGE = 8;  // grid columns
const BUTTONS_PER_PAGE = 3;  // buttons
const APIS_PER_PAGE = 4;     // apis

const TARGET_P99_MS = 100;

// ─── 数据生成 ───

function generateNodes() {
  const nodes: Array<ReturnType<typeof createPageNode>> = [];
  const edges: Array<{ source: string; target: string; type: string }> = [];

  for (let i = 0; i < PAGE_COUNT; i++) {
    const module = `mod${(i % 10).toString().padStart(2, '0')}`;
    const pageName = `page-${i}`;
    const pageId = `page:${module}/${pageName}`;

    nodes.push({
      id: pageId,
      type: 'page',
      name: pageName,
      title: `页面 ${i}`,
      summary: `Summary for page ${i}`,
      tags: ['list'],
      module,
      meta: { route: `/${module}/${pageName}`, pageType: 'list' },
    });

    // Fields
    for (let f = 0; f < FIELDS_PER_PAGE; f++) {
      const fid = `field:${module}/${pageName}/field/${f}`;
      nodes.push({
        id: fid,
        type: 'field',
        name: `field_${f}`,
        title: `字段 ${f}`,
        summary: '',
        tags: [],
        module: undefined,
        meta: { componentType: 'Input', required: f === 0 },
      });
      edges.push({ source: pageId, target: fid, type: 'contains' });
    }

    // Columns
    for (let c = 0; c < COLUMNS_PER_PAGE; c++) {
      const cid = `column:${module}/${pageName}/column/${c}`;
      nodes.push({
        id: cid,
        type: 'column',
        name: `col_${c}`,
        title: `列 ${c}`,
        summary: '',
        tags: [],
        module: undefined,
        meta: { editable: false },
      });
      edges.push({ source: pageId, target: cid, type: 'contains' });
    }

    // Buttons
    for (let b = 0; b < BUTTONS_PER_PAGE; b++) {
      const bid = `button:${module}/${pageName}/button/${b}`;
      nodes.push({
        id: bid,
        type: 'button',
        name: `btn_${b}`,
        title: `按钮 ${b}`,
        summary: '',
        tags: [],
        module: undefined,
        meta: {},
      });
      edges.push({ source: pageId, target: bid, type: 'contains' });
    }

    // APIs
    for (let a = 0; a < APIS_PER_PAGE; a++) {
      const apiName = `${pageName}Api_${a}`;
      const aid = `api:api/${apiName}`;
      nodes.push({
        id: aid,
        type: 'api',
        name: apiName,
        title: apiName,
        summary: '',
        tags: [],
        module: undefined,
        meta: {},
      });
      edges.push({ source: pageId, target: aid, type: 'calls' });
    }
  }

  return { nodes, edges };
}

function createPageNode(
  id: string,
  type: string,
  name: string,
  title: string,
  summary: string,
  tags: string[],
  module?: string,
  meta?: Record<string, unknown>
) {
  return { id, type, name, title, summary, tags, module, meta };
}

// ─── 基准测试 ───

export interface PerfResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p99Ms: number;
  passed: boolean;
}

function benchmark(name: string, fn: () => void, iterations: number): PerfResult {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);
  const totalMs = times.reduce((s, t) => s + t, 0);
  const p99Index = Math.floor(times.length * 0.99);

  return {
    name,
    iterations,
    totalMs: Math.round(totalMs * 100) / 100,
    avgMs: Math.round((totalMs / iterations) * 100) / 100,
    minMs: Math.round(times[0] * 100) / 100,
    maxMs: Math.round(times[times.length - 1] * 100) / 100,
    p99Ms: Math.round(times[p99Index] * 100) / 100,
    passed: times[p99Index] < TARGET_P99_MS,
  };
}

// ─── 主流程 ───

export interface PerfReport {
  dataStats: {
    pages: number;
    fields: number;
    columns: number;
    buttons: number;
    apis: number;
    totalNodes: number;
    totalEdges: number;
  };
  results: PerfResult[];
  allPassed: boolean;
}

export function runPerfBenchmark(dbPath: string): PerfReport {
  // 清理旧数据
  try { rmSync(dbPath); } catch { /* ignore */ }

  const store = createStore(dbPath);
  const { nodes, edges } = generateNodes();

  // 插入数据
  for (const node of nodes) {
    store.insertNode(node as any);
  }
  for (const edge of edges) {
    store.insertEdge(edge as any);
  }

  // 选取样本 pageId 用于查询
  const samplePageId = 'mod00/page-0';
  const samplePageNodeId = `page:${samplePageId}`;

  const results: PerfResult[] = [];

  // 1. get_page_spec (runQueryPage)
  results.push(
    benchmark('get_page_spec', () => {
      runQueryPage(samplePageId, dbPath);
    }, 50)
  );

  // 2. listNodesByType('page')
  results.push(
    benchmark('list_nodes_by_type(page)', () => {
      store.listNodesByType('page');
    }, 50)
  );

  // 3. searchNodes (LIKE 搜索)
  results.push(
    benchmark('search_nodes (LIKE)', () => {
      store.searchNodes('page');
    }, 50)
  );

  // 4. check_consistency
  results.push(
    benchmark('check_consistency', () => {
      runConsistencyChecks(store);
    }, 20)
  );

  // 5. getEdgesFromSource
  results.push(
    benchmark('get_edges_from_source', () => {
      store.getEdgesFromSource(samplePageNodeId);
    }, 50)
  );

  // 6. getNodeById
  results.push(
    benchmark('get_node_by_id', () => {
      store.getNodeById(samplePageNodeId);
    }, 100)
  );

  // 7. FTS5 搜索（如果可用）
  if (store.isFTS5Available()) {
    results.push(
      benchmark('search_nodes_fts', () => {
        store.searchNodesFTS('页面');
      }, 50)
    );
  }

  store.close();

  const totalNodes = nodes.length;
  const totalEdges = edges.length;

  return {
    dataStats: {
      pages: PAGE_COUNT,
      fields: PAGE_COUNT * FIELDS_PER_PAGE,
      columns: PAGE_COUNT * COLUMNS_PER_PAGE,
      buttons: PAGE_COUNT * BUTTONS_PER_PAGE,
      apis: PAGE_COUNT * APIS_PER_PAGE,
      totalNodes,
      totalEdges,
    },
    results,
    allPassed: results.every((r) => r.passed),
  };
}

// ─── 格式化输出 ───

export function formatPerfReport(report: PerfReport): string {
  const lines: string[] = [];
  lines.push('═══ SQLite Performance Benchmark ═══');
  lines.push(`数据规模: ${report.dataStats.totalNodes.toLocaleString()} nodes, ${report.dataStats.totalEdges.toLocaleString()} edges`);
  lines.push(`  · Pages:   ${report.dataStats.pages.toLocaleString()}`);
  lines.push(`  · Fields:  ${report.dataStats.fields.toLocaleString()}`);
  lines.push(`  · Columns: ${report.dataStats.columns.toLocaleString()}`);
  lines.push(`  · Buttons: ${report.dataStats.buttons.toLocaleString()}`);
  lines.push(`  · APIs:    ${report.dataStats.apis.toLocaleString()}`);
  lines.push('');

  for (const r of report.results) {
    const status = r.passed ? '✅' : '❌';
    lines.push(
      `${status} ${r.name.padEnd(28)} | p99: ${r.p99Ms.toFixed(2).padStart(6)}ms | avg: ${r.avgMs.toFixed(2).padStart(6)}ms | min: ${r.minMs.toFixed(2).padStart(6)}ms | max: ${r.maxMs.toFixed(2).padStart(6)}ms`
    );
  }

  lines.push('');
  if (report.allPassed) {
    lines.push('✅ 所有查询 p99 < 100ms，性能目标达成');
  } else {
    const failed = report.results.filter((r) => !r.passed);
    lines.push(`❌ ${failed.length} 项查询 p99 >= 100ms，需优化`);
  }

  return lines.join('\n');
}
