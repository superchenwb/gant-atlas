import type { Store } from '../../store/sqlite.js';
import { formatToolError } from './error.js';

/**
 * 按关键词搜索页面，支持 FTS5 全文搜索和模块过滤。
 *
 * WHEN TO USE: 当你需要快速查找与某个关键词相关的页面时使用。
 * 支持模糊匹配和模块过滤。
 * AFTER THIS: 使用 get_page_spec 查看匹配页面的详细规格。
 */
export async function handleSearchPages(store: Store, args: unknown) {
  const { projectId, keyword, module } = args as {
    projectId: string;
    keyword: string;
    module?: string;
  };

  // ─── Input validation ───
  if (!projectId || typeof projectId !== 'string') {
    return formatToolError({ code: 'invalid_input', message: 'projectId 是必填字符串' });
  }
  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    return formatToolError({ code: 'invalid_input', message: 'keyword 不能为空字符串' });
  }

  // ─── Search ───
  const trimmed = keyword.trim();

  // Try FTS5 first; fallback to LIKE if FTS5 unavailable or query fails
  let results = store.searchNodesFTS(trimmed);

  // If FTS5 returned nothing, try multi-keyword OR search via fallback
  if (results.length === 0 && !store.isFTS5Available()) {
    const keywords = trimmed.split(/\s+/).filter((k) => k.length >= 2);
    if (keywords.length > 1) {
      const seen = new Set<string>();
      for (const kw of keywords) {
        const matches = store.searchNodesFTS(kw);
        for (const n of matches) {
          if (!seen.has(n.id)) {
            seen.add(n.id);
            results.push(n);
          }
        }
      }
    }
  }

  // Filter by type = page
  results = results.filter((n) => n.type === 'page');

  // Filter by module if specified
  if (module) {
    results = results.filter((n) => n.module === module);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            results,
            total: results.length,
            keyword: trimmed,
            module: module ?? null,
            fts: store.isFTS5Available(),
          },
          null,
          2
        ),
      },
    ],
  };
}
