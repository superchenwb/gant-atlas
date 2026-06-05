/**
 * 标准页面结构验证器
 *
 * 定义并验证"标准页面"的结构特征：
 * - 必须有 main.md（概述表格包含页面类型、路径、页面功能）
 * - search-area.md 如果存在，需包含字段定义表格
 * - grid-area.md 如果存在，需包含列定义表格
 * - button-area.md 如果存在，需包含按钮定义表格
 *
 * 非标准页面通过 custom.yml 的 parser: skip 机制跳过，或在此被标记。
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseMarkdown } from '../parser/markdown.js';
import { loadCustomYml, type CustomYmlConfig } from '../plugins/custom-yml.js';

export interface PageFileCheck {
  fileName: string;
  exists: boolean;
  hasTable: boolean;
  headersValid: boolean;
  issues: string[];
}

export interface StandardPageReport {
  /** 是否被判定为标准页面 */
  isStandard: boolean;
  /** 是否被 custom.yml 声明为非标准/跳过 */
  skippedByCustom: boolean;
  /** 各文件检查结果 */
  files: PageFileCheck[];
  /** 汇总问题 */
  issues: string[];
}

// ─── 预期列头定义 ───

/** main.md 概述表格的 key-value 格式首列 */
const MAIN_OVERVIEW_FIRST_HEADERS = ['属性', 'key'];

/** search-area.md 表格预期列头（至少包含这些之一） */
const SEARCH_EXPECTED_HEADERS = ['字段标签', '参数名', '字段名', '控件类型', '必填'];

/** grid-area.md 表格预期列头 */
const GRID_EXPECTED_HEADERS = ['列名', '列标题', '字段名', '显示内容', '展示内容'];

/** button-area.md 表格预期列头 */
const BUTTON_EXPECTED_HEADERS = ['按钮名称', '操作名称', '作用域', '操作类型', '位置'];

// ─── 公开 API ───

/**
 * 验证给定页面目录是否符合"标准页面"结构
 *
 * @param pagePath 页面目录的绝对路径
 * @returns 验证报告
 */
export function validateStandardPage(pagePath: string): StandardPageReport {
  let custom: CustomYmlConfig | null = null;
  try {
    custom = loadCustomYml(pagePath);
  } catch {
    // ignore
  }

  // custom.yml 显式声明跳过解析
  if (custom && (custom as Record<string, unknown>)['parser'] === 'skip') {
    return {
      isStandard: false,
      skippedByCustom: true,
      files: [],
      issues: ['custom.yml 声明 parser: skip'],
    };
  }

  let files: string[];
  try {
    files = readdirSync(pagePath);
  } catch {
    return {
      isStandard: false,
      skippedByCustom: false,
      files: [],
      issues: ['页面目录不存在或无法访问'],
    };
  }
  const fileChecks: PageFileCheck[] = [];
  const allIssues: string[] = [];

  // 1. main.md 检查（必须存在）
  const mainCheck = checkFile(pagePath, files, custom, 'main', 'main.md', undefined, {
    requireTable: true,
    firstHeaderMatch: MAIN_OVERVIEW_FIRST_HEADERS,
  });
  fileChecks.push(mainCheck);
  if (!mainCheck.exists) {
    allIssues.push(`缺少 main.md（页面概述文件）`);
  } else if (!mainCheck.hasTable) {
    allIssues.push(`main.md 缺少可解析的表格`);
  } else if (!mainCheck.headersValid) {
    allIssues.push(`main.md 表格格式不符合标准（预期 key-value 格式：| 属性 | 内容 |）`);
  }

  // 2. search-area.md 检查（可选，但如果存在需格式正确）
  const searchCheck = checkFile(pagePath, files, custom, 'search', 'search-area.md', SEARCH_EXPECTED_HEADERS, {
    requireTable: false,
  });
  fileChecks.push(searchCheck);
  if (searchCheck.exists && !searchCheck.headersValid) {
    allIssues.push(`search-area.md 表格列头不符合标准（预期包含：字段标签、参数名、控件类型 等）`);
  }

  // 3. grid-area.md 检查（可选）
  const gridCheck = checkFile(pagePath, files, custom, 'grid', 'grid-area.md', GRID_EXPECTED_HEADERS, {
    requireTable: false,
  });
  fileChecks.push(gridCheck);
  if (gridCheck.exists && !gridCheck.headersValid) {
    allIssues.push(`grid-area.md 表格列头不符合标准（预期包含：列名、字段名、显示内容 等）`);
  }

  // 4. button-area.md 检查（可选）
  const buttonCheck = checkFile(pagePath, files, custom, 'button', 'button-area.md', BUTTON_EXPECTED_HEADERS, {
    requireTable: false,
  });
  fileChecks.push(buttonCheck);
  if (buttonCheck.exists && !buttonCheck.headersValid) {
    allIssues.push(`button-area.md 表格列头不符合标准（预期包含：按钮名称、作用域、位置 等）`);
  }

  // 判定逻辑：必须有 main.md 且格式正确；其他区域文件如果存在也需格式正确
  const isStandard =
    mainCheck.exists && mainCheck.hasTable && mainCheck.headersValid &&
    fileChecks.every((f) => !f.exists || f.headersValid);

  return {
    isStandard,
    skippedByCustom: false,
    files: fileChecks,
    issues: allIssues,
  };
}

// ─── 辅助函数 ───

interface CheckOptions {
  /** 是否要求文件必须包含表格 */
  requireTable?: boolean;
  /** 如果是 key-value 表格，首列应匹配这些值之一 */
  firstHeaderMatch?: string[];
}

function checkFile(
  pagePath: string,
  files: string[],
  custom: CustomYmlConfig | null,
  customKey: 'main' | 'search' | 'grid' | 'button',
  defaultName: string,
  expectedHeaders: string[] | undefined,
  options: CheckOptions
): PageFileCheck {
  const configuredName = custom?.files?.[customKey];
  const targetName = configuredName || defaultName;
  const actualFile = files.find((f) => f.toLowerCase() === targetName.toLowerCase());

  if (!actualFile) {
    return {
      fileName: targetName,
      exists: false,
      hasTable: false,
      headersValid: true, // 不存在的文件不算格式错误
      issues: [],
    };
  }

  const filePath = join(pagePath, actualFile);
  if (!existsSync(filePath)) {
    return {
      fileName: targetName,
      exists: false,
      hasTable: false,
      headersValid: true,
      issues: [],
    };
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = parseMarkdown(raw);

    if (parsed.tables.length === 0) {
      return {
        fileName: targetName,
        exists: true,
        hasTable: false,
        headersValid: !options.requireTable,
        issues: options.requireTable ? ['未找到可解析的表格'] : [],
      };
    }

    // 检查第一个表格的列头
    const firstTable = parsed.tables[0];
    const headers = firstTable.headers.map((h) => h.trim().toLowerCase());

    // key-value 格式检查（首列匹配）
    if (options.firstHeaderMatch) {
      const firstHeader = headers[0] || '';
      const isKV = options.firstHeaderMatch.some((h) => firstHeader === h.toLowerCase());
      return {
        fileName: targetName,
        exists: true,
        hasTable: true,
        headersValid: isKV,
        issues: isKV ? [] : [`首列表头 "${firstHeader}" 不匹配预期: ${options.firstHeaderMatch.join('/')}`],
      };
    }

    // 标准表格列头检查：支持 key-value 格式（首列是"属性"/"key"）或 flat 格式（列头匹配预期值）
    if (expectedHeaders && expectedHeaders.length > 0) {
      const expectedLower = expectedHeaders.map((h) => h.toLowerCase());
      const firstHeader = headers[0] || '';
      const isKV = firstHeader === '属性' || firstHeader === 'key';
      const hasFlatMatch = headers.some((h) => expectedLower.includes(h));
      const valid = isKV || hasFlatMatch;
      return {
        fileName: targetName,
        exists: true,
        hasTable: true,
        headersValid: valid,
        issues: valid ? [] : [`列头 [${headers.join(', ')}] 未匹配预期列: ${expectedHeaders.join('/')}`],
      };
    }

    // 无特定格式要求，只要有表格就算通过
    return {
      fileName: targetName,
      exists: true,
      hasTable: true,
      headersValid: true,
      issues: [],
    };
  } catch (err) {
    return {
      fileName: targetName,
      exists: true,
      hasTable: false,
      headersValid: false,
      issues: [`读取或解析失败: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
