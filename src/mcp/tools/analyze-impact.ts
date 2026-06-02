import type { Store } from '../../store/sqlite.js';

export async function handleAnalyzeImpact(store: Store, args: unknown) {
  const { apiName, fieldName, pageId } = args as {
    apiName?: string;
    fieldName?: string;
    pageId?: string;
  };

  const db = store.db;

  // ─── Case 1: 按 API 名称分析影响范围 ───
  if (apiName) {
    // 1a. 找到直接引用该 API 的页面
    const pagesFromPage = db
      .prepare(
        `SELECT DISTINCT p.* FROM pages p
         JOIN page_calls_apis pca ON p.id = pca.page_id
         JOIN apis a ON pca.api_id = a.id
         WHERE a.name = ?`
      )
      .all(apiName) as PageRow[];

    // 1b. 通过 field_calls_apis 找到引用该 API 的字段和页面
    const fieldsFromAPI = db
      .prepare(
        `SELECT f.* FROM fields f
         JOIN field_calls_apis fca ON f.id = fca.field_id
         JOIN apis a ON fca.api_id = a.id
         WHERE a.name = ?`
      )
      .all(apiName) as FieldRow[];

    const pagesFromField = db
      .prepare(
        `SELECT DISTINCT p.* FROM pages p
         JOIN fields f ON p.id = f.page_id
         JOIN field_calls_apis fca ON f.id = fca.field_id
         JOIN apis a ON fca.api_id = a.id
         WHERE a.name = ?`
      )
      .all(apiName) as PageRow[];

    // 合并所有受影响的页面（按 id 去重）
    const pageMap = new Map<string, PageRow>();
    for (const p of pagesFromPage) pageMap.set(p.id, p);
    for (const p of pagesFromField) pageMap.set(p.id, p);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              target: apiName,
              targetType: 'api',
              affectedPages: Array.from(pageMap.values()).map(rowToPage),
              affectedFields: fieldsFromAPI.map(rowToField),
              summary: `API "${apiName}" 被 ${pageMap.size} 个页面引用`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // ─── Case 2: 按字段名称分析影响范围 ───
  if (fieldName) {
    const fields = db
      .prepare(`SELECT * FROM fields WHERE field_name = ?`)
      .all(fieldName) as FieldRow[];

    const pageIds = [...new Set(fields.map((f) => f.page_id))];
    const pages = pageIds
      .map((id) => db.prepare('SELECT * FROM pages WHERE id = ?').get(id) as PageRow | undefined)
      .filter(Boolean) as PageRow[];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              target: fieldName,
              targetType: 'field',
              affectedPages: pages.map(rowToPage),
              affectedFields: fields.map(rowToField),
              summary: `字段 "${fieldName}" 出现在 ${pages.length} 个页面中`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // ─── Case 3: 按页面 ID 分析影响范围 ───
  if (pageId) {
    const spec = store.getPageSpec(pageId);
    if (!spec.page) {
      return {
        content: [
          {
            type: 'text',
            text: `页面 "${pageId}" 不存在`,
          },
        ],
      };
    }

    // 找到该页面使用的所有 API
    const apiIds = (db
      .prepare(`SELECT api_id FROM page_calls_apis WHERE page_id = ?`)
      .all(pageId) as { api_id: string }[])
      .map((r) => r.api_id);

    const fieldApiIds = (db
      .prepare(
        `SELECT fca.api_id FROM field_calls_apis fca
         JOIN fields f ON fca.field_id = f.id
         WHERE f.page_id = ?`
      )
      .all(pageId) as { api_id: string }[])
      .map((r) => r.api_id);

    const allApiIds = [...new Set([...apiIds, ...fieldApiIds])];

    // 找到这些 API 被哪些其他页面使用
    const relatedPages = new Map<string, { page: PageRow; apis: string[] }>();

    if (allApiIds.length > 0) {
      const placeholders = allApiIds.map(() => '?').join(',');

      // 通过 page_calls_apis 关联的其他页面
      const rows = db
        .prepare(
          `SELECT p.*, a.name as api_name FROM pages p
           JOIN page_calls_apis pca ON p.id = pca.page_id
           JOIN apis a ON pca.api_id = a.id
           WHERE a.id IN (${placeholders}) AND p.id != ?`
        )
        .all(...allApiIds, pageId) as (PageRow & { api_name: string })[];

      for (const r of rows) {
        const existing = relatedPages.get(r.id);
        if (existing) {
          if (!existing.apis.includes(r.api_name)) existing.apis.push(r.api_name);
        } else {
          relatedPages.set(r.id, { page: r, apis: [r.api_name] });
        }
      }

      // 通过 field_calls_apis 关联的其他页面
      const rows2 = db
        .prepare(
          `SELECT p.*, a.name as api_name FROM pages p
           JOIN fields f ON p.id = f.page_id
           JOIN field_calls_apis fca ON f.id = fca.field_id
           JOIN apis a ON fca.api_id = a.id
           WHERE a.id IN (${placeholders}) AND p.id != ?`
        )
        .all(...allApiIds, pageId) as (PageRow & { api_name: string })[];

      for (const r of rows2) {
        const existing = relatedPages.get(r.id);
        if (existing) {
          if (!existing.apis.includes(r.api_name)) existing.apis.push(r.api_name);
        } else {
          relatedPages.set(r.id, { page: r, apis: [r.api_name] });
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              target: pageId,
              targetType: 'page',
              page: spec.page,
              fields: spec.fields,
              columns: spec.columns,
              buttons: spec.buttons,
              apis: spec.apis,
              relatedPages: Array.from(relatedPages.values()).map((r) => ({
                page: rowToPage(r.page),
                sharedApis: r.apis,
              })),
              summary: `页面 "${pageId}" 使用了 ${spec.apis.length} 个 API，与 ${relatedPages.size} 个其他页面共享 API`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: '请提供 apiName、fieldName 或 pageId 之一',
      },
    ],
    isError: true,
  };
}

// ─── Row mappers (local copy to avoid circular imports) ───

interface PageRow {
  id: string;
  module: string;
  page_name: string;
  page_title: string;
  page_type: string | null;
  route: string | null;
  page_function: string | null;
}

interface FieldRow {
  id: string;
  page_id: string;
  field_label: string;
  field_name: string;
  component_type: string;
  required: number;
  default_value: string | null;
}

function rowToPage(r: PageRow) {
  return {
    id: r.id,
    module: r.module,
    pageName: r.page_name,
    pageTitle: r.page_title,
    pageType: r.page_type ?? undefined,
    route: r.route ?? undefined,
    pageFunction: r.page_function ?? undefined,
  };
}

function rowToField(r: FieldRow) {
  return {
    id: r.id,
    pageId: r.page_id,
    fieldLabel: r.field_label,
    fieldName: r.field_name,
    componentType: r.component_type,
    required: r.required === 1,
    defaultValue: r.default_value ?? undefined,
  };
}
