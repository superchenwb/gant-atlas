import type { Store } from '../../store/sqlite.js';

export async function handleCheckConsistency(store: Store, args: unknown) {
  const { pageId } = args as { pageId?: string };
  const db = store.db;
  const issues: Array<{ type: string; description: string; suggestion: string }> = [];

  // Helper to add issue with optional pageId scope
  const addIssue = (type: string, description: string, suggestion: string) => {
    issues.push({ type, description, suggestion });
  };

  // ─── 1. 页面信息不完整（page_type 或 route 缺失）───
  const incompletePages = db
    .prepare(`SELECT id, page_name, page_title FROM pages WHERE page_type IS NULL OR page_type = '' OR route IS NULL OR route = ''`)
    .all() as Array<{ id: string; page_name: string; page_title: string }>;

  for (const p of incompletePages) {
    if (pageId && p.id !== pageId) continue;
    addIssue(
      'incomplete_page',
      `页面 "${p.id}" (${p.page_title}) 缺少 page_type 或 route`,
      '检查 main.md 中的概述表格是否包含页面类型和路径'
    );
  }

  // ─── 2. 空字段列表（page 存在但无 fields）───
  const pagesWithoutFields = db
    .prepare(
      `SELECT p.id, p.page_title FROM pages p
       LEFT JOIN fields f ON p.id = f.page_id
       WHERE f.id IS NULL`
    )
    .all() as Array<{ id: string; page_title: string }>;

  for (const p of pagesWithoutFields) {
    if (pageId && p.id !== pageId) continue;
    addIssue(
      'empty_fields',
      `页面 "${p.id}" (${p.page_title}) 没有任何查询字段`,
      '检查是否缺少 search-area.md 或文件中的表格是否为空'
    );
  }

  // ─── 3. 空表格列（page 存在但无 grid_columns）───
  const pagesWithoutColumns = db
    .prepare(
      `SELECT p.id, p.page_title FROM pages p
       LEFT JOIN grid_columns c ON p.id = c.page_id
       WHERE c.id IS NULL`
    )
    .all() as Array<{ id: string; page_title: string }>;

  for (const p of pagesWithoutColumns) {
    if (pageId && p.id !== pageId) continue;
    addIssue(
      'empty_columns',
      `页面 "${p.id}" (${p.page_title}) 没有任何表格列`,
      '检查是否缺少 grid-area.md 或文件中的表格是否为空'
    );
  }

  // ─── 4. 孤儿 API（无任何 page 或 field 引用）───
  const orphanApis = db
    .prepare(
      `SELECT a.id, a.name FROM apis a
       LEFT JOIN page_calls_apis pca ON a.id = pca.api_id
       LEFT JOIN field_calls_apis fca ON a.id = fca.api_id
       WHERE pca.api_id IS NULL AND fca.api_id IS NULL`
    )
    .all() as Array<{ id: string; name: string }>;

  for (const a of orphanApis) {
    addIssue(
      'orphan_api',
      `API "${a.name}" 没有被任何页面或字段引用`,
      '检查 API 名称是否正确，或在 main.md / 其他文档中添加引用'
    );
  }

  // ─── 5. 字段名像 API 但未建立 fieldCallsApis 关系 ───
  const apiNames = new Set(
    (db.prepare(`SELECT name FROM apis`).all() as Array<{ name: string }>).map((r) => r.name)
  );

  const fieldsWithoutApiLink = db
    .prepare(
      `SELECT f.id, f.page_id, f.field_label, f.field_name FROM fields f
       LEFT JOIN field_calls_apis fca ON f.id = fca.field_id
       WHERE fca.field_id IS NULL`
    )
    .all() as Array<{ id: string; page_id: string; field_label: string; field_name: string }>;

  for (const f of fieldsWithoutApiLink) {
    if (pageId && f.page_id !== pageId) continue;
    if (apiNames.has(f.field_name)) {
      addIssue(
        'field_api_mismatch',
        `字段 "${f.field_label}" (fieldName=${f.field_name}) 匹配某个 API 名称但未建立关联`,
        '检查字段名是否意外与 API 名称相同，或确认是否需要建立 fieldCallsApis 关系'
      );
    }
  }

  // ─── 6. 页面引用了 API 但字段未引用（说明 API 只出现在 page 级别）───
  const pagesWithApiButNoFieldLink = db
    .prepare(
      `SELECT DISTINCT p.id, p.page_title FROM pages p
       JOIN page_calls_apis pca ON p.id = pca.page_id
       LEFT JOIN fields f ON p.id = f.page_id
       LEFT JOIN field_calls_apis fca ON f.id = fca.field_id
       WHERE fca.field_id IS NULL`
    )
    .all() as Array<{ id: string; page_title: string }>;

  for (const p of pagesWithApiButNoFieldLink) {
    if (pageId && p.id !== pageId) continue;
    addIssue(
      'page_api_no_field_link',
      `页面 "${p.id}" 引用了 API 但没有字段建立 API 关联`,
      '如果页面中的查询字段需要调用 API，检查 search-area.md 中的字段名是否与 API 名匹配'
    );
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            totalIssues: issues.length,
            issues,
            summary:
              issues.length === 0
                ? '所有检查通过，未发现一致性问题'
                : `发现 ${issues.length} 个一致性问题，请逐一排查`,
          },
          null,
          2
        ),
      },
    ],
  };
}
