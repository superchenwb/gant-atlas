/**
 * MethodParser —— 解析 Hook / Util 方法文件
 *
 * 处理 `hooks/<path>/<name>.md` 和 `utils/<path>/<name>.md`，
 * 提取方法节点。
 *
 * TODO: 当前为占位实现，需要补充真实的方法文档解析逻辑。
 */

import { readFile } from 'fs/promises';
import { parseMarkdown, extractKeyValueTable, findTablesByTitle } from '../parser/markdown.js';
import { nodeId } from '../types/graph.js';
import type { GraphNode } from '../types/graph.js';
import type { ParseResult } from './types.js';

export class MethodParser {
  canHandle(path: string): boolean {
    return path.includes('/hooks/') || path.includes('/utils/') ||
           path.includes('\\hooks\\') || path.includes('\\utils\\');
  }

  async parse(filePath: string): Promise<ParseResult> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch {
      return { nodes: [], edges: [] };
    }
    const parsed = parseMarkdown(raw);
    const kv = extractKeyValueTable(findTablesByTitle(parsed.tables, '概述')[0] || parsed.tables[0]);

    const name = parsed.title || kv['方法名'] || 'unknown';
    const methodId = this.inferMethodId(filePath);
    const nodeType = filePath.includes('/hooks/') || filePath.includes('\\hooks\\') ? 'method' : 'method';

    const node: GraphNode = {
      id: nodeId(nodeType, methodId),
      type: nodeType,
      name,
      title: kv['显示名'] || name,
      summary: kv['功能描述'] || kv['描述'] || '',
      tags: [],
      meta: {
        params: kv['参数'],
        returns: kv['返回值'],
        filePath,
      },
    };

    return { nodes: [node], edges: [] };
  }

  private inferMethodId(filePath: string): string {
    // 从路径推断方法 ID，如 .../hooks/useAuth.ts → hooks/useAuth
    const parts = filePath.split(/[/\\]/);
    const idx = parts.findIndex((p) => p === 'hooks' || p === 'utils');
    if (idx >= 0) {
      return parts.slice(idx).join('/').replace(/\.md$/, '');
    }
    return parts[parts.length - 1]?.replace(/\.md$/, '') || 'unknown';
  }
}
