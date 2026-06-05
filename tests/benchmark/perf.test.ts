import { describe, it, expect } from 'vitest';
import { runPerfBenchmark, formatPerfReport } from './perf.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('SQLite performance benchmark', () => {
  const dbPath = join(process.cwd(), 'tests', 'benchmark', 'perf-test.db');

  it('runs perf benchmark and reports metrics', () => {
    const report = runPerfBenchmark(dbPath);

    // 数据规模验证
    expect(report.dataStats.pages).toBeGreaterThanOrEqual(1000);
    expect(report.dataStats.totalNodes).toBeGreaterThanOrEqual(10000);
    expect(report.dataStats.totalEdges).toBeGreaterThanOrEqual(10000);

    // 所有测试都执行了
    expect(report.results.length).toBeGreaterThanOrEqual(4);

    // 格式化输出不报错
    const formatted = formatPerfReport(report);
    expect(formatted).toContain('SQLite Performance Benchmark');
    expect(formatted).toContain('p99');

    // 清理
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('get_page_spec p99 is under 200ms (relaxed for CI)', () => {
    const report = runPerfBenchmark(dbPath);
    const getPageSpec = report.results.find((r) => r.name === 'get_page_spec');
    expect(getPageSpec).toBeDefined();
    expect(getPageSpec!.p99Ms).toBeLessThan(200); // CI 环境放宽到 200ms

    try { rmSync(dbPath); } catch { /* ignore */ }
  });
});
