/**
 * ComponentParser —— 解析组件目录结构
 *
 * 处理 `components/<name>/main.md`，提取组件节点。
 *
 * TODO: 当前为占位实现，需要补充真实的组件文档解析逻辑。
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { parseMarkdown, extractKeyValueTable, findTablesByTitle } from '../parser/markdown.js';
import { nodeId } from '../types/graph.js';
import type { GraphNode } from '../types/graph.js';
import type { ParseResult } from './types.js';

export class ComponentParser {
  canHandle(path: string): boolean {
    // 组件目录特征：components/ 下的目录，包含 main.md
    return path.includes('/components/') || path.includes('\\components\\');
  }

  async parse(componentPath: string): Promise<ParseResult> {
    let files: string[];
    try {
      files = await readdir(componentPath);
    } catch {
      return { nodes: [], edges: [] };
    }
    const mainFile = files.find((f) => f.toLowerCase() === 'main.md');
    if (!mainFile) {
      return { nodes: [], edges: [] };
    }

    const raw = await readFile(join(componentPath, mainFile), 'utf-8');
    const parsed = parseMarkdown(raw);
    const kv = extractKeyValueTable(findTablesByTitle(parsed.tables, '概述')[0] || parsed.tables[0]);

    const name = parsed.title || kv['组件名'] || 'unknown';
    const componentId = this.inferComponentId(componentPath);

    const node: GraphNode = {
      id: nodeId('component', componentId),
      type: 'component',
      name,
      title: kv['显示名'] || name,
      summary: kv['功能描述'] || '',
      tags: [],
      meta: {
        category: kv['分类'],
        props: kv['属性'],
      },
    };

    return { nodes: [node], edges: [] };
  }

  private inferComponentId(componentPath: string): string {
    // 从路径推断组件 ID，如 .../components/Button/main.md → component:Button
    const parts = componentPath.split(/[/\\]/);
    const idx = parts.indexOf('components');
    if (idx >= 0 && idx < parts.length - 1) {
      return parts.slice(idx + 1).join('/');
    }
    return parts[parts.length - 1] || 'unknown';
  }
}
