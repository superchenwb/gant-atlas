import type { Store } from '../../store/sqlite.js';

export async function handleGetPageSpec(store: Store, args: unknown) {
  const { pageId } = args as { pageId: string };
  const nodeId = `page:${pageId}`;
  const page = store.getNodeById(nodeId);

  if (!page) {
    return {
      content: [
        {
          type: 'text',
          text: `页面 "${pageId}" 不存在`,
        },
      ],
    };
  }

  const edges = store.getEdgesFromSource(nodeId);
  const relatedNodes: Record<string, unknown>[] = [];

  for (const e of edges) {
    const node = store.getNodeById(e.target);
    if (!node) continue;

    if (e.type === 'contains') {
      relatedNodes.push({
        ...node,
        edges: store.getEdgesFromSource(node.id).filter((fe) => fe.type === 'calls'),
      });
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            page,
            relatedNodes,
            edges,
          },
          null,
          2
        ),
      },
    ],
  };
}
