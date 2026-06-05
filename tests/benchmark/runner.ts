/**
 * Semantic Mapper 准确率基准测试 Runner
 *
 * 对比 scanner 输出与人工标注的 golden standard，输出 F1/precision/recall。
 * 当 regex 准确率低于 85% 时，建议切换到纯 AST 模式。
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { PageGoldenStandard, GoldenRoute, GoldenField, GoldenColumn, GoldenApi } from './golden-standard.js';
import { scanRoutes, scanSchema, scanServices, resolveComponentPath } from '../../src/code-scanner.js';

// ─── 类型定义 ───

export interface BenchmarkResult {
  pageId: string;
  routeMetrics: Metrics | null;
  fieldMetrics: Metrics | null;
  columnMetrics: Metrics | null;
  apiMetrics: Metrics | null;
  overallF1: number;
}

export interface Metrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface BenchmarkReport {
  totalPages: number;
  results: BenchmarkResult[];
  aggregate: Metrics;
  regexThresholdMet: boolean; // true if overall F1 >= 0.85
}

// ─── 核心 Runner ───

/**
 * 运行单个页面的 benchmark
 *
 * @param goldenPath golden standard JSON 文件路径
 * @param codeDir 代码根目录（用于解析组件路径）
 * @param routesFile 路由文件路径
 */
export async function benchmarkPage(
  goldenPath: string,
  codeDir: string,
  routesFile: string
): Promise<BenchmarkResult | null> {
  if (!existsSync(goldenPath)) return null;

  const golden: PageGoldenStandard = JSON.parse(readFileSync(goldenPath, 'utf-8'));

  // 运行 scanners
  const routes = await scanRoutes(routesFile);

  // 解析组件路径：golden 中的 component 如 @simple-page → codeDir/simple-page
  const matchedRoute = golden.routes?.[0];
  const componentPath = matchedRoute
    ? resolveComponentPath(matchedRoute.component, codeDir)
    : null;

  const schemaFile = componentPath ? join(componentPath, 'schema.ts') : '';
  const schema = schemaFile && existsSync(schemaFile) ? await scanSchema(schemaFile) : { fields: [], columns: [] };

  const servicesFile = componentPath ? join(componentPath, 'services.ts') : '';
  const apis = servicesFile && existsSync(servicesFile) ? await scanServices(servicesFile) : [];

  // 路由对比
  const routeMetrics = matchedRoute
    ? compareRoutes([matchedRoute], routes.filter((r) => r.component === matchedRoute.component || r.path === matchedRoute.path))
    : null;

  const fieldMetrics = golden.fields
    ? compareFields(golden.fields, schema.fields)
    : null;

  const columnMetrics = golden.columns
    ? compareColumns(golden.columns, schema.columns)
    : null;

  const apiMetrics = golden.apis
    ? compareApis(golden.apis, apis.map((name) => ({ name })))
    : null;

  const metrics = [routeMetrics, fieldMetrics, columnMetrics, apiMetrics].filter(Boolean) as Metrics[];
  const overallF1 = metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.f1, 0) / metrics.length : 0;

  return {
    pageId: golden.pageId,
    routeMetrics,
    fieldMetrics,
    columnMetrics,
    apiMetrics,
    overallF1,
  };
}

/**
 * 运行整个 benchmark 套件
 */
export async function runBenchmarkSuite(
  goldenDir: string,
  codeDir: string,
  routesFile: string
): Promise<BenchmarkReport> {
  const files = readdirSync(goldenDir).filter((f) => f.endsWith('.golden.json'));
  const results: BenchmarkResult[] = [];

  for (const file of files) {
    const result = await benchmarkPage(join(goldenDir, file), codeDir, routesFile);
    if (result) results.push(result);
  }

  const aggregate = aggregateMetrics(
    results.flatMap((r) => [r.routeMetrics, r.fieldMetrics, r.columnMetrics, r.apiMetrics].filter(Boolean) as Metrics[])
  );

  return {
    totalPages: results.length,
    results,
    aggregate,
    regexThresholdMet: aggregate.f1 >= 0.85,
  };
}

// ─── 对比逻辑 ───

function compareRoutes(golden: GoldenRoute[], actual: Array<{ path: string; component: string; title?: string }>): Metrics {
  const goldenSet = new Set(golden.map((r) => `${r.path}#${r.component}`));
  const actualSet = new Set(actual.map((r) => `${r.path}#${r.component}`));

  const tp = golden.filter((r) => actualSet.has(`${r.path}#${r.component}`)).length;
  const fp = actual.filter((r) => !goldenSet.has(`${r.path}#${r.component}`)).length;
  const fn = golden.filter((r) => !actualSet.has(`${r.path}#${r.component}`)).length;

  return computeMetrics(tp, fp, fn);
}

function compareFields(golden: GoldenField[], actual: Array<{ name: string; title?: string; componentType?: string }>): Metrics {
  const goldenSet = new Set(golden.map((f) => f.name));
  const actualSet = new Set(actual.map((f) => f.name));

  const tp = golden.filter((f) => actualSet.has(f.name)).length;
  const fp = actual.filter((f) => !goldenSet.has(f.name)).length;
  const fn = golden.filter((f) => !actualSet.has(f.name)).length;

  return computeMetrics(tp, fp, fn);
}

function compareColumns(golden: GoldenColumn[], actual: Array<{ fieldName: string; title?: string }>): Metrics {
  const goldenSet = new Set(golden.map((c) => c.fieldName));
  const actualSet = new Set(actual.map((c) => c.fieldName));

  const tp = golden.filter((c) => actualSet.has(c.fieldName)).length;
  const fp = actual.filter((c) => !goldenSet.has(c.fieldName)).length;
  const fn = golden.filter((c) => !actualSet.has(c.fieldName)).length;

  return computeMetrics(tp, fp, fn);
}

function compareApis(golden: GoldenApi[], actual: Array<{ name: string }>): Metrics {
  const goldenSet = new Set(golden.map((a) => a.name));
  const actualSet = new Set(actual.map((a) => a.name));

  const tp = golden.filter((a) => actualSet.has(a.name)).length;
  const fp = actual.filter((a) => !goldenSet.has(a.name)).length;
  const fn = golden.filter((a) => !actualSet.has(a.name)).length;

  return computeMetrics(tp, fp, fn);
}

function computeMetrics(tp: number, fp: number, fn: number): Metrics {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, f1 };
}

function aggregateMetrics(metrics: Metrics[]): Metrics {
  const tp = metrics.reduce((sum, m) => sum + m.truePositives, 0);
  const fp = metrics.reduce((sum, m) => sum + m.falsePositives, 0);
  const fn = metrics.reduce((sum, m) => sum + m.falseNegatives, 0);
  return computeMetrics(tp, fp, fn);
}

// ─── CLI 输出 ───

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push('═══ Semantic Mapper Benchmark Report ═══');
  lines.push(`总页面数: ${report.totalPages}`);
  lines.push(`综合 Precision: ${(report.aggregate.precision * 100).toFixed(1)}%`);
  lines.push(`综合 Recall:    ${(report.aggregate.recall * 100).toFixed(1)}%`);
  lines.push(`综合 F1:        ${(report.aggregate.f1 * 100).toFixed(1)}%`);
  lines.push('');

  for (const r of report.results) {
    lines.push(`📄 ${r.pageId} — F1: ${(r.overallF1 * 100).toFixed(1)}%`);
    if (r.routeMetrics) lines.push(`   路由: P=${(r.routeMetrics.precision * 100).toFixed(0)}% R=${(r.routeMetrics.recall * 100).toFixed(0)}%`);
    if (r.fieldMetrics) lines.push(`   字段: P=${(r.fieldMetrics.precision * 100).toFixed(0)}% R=${(r.fieldMetrics.recall * 100).toFixed(0)}%`);
    if (r.columnMetrics) lines.push(`   列:   P=${(r.columnMetrics.precision * 100).toFixed(0)}% R=${(r.columnMetrics.recall * 100).toFixed(0)}%`);
    if (r.apiMetrics) lines.push(`   API:  P=${(r.apiMetrics.precision * 100).toFixed(0)}% R=${(r.apiMetrics.recall * 100).toFixed(0)}%`);
  }

  lines.push('');
  if (report.regexThresholdMet) {
    lines.push('✅ Regex 准确率 ≥ 85%，当前策略可继续');
  } else {
    lines.push('⚠️ Regex 准确率 < 85%，建议评估切换到纯 AST 模式');
  }

  return lines.join('\n');
}
