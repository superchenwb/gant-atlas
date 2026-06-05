import type { Store } from '../../store/sqlite.js';
import { clamp } from '../../store/sqlite.js';
import type { GraphNode, GraphEdge } from '../../types/graph.js';
import { z } from 'zod';
import { formatToolError, formatToolResult, validateToolArgs } from './error.js';

const GetCallGraphSchema = z.object({
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  direction: z.enum(['upstream', 'downstream', 'both']).optional(),
  maxDepth: z.number().int().optional(),
});

/**
 * 给定 API 或页面，返回完整的调用链（上游调用者 + 下游被调用者）。
 *
 * WHEN TO USE: 当你需要追溯某个 API 或页面的完整调用关系时使用。
 * 适用于影响分析前的上下游依赖梳理。
 * AFTER THIS: 使用 analyze_impact 评估变更对上下游的影响范围。
 */
export async function handleGetCallGraph(store: Store, args: unknown) {
  const validation = validateToolArgs(GetCallGraphSchema, args);
  if (!validation.ok) {
    return formatToolError(validation.error);
  }
  const { nodeId, direction, maxDepth } = validation.data;

  const safeDirection = direction ?? 'both';
  if (!['upstream', 'downstream', 'both'].includes(safeDirection)) {
    return formatToolError({
      code: 'invalid_input',
      message: "direction 必须是 'upstream' | 'downstream' | 'both' 之一",
    });
  }

  const safeMaxDepth = clamp(maxDepth ?? 2, 1, 5);

  // ─── Verify node exists ───
  const startNode = store.getNodeById(nodeId);
  if (!startNode) {
    return formatToolError({
      code: 'not_found',
      message: `节点 "${nodeId}" 不存在`,
    });
  }

  // ─── BFS traversal ───
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const resultNodes: GraphNode[] = [];
  const resultEdges: GraphEdge[] = [];

  let queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visitedNodes.has(id)) continue;
    visitedNodes.add(id);

    const node = store.getNodeById(id);
    if (node) resultNodes.push(node);

    if (depth >= safeMaxDepth) continue;

    // Downstream: edges FROM this node
    if (safeDirection === 'downstream' || safeDirection === 'both') {
      const outEdges = store.getEdgesFromSource(id);
      for (const e of outEdges) {
        const edgeKey = `${e.source}-${e.target}-${e.type}`;
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey);
          resultEdges.push(e);
        }
        if (!visitedNodes.has(e.target)) {
          queue.push({ id: e.target, depth: depth + 1 });
        }
      }
    }

    // Upstream: edges TO this node
    if (safeDirection === 'upstream' || safeDirection === 'both') {
      const inEdges = store.getEdgesToTarget(id);
      for (const e of inEdges) {
        const edgeKey = `${e.source}-${e.target}-${e.type}`;
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey);
          resultEdges.push(e);
        }
        if (!visitedNodes.has(e.source)) {
          queue.push({ id: e.source, depth: depth + 1 });
        }
      }
    }
  }

  return formatToolResult(
    {
      startNode: startNode.id,
      direction: safeDirection,
      maxDepth: safeMaxDepth,
      nodes: resultNodes,
      edges: resultEdges,
      summary: `节点 "${startNode.id}" 的 ${safeDirection} 调用链：${resultNodes.length} 个节点，${resultEdges.length} 条关系（深度 ${safeMaxDepth}）`,
    },
    { count: resultNodes.length }
  );
}
