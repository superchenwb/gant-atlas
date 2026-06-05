/**
 * PageParser —— 解析页面目录结构
 *
 * 处理 `<module>/<page>/` 目录，提取：
 * - page 节点（来自 main.md）
 * - field 节点（来自 search-area.md）
 * - column 节点（来自 grid-area.md）
 * - button 节点（来自 button-area.md）
 * - api 节点（来自所有 md 文件中的 API 引用）
 * - 关系边（contains / calls）
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import {
  parseMarkdown,
  extractKeyValueTable,
  findTablesByTitle,
  extractAPIReferences,
} from '../parser/markdown.js';
import { loadCustomYmlAsync, type CustomYmlConfig } from '../plugins/custom-yml.js';
import { nodeId } from '../types/graph.js';
import type { GraphNode, GraphEdge } from '../types/graph.js';
import type { ParseResult } from './types.js';

export class PageParser {
  canHandle(_path: string): boolean {
    // 页面目录特征：包含 main.md
    // 简单启发式：目录 + 存在 main.md
    return true; // 实际匹配逻辑由调用方控制（目录级匹配）
  }

  async parse(pagePath: string, module: string, pageName: string): Promise<ParseResult> {
    const files = await readdir(pagePath);
    const custom = await loadCustomYmlAsync(pagePath);

    const mainFile = resolveFileName(files, custom, 'main', 'main.md');
    if (!mainFile) {
      return { nodes: [], edges: [] };
    }

    const pageId = `${module}/${pageName}`;

    // 并行解析所有区域文件
    const [pageNode, fieldNodes, columnNodes, buttonNodes, apiNodes] = await Promise.all([
      this.parseMain(join(pagePath, mainFile), module, pageName, custom),
      this.parseSearchArea(files, pagePath, pageId, custom),
      this.parseGridArea(files, pagePath, pageId, custom),
      this.parseButtonArea(files, pagePath, pageId, custom),
      this.parseAPIs(files, pagePath),
    ]);

    const nodes: GraphNode[] = [pageNode, ...fieldNodes, ...columnNodes, ...buttonNodes, ...apiNodes];

    // 去重 API 节点（同一页面内多个区域可能引用同一个 API）
    const uniqueNodes = dedupeNodes(nodes);

    // 构建关系边
    const edges = this.buildEdges(pageNode, fieldNodes, columnNodes, buttonNodes, apiNodes, uniqueNodes);

    return { nodes: uniqueNodes, edges };
  }

  // ─── Main 解析 ───

  private async parseMain(
    filePath: string,
    module: string,
    pageName: string,
    custom?: CustomYmlConfig | null
  ): Promise<GraphNode> {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = parseMarkdown(raw);
    const kv = extractKeyValueTable(findTablesByTitle(parsed.tables, '概述')[0] || parsed.tables[0]);
    const routeMatch = raw.match(/- 路径:\s*(.+)/);

    const pageId = `${module}/${pageName}`;
    const pageType = custom?.pageType ?? kv['页面类型'];

    return {
      id: nodeId('page', pageId),
      type: 'page',
      name: pageName,
      title: custom?.pageTitle ?? parsed.title ?? pageName,
      summary: custom?.pageFunction ?? kv['页面功能'] ?? '',
      tags: pageType ? [pageType] : [],
      module,
      meta: {
        route: custom?.route ?? routeMatch?.[1]?.trim() ?? kv['路径'],
        pageFunction: custom?.pageFunction ?? kv['页面功能'],
        pageType,
      },
    };
  }

  // ─── Search Area 解析 ───

  private async parseSearchArea(
    files: string[],
    pagePath: string,
    pageId: string,
    custom?: CustomYmlConfig | null
  ): Promise<GraphNode[]> {
    const fileName = custom?.files?.search || 'search-area.md';
    const file = files.find((f) => f.toLowerCase() === fileName.toLowerCase());
    if (!file) return [];

    const raw = await readFile(join(pagePath, file), 'utf-8');
    return this.parseArea(raw, pageId, 'field', (kv) => {
      const fieldLabel = kv['字段标签'] || kv['列名'] || '';
      const fieldName = kv['参数名'] || kv['字段名'] || '';
      if (!fieldLabel && !fieldName) return null;
      return {
        name: fieldName || fieldLabel,
        title: fieldLabel || fieldName,
        summary: '',
        meta: {
          componentType: kv['控件类型'] || '',
          required: (kv['必填'] || '').trim() === '是',
          defaultValue: kv['默认值'] || undefined,
        },
      };
    });
  }

  // ─── Grid Area 解析 ───

  private async parseGridArea(
    files: string[],
    pagePath: string,
    pageId: string,
    custom?: CustomYmlConfig | null
  ): Promise<GraphNode[]> {
    const fileName = custom?.files?.grid || 'grid-area.md';
    const file = files.find((f) => f.toLowerCase() === fileName.toLowerCase());
    if (!file) return [];

    const raw = await readFile(join(pagePath, file), 'utf-8');
    return this.parseArea(raw, pageId, 'column', (kv) => {
      const columnTitle = kv['列标题'] || kv['列名'] || '';
      if (!columnTitle) return null;

      const widthRaw = kv['宽度'] || kv['列宽'];
      const width = widthRaw ? parseInt(widthRaw, 10) : undefined;
      const safeWidth = width && !isNaN(width) ? width : undefined;

      return {
        name: kv['字段名'] || columnTitle,
        title: columnTitle,
        summary: kv['展示内容'] || kv['显示内容'] || columnTitle,
        meta: {
          editable: (kv['是否可编辑'] || kv['可编辑'] || '').trim() === '是',
          width: safeWidth,
          sortable: (kv['排序'] || '').trim() === '是',
          dataType: kv['数据类型'],
          align: kv['对齐'],
        },
      };
    });
  }

  // ─── Button Area 解析 ───

  private async parseButtonArea(
    files: string[],
    pagePath: string,
    pageId: string,
    custom?: CustomYmlConfig | null
  ): Promise<GraphNode[]> {
    const fileName = custom?.files?.button || 'button-area.md';
    const file = files.find((f) => f.toLowerCase() === fileName.toLowerCase());
    if (!file) return [];

    const raw = await readFile(join(pagePath, file), 'utf-8');
    return this.parseArea(raw, pageId, 'button', (kv) => {
      const buttonName = kv['按钮名称'] || kv['操作名称'] || '';
      if (!buttonName) return null;
      return {
        name: buttonName,
        title: buttonName,
        summary: kv['点击结果'] || kv['关联操作'] || '',
        tags: [kv['作用域'] || kv['操作类型'] || ''].filter(Boolean),
        meta: {
          position: kv['位置'],
          displayCondition: kv['显示条件'],
          disabledCondition: kv['禁用条件'],
          confirmRequired: (kv['确认弹窗'] || '').trim() === '是',
        },
      };
    });
  }

  // ─── API 提取 ───

  private async parseAPIs(files: string[], pagePath: string): Promise<GraphNode[]> {
    const apiNames = new Set<string>();

    await Promise.all(
      files.map(async (file) => {
        if (!file.toLowerCase().endsWith('.md')) return;
        const raw = await readFile(join(pagePath, file), 'utf-8');
        for (const name of extractAPIReferences(raw)) {
          apiNames.add(name);
        }
      })
    );

    return Array.from(apiNames).map((name) => ({
      id: nodeId('api', `api/${name}`),
      type: 'api',
      name,
      title: name,
      summary: '',
      tags: [],
      meta: {},
    }));
  }

  // ─── 通用区域解析 ───

  private parseArea(
    raw: string,
    pageId: string,
    nodeType: 'field' | 'column' | 'button',
    fromKV: (kv: Record<string, string>) => { name: string; title: string; summary: string; tags?: string[]; meta?: Record<string, unknown> } | null
  ): GraphNode[] {
    const parsed = parseMarkdown(raw);
    const items: GraphNode[] = [];

    for (const table of parsed.tables) {
      if (table.rows.length === 0) continue;

      const isKV = this.isKeyValueTable(table);

      if (isKV) {
        const kv = extractKeyValueTable(table);
        if (Object.keys(kv).length === 0) continue;
        const item = fromKV(kv);
        if (item) {
          items.push({
            ...item,
            id: nodeId(nodeType, `${pageId}/${nodeType}/${items.length}`),
            type: nodeType,
            tags: item.tags ?? [],
          });
        }
      } else {
        for (const row of table.rows) {
          const item = fromKV(row);
          if (item) {
            items.push({
              ...item,
              id: nodeId(nodeType, `${pageId}/${nodeType}/${items.length}`),
              type: nodeType,
              tags: item.tags ?? [],
            });
          }
        }
      }
    }

    return items;
  }

  private isKeyValueTable(table: { headers: string[]; rows: Record<string, string>[] }): boolean {
    const firstHeader = table.headers[0]?.trim().toLowerCase();
    return firstHeader === '属性' || firstHeader === 'key';
  }

  // ─── 关系边构建 ───

  private buildEdges(
    pageNode: GraphNode,
    fieldNodes: GraphNode[],
    columnNodes: GraphNode[],
    buttonNodes: GraphNode[],
    apiNodes: GraphNode[],
    allNodes: GraphNode[]
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const pageId = pageNode.id;

    // page contains field/column/button
    for (const f of fieldNodes) edges.push({ source: pageId, target: f.id, type: 'contains' });
    for (const c of columnNodes) edges.push({ source: pageId, target: c.id, type: 'contains' });
    for (const b of buttonNodes) edges.push({ source: pageId, target: b.id, type: 'contains' });

    // Build API name -> node map for edge resolution
    const apiMap = new Map<string, GraphNode>();
    for (const node of allNodes) {
      if (node.type === 'api') {
        apiMap.set(node.name, node);
      }
    }

    // page calls api (API mentioned in page context)
    for (const api of apiNodes) {
      const resolved = apiMap.get(api.name);
      if (resolved) {
        edges.push({ source: pageId, target: resolved.id, type: 'calls' });
      }
    }

    // field calls api (fieldName matches API name)
    for (const field of fieldNodes) {
      const api = apiMap.get(field.name);
      if (api) {
        edges.push({ source: field.id, target: api.id, type: 'calls' });
      }
    }

    return edges;
  }
}

// ─── 辅助函数 ───

function resolveFileName(
  files: string[],
  custom: CustomYmlConfig | null,
  key: 'main' | 'search' | 'grid' | 'button',
  defaultName: string
): string | undefined {
  const configuredName = custom?.files?.[key];
  const targetName = configuredName || defaultName;
  return files.find((f) => f.toLowerCase() === targetName.toLowerCase());
}

function dedupeNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}
