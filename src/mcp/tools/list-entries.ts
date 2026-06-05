/**
 * list_entries MCP Tool
 *
 * 返回项目中的所有业务实体（页面、字段、表格列、按钮、API、组件、方法），
 * 按类型分组。支持按 node type 过滤。
 */

import type { Store } from '../../store/sqlite.js';

export interface ListEntriesInput {
  projectId: string;
  type?: string; // 可选过滤：page | field | column | button | api | component | method
}

export async function handleListEntries(store: Store, args: unknown) {
  const input = args as ListEntriesInput;
  const filterType = input.type;

  const nodes = store.listAllNodes();

  const grouped: Record<string, Array<{ id: string; name: string; title: string; type: string }>> = {};

  for (const node of nodes) {
    if (filterType && node.type !== filterType) continue;

    if (!grouped[node.type]) {
      grouped[node.type] = [];
    }

    grouped[node.type].push({
      id: node.id,
      name: node.name,
      title: node.title,
      type: node.type,
    });
  }

  const summary = Object.entries(grouped).map(([type, items]) => ({
    type,
    count: items.length,
    items,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ total: nodes.length, entries: summary }, null, 2),
      },
    ],
  };
}
