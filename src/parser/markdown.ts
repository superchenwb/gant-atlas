/**
 * Markdown 表格解析器
 */

const TABLE_ROW_REGEX = /^\|(.+)\|$/;
const TABLE_SEPARATOR_REGEX = /^\|[\s\-:|]+\|$/;

export interface ParsedTable {
  title?: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface ParsedMarkdown {
  title: string;
  sections: Array<{ heading: string; level: number; content: string }>;
  tables: ParsedTable[];
  raw: string;
}

/**
 * 解析 Markdown 内容
 */
export function parseMarkdown(rawContent: string): ParsedMarkdown {
  const lines = rawContent.split('\n');
  const sections: ParsedMarkdown['sections'] = [];
  const tables: ParsedTable[] = [];

  let currentHeading = '';
  let currentLevel = 0;
  let currentBodyLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 检测标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentHeading || currentBodyLines.length > 0) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentBodyLines.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentBodyLines = [];
      i++;
      continue;
    }

    // 检测表格
    if (TABLE_ROW_REGEX.test(line) && !TABLE_SEPARATOR_REGEX.test(line)) {
      const tableResult = parseTableAt(lines, i);
      if (tableResult) {
        tables.push({
          title: currentHeading || undefined,
          headers: tableResult.headers,
          rows: tableResult.rows,
        });
        currentBodyLines.push(...lines.slice(i, tableResult.endIndex));
        i = tableResult.endIndex;
        continue;
      }
    }

    currentBodyLines.push(line);
    i++;
  }

  if (currentHeading || currentBodyLines.length > 0) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentBodyLines.join('\n').trim(),
    });
  }

  const title = sections.find((s) => s.level === 1)?.heading || '';

  return { title, sections, tables, raw: rawContent };
}

function parseTableAt(
  lines: string[],
  startIndex: number
): { headers: string[]; rows: Record<string, string>[]; endIndex: number } | null {
  const headerMatch = TABLE_ROW_REGEX.exec(lines[startIndex]);
  if (!headerMatch) return null;

  const headers = splitCells(headerMatch[1]);
  if (headers.length < 2) {
    console.warn(`[gant-atlas] Table at line ${startIndex + 1} has fewer than 2 columns — skipping`);
    return null;
  }

  if (startIndex + 1 >= lines.length) {
    console.warn(`[gant-atlas] Table at line ${startIndex + 1} is missing separator row — skipping`);
    return null;
  }
  if (!TABLE_SEPARATOR_REGEX.test(lines[startIndex + 1])) {
    console.warn(`[gant-atlas] Table at line ${startIndex + 1} has invalid separator row — skipping`);
    return null;
  }

  const rows: Record<string, string>[] = [];
  let i = startIndex + 2;

  while (i < lines.length) {
    const rowLine = lines[i];
    const rowMatch = TABLE_ROW_REGEX.exec(rowLine);
    if (!rowMatch || TABLE_SEPARATOR_REGEX.test(rowLine)) break;

    const cells = splitCells(rowMatch[1]);
    if (cells.length > headers.length) {
      console.warn(`[gant-atlas] Row ${i + 1} has ${cells.length} cells but header has ${headers.length} — truncating`);
      cells.length = headers.length;
    }
    while (cells.length < headers.length) cells.push('');

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j].trim();
    }
    rows.push(row);
    i++;
  }

  if (rows.length === 0) {
    console.warn(`[gant-atlas] Table at line ${startIndex + 1} has no data rows — skipping`);
  }

  return rows.length > 0 ? { headers, rows, endIndex: i } : null;
}

export function splitCells(rowContent: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inCode = false;

  for (let i = 0; i < rowContent.length; i++) {
    const char = rowContent[i];
    const nextChar = rowContent[i + 1];

    if (char === '`') {
      inCode = !inCode;
      current += char;
    } else if (char === '\\' && nextChar === '|' && !inCode) {
      current += '|';
      i++;
    } else if (char === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // T9: unclosed backtick defense — reset state and warn
  if (inCode) {
    console.warn(`[gant-atlas] Unclosed backtick in table row: "${rowContent}" — treating as plain text`);
    inCode = false;
  }

  if (current.trim() || cells.length > 0) cells.push(current.trim());
  return cells;
}

/**
 * 从 key-value 表格中提取字段
 * 表格格式：| 属性 | 内容 |
 */
export function extractKeyValueTable(table: ParsedTable): Record<string, string> {
  const result: Record<string, string> = {};
  if (table.rows.length === 0) return result;

  const headers = Object.keys(table.rows[0]);
  if (headers.length < 2) return result;

  for (const row of table.rows) {
    const key = row[headers[0]];
    const value = row[headers[1]];
    if (key) result[key] = value;
  }

  return result;
}

/**
 * 查找指定标题下的表格
 */
export function findTablesByTitle(tables: ParsedTable[], titlePattern: string): ParsedTable[] {
  return tables.filter((t) => t.title?.includes(titlePattern));
}

/**
 * 查找指定标题下的 key-value 表格并提取
 */
export function extractKeyValuesByTitle(
  tables: ParsedTable[],
  titlePattern: string
): Record<string, string> {
  const matched = findTablesByTitle(tables, titlePattern);
  if (matched.length === 0) return {};
  return extractKeyValueTable(matched[0]);
}

/**
 * 从 Markdown 文本中提取 API 名称引用
 * 匹配模式: 驼峰命名 + Api 后缀，如 dataAuthGroupFindListApi
 */
export function extractAPIReferences(rawContent: string): string[] {
  const apiRegex = /\b([a-z][a-zA-Z0-9]*Api)\b/g;
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = apiRegex.exec(rawContent)) !== null) {
    matches.add(m[1]);
  }
  return Array.from(matches);
}

/**
 * 从文件名推断文档类型
 */
export function inferDocType(fileName: string): 'main' | 'search-area' | 'grid-area' | 'button-area' | 'tab-area' | 'header-area' | 'other' {
  const base = fileName.toLowerCase().replace(/\.md$/, '');
  switch (base) {
    case 'main': return 'main';
    case 'search-area':
    case 'searcharea': return 'search-area';
    case 'grid-area':
    case 'gridarea': return 'grid-area';
    case 'button-area':
    case 'buttonarea': return 'button-area';
    case 'tab-area':
    case 'tabarea': return 'tab-area';
    case 'header-area':
    case 'headerarea': return 'header-area';
    default: return 'other';
  }
}
