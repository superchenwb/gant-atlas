import type { Store } from '../../store/sqlite.js';
import { formatToolError } from './error.js';

/**
 * 检查数据一致性问题，发现未被任何页面或字段引用的孤儿 API 和字段。
 *
 * WHEN TO USE: 当你需要清理冗余业务实体，或检查 feature-doc 与代码的同步状态时使用。
 * 适用于定期巡检和重构前的清理工作。
 * AFTER THIS: 使用 analyze_impact 确认删除死 API 是否会影响其他模块。
 */
export async function handleFindDeadApis(store: Store, args: unknown) {
  const { projectId } = args as { projectId: string };

  // ─── Input validation ───
  if (!projectId || typeof projectId !== 'string') {
    return formatToolError({ code: 'invalid_input', message: 'projectId 是必填字符串' });
  }

  // ─── Find dead APIs (api nodes with no incoming edges) ───
  const deadApis = store.findDeadApis();

  // ─── Find orphan fields (field nodes with no containing page) ───
  const orphanFields = store.findOrphanFields();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            deadApis: deadApis.map((n) => ({ id: n.id, name: n.name, title: n.title })),
            orphanFields: orphanFields.map((n) => ({
              id: n.id,
              name: n.name,
              title: n.title,
            })),
            summary: `发现 ${deadApis.length} 个死 API 和 ${orphanFields.length} 个孤儿字段`,
          },
          null,
          2
        ),
      },
    ],
  };
}
