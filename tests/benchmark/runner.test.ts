import { describe, it, expect } from 'vitest';
import { benchmarkPage, runBenchmarkSuite, formatBenchmarkReport } from './runner.js';
import { join } from 'path';

describe('benchmark runner', () => {
  const fixturesDir = join(process.cwd(), 'tests', 'fixtures');
  const goldenDir = join(process.cwd(), 'tests', 'benchmark', 'fixtures');
  const routesFile = join(fixturesDir, 'routes-maps.ts');

  it('benchmarks simple-page against golden standard', async () => {
    const goldenPath = join(goldenDir, 'simple-page.golden.json');
    const result = await benchmarkPage(goldenPath, join(fixturesDir, 'test-module'), routesFile);

    expect(result).not.toBeNull();
    expect(result!.pageId).toBe('test-module/simple-page');

    // 路由：golden 中有 1 条，scanner 应该能匹配到
    expect(result!.routeMetrics).not.toBeNull();
    expect(result!.routeMetrics!.f1).toBe(1); // 完全匹配

    // 字段：golden 中有 2 条
    expect(result!.fieldMetrics).not.toBeNull();
    expect(result!.fieldMetrics!.precision).toBe(1);
    expect(result!.fieldMetrics!.recall).toBe(1);
    expect(result!.fieldMetrics!.f1).toBe(1);

    // 列
    expect(result!.columnMetrics).not.toBeNull();
    expect(result!.columnMetrics!.f1).toBe(1);

    // API
    expect(result!.apiMetrics).not.toBeNull();
    expect(result!.apiMetrics!.f1).toBe(1);

    // 总体 F1 应为 1.0
    expect(result!.overallF1).toBe(1);
  });

  it('runs full benchmark suite', async () => {
    const report = await runBenchmarkSuite(goldenDir, join(fixturesDir, 'test-module'), routesFile);

    expect(report.totalPages).toBeGreaterThanOrEqual(1);
    expect(report.aggregate.f1).toBeGreaterThanOrEqual(0);
    expect(report.regexThresholdMet).toBe(true); // fixture 数据完全匹配
  });

  it('formats report correctly', async () => {
    const report = await runBenchmarkSuite(goldenDir, join(fixturesDir, 'test-module'), routesFile);
    const formatted = formatBenchmarkReport(report);

    expect(formatted).toContain('Semantic Mapper Benchmark Report');
    expect(formatted).toContain('综合 F1');
    expect(formatted).toContain('test-module/simple-page');
  });
});
