import type { Store } from '../../store/sqlite.js';
import { clamp } from '../../store/sqlite.js';
import type { GraphNode, GraphEdge } from '../../types/graph.js';
import { z } from 'zod';
import { formatToolError, formatToolResult, validateToolArgs } from './error.js';

const AnalyzeImpactSchema = z.object({
  apiName: z.string().optional(),
  fieldName: z.string().optional(),
  pageId: z.string().optional(),
  maxDepth: z.number().int().optional(),
});

/**
 * 分析修改某个接口/字段会影响哪些页面。
 *
 * WHEN TO USE: 当你需要评估修改某个 API、字段或页面的影响范围时使用。
 * 适用于变更前的风险评估和测试范围确定。
 * AFTER THIS: 使用 get_call_graph 查看完整的上下游调用链。
 */
export async function handleAnalyzeImpact(store: Store, args: unknown) {
  const validation = validateToolArgs(AnalyzeImpactSchema, args);
  if (!validation.ok) {
    return formatToolError(validation.error);
  }
  const { apiName, fieldName, pageId, maxDepth } = validation.data;

  const safeMaxDepth = clamp(maxDepth ?? 3, 1, 5);

  // ─── Case 1: 按 API 名称分析影响范围 ───
  if (apiName) {
    const apiNode = findApiNode(store, apiName);
    if (!apiNode) {
      return formatToolError({
        code: 'not_found',
        message: `API "${apiName}" 不存在`,
      });
    }

    const { affectedPages, affectedFields, affectedApis, indirectEffects } =
      analyzeApiImpact(store, apiNode, safeMaxDepth);

    const riskLevel = computeRiskLevel(affectedPages.length, affectedApis.length);

    return formatToolResult({
      target: apiName,
      targetType: 'api',
      riskLevel,
      affectedPages,
      affectedFields,
      affectedApis,
      indirectEffects,
      summary: `API "${apiName}" 被 ${affectedPages.length} 个页面直接引用，通过字段级联影响 ${indirectEffects.length} 个间接节点。风险等级：${riskLevel}。`,
    });
  }

  // ─── Case 2: 按字段名称分析影响范围 ───
  if (fieldName) {
    const matchingFields = store.listNodesByType('field').filter((f) => f.name === fieldName);
    if (matchingFields.length === 0) {
      return formatToolError({
        code: 'not_found',
        message: `字段 "${fieldName}" 不存在`,
      });
    }

    const affectedPageIds = new Set<string>();
    const indirectEffectIds = new Set<string>();
    const indirectEffects: GraphNode[] = [];

    const allEdges = store.listEdges();
    for (const field of matchingFields) {
      // Direct contains edges
      for (const e of allEdges) {
        if (e.target === field.id && e.type === 'contains') {
          affectedPageIds.add(e.source);
        }
      }

      // Indirect: field calls api → api affects other pages
      if (safeMaxDepth > 1) {
        const fieldEdges = store.getEdgesFromSource(field.id);
        for (const fe of fieldEdges) {
          if (fe.type === 'calls') {
            const apiNode = store.getNodeById(fe.target);
            if (apiNode && !indirectEffectIds.has(apiNode.id)) {
              indirectEffectIds.add(apiNode.id);
              indirectEffects.push(apiNode);
              const { affectedPages: apiPages } = analyzeApiImpact(store, apiNode, safeMaxDepth - 1);
              for (const p of apiPages) {
                if (p.id !== field.id) affectedPageIds.add(p.id);
              }
            }
          }
        }
      }
    }

    const affectedPages = Array.from(affectedPageIds)
      .map((id) => store.getNodeById(id))
      .filter(Boolean) as GraphNode[];

    const riskLevel = computeRiskLevel(affectedPages.length, indirectEffects.length);

    return formatToolResult({
      target: fieldName,
      targetType: 'field',
      riskLevel,
      affectedPages,
      affectedFields: matchingFields,
      indirectEffects,
      summary: `字段 "${fieldName}" 出现在 ${affectedPages.length} 个页面中，间接影响 ${indirectEffects.length} 个 API。风险等级：${riskLevel}。`,
    });
  }

  // ─── Case 3: 按页面 ID 分析影响范围 ───
  if (pageId) {
    const nodeId = `page:${pageId}`;
    const page = store.getNodeById(nodeId);
    if (!page) {
      return formatToolError({
        code: 'not_found',
        message: `页面 "${pageId}" 不存在`,
      });
    }

    const { nodes: callGraphNodes, edges: callGraphEdges } = buildPageImpactGraph(
      store,
      nodeId,
      safeMaxDepth
    );

    const pageApis = callGraphNodes.filter((n) => n.type === 'api');
    const relatedPages = callGraphNodes.filter(
      (n) => n.type === 'page' && n.id !== nodeId
    );

    const riskLevel = computeRiskLevel(relatedPages.length, pageApis.length);

    return formatToolResult({
      target: pageId,
      targetType: 'page',
      riskLevel,
      page,
      nodes: callGraphNodes.filter((n) => n.id !== nodeId),
      apis: pageApis,
      relatedPages,
      edges: callGraphEdges,
      summary: `页面 "${pageId}" 使用了 ${pageApis.length} 个 API，与 ${relatedPages.length} 个其他页面存在调用关系（深度 ${safeMaxDepth}）。风险等级：${riskLevel}。`,
    });
  }

  return formatToolError({
    code: 'invalid_input',
    message: '请提供 apiName、fieldName 或 pageId 之一',
  });
}

// ─── Helpers ───

function findApiNode(store: Store, apiName: string) {
  const apiNodes = store.listNodesByType('api');
  return apiNodes.find((n) => n.name === apiName) ?? null;
}

function analyzeApiImpact(
  store: Store,
  apiNode: GraphNode,
  maxDepth: number
): {
  affectedPages: GraphNode[];
  affectedFields: GraphNode[];
  affectedApis: GraphNode[];
  indirectEffects: GraphNode[];
} {
  const visited = new Set<string>();
  const affectedPageIds = new Set<string>();
  const affectedFieldIds = new Set<string>();
  const affectedApiIds = new Set<string>();
  const indirectEffectIds = new Set<string>();
  const indirectEffects: GraphNode[] = [];

  // BFS from the API node (reverse: who calls this API)
  let queue: Array<{ id: string; depth: number }> = [{ id: apiNode.id, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = store.getNodeById(id);
    if (!node) continue;

    if (node.type === 'page') affectedPageIds.add(id);
    if (node.type === 'field') affectedFieldIds.add(id);
    if (node.type === 'api' && id !== apiNode.id) affectedApiIds.add(id);

    if (depth >= maxDepth) continue;

    // Find all edges pointing TO this node (reverse traversal)
    const allEdges = store.listEdges();
    for (const e of allEdges) {
      if (e.target === id) {
        if (!visited.has(e.source)) {
          queue.push({ id: e.source, depth: depth + 1 });
        }
      }
    }

    // Also follow forward edges for indirect effects (API calls other APIs)
    for (const e of allEdges) {
      if (e.source === id && e.type === 'calls' && e.target !== apiNode.id) {
        const targetNode = store.getNodeById(e.target);
        if (targetNode && !visited.has(e.target) && !indirectEffectIds.has(e.target)) {
          indirectEffectIds.add(e.target);
          indirectEffects.push(targetNode);
          queue.push({ id: e.target, depth: depth + 1 });
        }
      }
    }
  }

  return {
    affectedPages: Array.from(affectedPageIds)
      .map((id) => store.getNodeById(id))
      .filter(Boolean) as GraphNode[],
    affectedFields: Array.from(affectedFieldIds)
      .map((id) => store.getNodeById(id))
      .filter(Boolean) as GraphNode[],
    affectedApis: Array.from(affectedApiIds)
      .map((id) => store.getNodeById(id))
      .filter(Boolean) as GraphNode[],
    indirectEffects,
  };
}

function buildPageImpactGraph(
  store: Store,
  pageId: string,
  maxDepth: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const resultNodes: GraphNode[] = [];
  const resultEdges: GraphEdge[] = [];

  let queue: Array<{ id: string; depth: number }> = [{ id: pageId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visitedNodes.has(id)) continue;
    visitedNodes.add(id);

    const node = store.getNodeById(id);
    if (node) resultNodes.push(node);

    if (depth >= maxDepth) continue;

    // Outgoing edges
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

    // Incoming edges (who references this node)
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

  return { nodes: resultNodes, edges: resultEdges };
}

function computeRiskLevel(pageCount: number, apiCount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (pageCount > 10 || apiCount > 5) return 'HIGH';
  if (pageCount >= 3 || apiCount >= 2) return 'MEDIUM';
  return 'LOW';
}
