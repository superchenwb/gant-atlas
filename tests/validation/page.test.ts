import { describe, it, expect } from 'vitest';
import { validateStandardPage } from '../../src/validation/page.js';
import { join } from 'path';

describe('validateStandardPage', () => {
  const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'test-module');

  it('reports flat-format page as standard (simple-page)', () => {
    const result = validateStandardPage(join(fixturesDir, 'simple-page'));
    expect(result.isStandard).toBe(true);
    expect(result.skippedByCustom).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.files).toHaveLength(4);
    expect(result.files.every((f) => f.exists)).toBe(true);
  });

  it('reports kv-format page as standard (kv-page)', () => {
    const result = validateStandardPage(join(fixturesDir, 'kv-page'));
    expect(result.isStandard).toBe(true);
    expect(result.issues).toHaveLength(0);
    // kv-page 使用 key-value 格式（| 属性 | 内容 |）
    const searchCheck = result.files.find((f) => f.fileName === 'search-area.md');
    expect(searchCheck?.headersValid).toBe(true);
  });

  it('reports custom-config page as standard (custom-page)', () => {
    // custom-page 使用 custom.yml 重映射文件名，只要目标文件存在且格式正确就是标准页面
    const result = validateStandardPage(join(fixturesDir, 'custom-page'));
    expect(result.isStandard).toBe(true);
    expect(result.skippedByCustom).toBe(false);
    // 检查重映射后的文件是否被正确识别（custom.yml 把 main 重映射为 overview.md）
    const mainCheck = result.files.find((f) => f.fileName === 'overview.md');
    expect(mainCheck?.exists).toBe(true);
  });

  it('reports missing directory as non-standard', () => {
    const result = validateStandardPage(join(process.cwd(), 'tests', 'fixtures', 'nonexistent-dir-12345'));
    expect(result.isStandard).toBe(false);
    expect(result.issues.some((i) => i.includes('目录不存在'))).toBe(true);
  });

  it('checks file-level details correctly', () => {
    const result = validateStandardPage(join(fixturesDir, 'simple-page'));
    const mainCheck = result.files.find((f) => f.fileName === 'main.md');
    expect(mainCheck).toBeDefined();
    expect(mainCheck!.exists).toBe(true);
    expect(mainCheck!.hasTable).toBe(true);
    expect(mainCheck!.headersValid).toBe(true);

    const searchCheck = result.files.find((f) => f.fileName === 'search-area.md');
    expect(searchCheck).toBeDefined();
    expect(searchCheck!.exists).toBe(true);
    expect(searchCheck!.headersValid).toBe(true);
  });

  it('reports page with bad table format as non-standard', () => {
    // 创建一个临时测试目录来验证格式错误的检测
    const { mkdtempSync, writeFileSync, rmSync } = require('fs');
    const { tmpdir } = require('os');
    const tmpDir = mkdtempSync(join(tmpdir(), 'atlas-test-'));

    // main.md 存在但表格格式完全不对
    writeFileSync(
      join(tmpDir, 'main.md'),
      '# Bad Page\n\n| Foo | Bar |\n|-----|-----|\n| 1 | 2 |\n'
    );
    // search-area.md 表格格式也不对
    writeFileSync(
      join(tmpDir, 'search-area.md'),
      '# Search\n\n| Foo | Bar |\n|-----|-----|\n| 1 | 2 |\n'
    );
    // grid-area.md 也不对
    writeFileSync(
      join(tmpDir, 'grid-area.md'),
      '# Grid\n\n| Foo | Bar |\n|-----|-----|\n| 1 | 2 |\n'
    );

    const result = validateStandardPage(tmpDir);
    expect(result.isStandard).toBe(false);
    // main.md 的表格首列不是 "属性"
    const mainCheck = result.files.find((f) => f.fileName === 'main.md');
    expect(mainCheck?.headersValid).toBe(false);

    rmSync(tmpDir, { recursive: true });
  });
});
