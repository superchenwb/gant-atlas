import type { Store } from '../../store/sqlite.js';
import { z } from 'zod';
import { formatToolError, formatToolResult, validateToolArgs } from './error.js';

const GetPageSpecSchema = z.object({ pageId: z.string().min(1) });

export async function handleGetPageSpec(store: Store, args: unknown) {
  const validation = validateToolArgs(GetPageSpecSchema, args);
  if (!validation.ok) {
    return formatToolError(validation.error);
  }
  const { pageId } = validation.data;
  const nodeId = `page:${pageId}`;
  const page = store.getNodeById(nodeId);

  if (!page) {
    return formatToolError({
      code: 'not_found',
      message: `页面 "${pageId}" 不存在`,
    });
  }

  const edges = store.getEdgesFromSource(nodeId);
  const targets = edges.map((e) => e.target);
  const nodes = store.getNodesByIds(targets);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const relatedNodes: Record<string, unknown>[] = [];

  for (const e of edges) {
    const node = nodeMap.get(e.target);
    if (!node) continue;

    if (e.type === 'contains') {
      relatedNodes.push({
        ...node,
        edges: store.getEdgesFromSource(node.id).filter((fe) => fe.type === 'calls'),
      });
    }
  }

  return formatToolResult(
    { page, relatedNodes, edges },
    { count: relatedNodes.length }
  );
}
