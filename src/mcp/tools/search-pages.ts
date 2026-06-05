import type { Store } from '../../store/sqlite.js';
import { z } from 'zod';
import { formatToolError, formatToolResult, validateToolArgs } from './error.js';

const SearchPagesSchema = z.object({
  projectId: z.string().min(1),
  keyword: z.string().min(1),
  module: z.string().optional(),
});

/**
 * 按关键词搜索页面，支持 FTS5 全文搜索和模块过滤。
 *
 * WHEN TO USE: 当你需要快速查找与某个关键词相关的页面时使用。
 * 支持模糊匹配和模块过滤。
 * AFTER THIS: 使用 get_page_spec 查看匹配页面的详细规格。
 */
export async function handleSearchPages(store: Store, args: unknown) {
  const validation = validateToolArgs(SearchPagesSchema, args);
  if (!validation.ok) {
    return formatToolError(validation.error);
  }
  const { keyword, module } = validation.data;

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

  return formatToolResult({
    results,
    total: results.length,
    keyword: trimmed,
    module: module ?? null,
    fts: store.isFTS5Available(),
  });
}
