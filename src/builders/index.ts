/**
 * buildProjectAsync —— 统一项目图谱构建入口
 *
 * 遍历 docsPath 下的所有目录和文件，分发给注册的 EntityParser，
 * 收集所有节点和边，返回完整的 GraphProject。
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import type { GraphProject } from '../types/graph.js';
import { PageParser } from './page-builder.js';
import { ComponentParser } from './component-builder.js';
import { MethodParser } from './method-builder.js';
import type { EntityParser } from './types.js';

const DEFAULT_CONCURRENCY = 50;

/**
 * 轻量级并发限制 —— 不需要引入 p-limit 依赖
 */
async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * 构建项目图谱
 *
 * @param docsPath feature-docs 根目录
 * @returns 完整的节点 + 边图谱
 */
export async function buildProjectAsync(docsPath: string): Promise<GraphProject> {
  const parsers: EntityParser[] = [
    new ComponentParser(),
    new MethodParser(),
  ];

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Phase 1: 扫描模块/页面结构（现有结构）
  const modules = await listModulesAsync(docsPath);

  const pageParser = new PageParser();

  const moduleResults = await Promise.all(
    modules.map(async (module) => {
      const modulePath = join(docsPath, module);
      const pages = await listPagesAsync(modulePath);

      return withConcurrency(pages, DEFAULT_CONCURRENCY, async (page) => {
        const pagePath = join(modulePath, page);
        return pageParser.parse(pagePath, module, page);
      });
    })
  );

  for (const results of moduleResults) {
    for (const r of results) {
      nodes.push(...r.nodes);
      edges.push(...r.edges);
    }
  }

  // Phase 2: 扫描 components/ hooks/ utils/ 目录
  const extraDirs = ['components', 'hooks', 'utils'];
  for (const dir of extraDirs) {
    const dirPath = join(docsPath, dir);
    const items = await listDirectoryItemsAsync(dirPath);

    for (const itemPath of items) {
      const parser = parsers.find((p) => p.canHandle(itemPath));
      if (parser) {
        const result = await parser.parse(itemPath);
        nodes.push(...result.nodes);
        edges.push(...result.edges);
      }
    }
  }

  return { nodes: dedupeNodes(nodes), edges: dedupeEdges(edges) };
}

// ─── 目录扫描辅助函数 ───

async function listModulesAsync(docsPath: string): Promise<string[]> {
  const entries = await readdir(docsPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !['components', 'hooks', 'utils'].includes(e.name))
    .map((e) => e.name);
}

async function listPagesAsync(modulePath: string): Promise<string[]> {
  const entries = await readdir(modulePath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * 递归列出一个目录下的所有可解析项（文件或目录）
 */
async function listDirectoryItemsAsync(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const items: string[] = [];

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subItems = await listDirectoryItemsAsync(fullPath);
        items.push(...subItems);
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        items.push(fullPath);
      }
    }

    return items;
  } catch {
    // 目录不存在时返回空
    return [];
  }
}

// ─── 去重 ───

function dedupeNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Map<string, GraphNode>();
  for (const n of nodes) {
    seen.set(n.id, n);
  }
  return Array.from(seen.values());
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.source}|${e.target}|${e.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import type { GraphNode, GraphEdge } from '../types/graph.js';
