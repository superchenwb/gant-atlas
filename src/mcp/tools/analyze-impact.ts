import type { Store } from '../../store/sqlite.js';

export async function handleAnalyzeImpact(store: Store, args: unknown) {
  const { apiName, fieldName, pageId } = args as {
    apiName?: string;
    fieldName?: string;
    pageId?: string;
  };

  // Phase 1 simplified implementation: return the queried page's spec as impact analysis
  // Full implementation would traverse relations across all pages
  const target = apiName || fieldName || pageId || 'unknown';
  const spec = pageId ? store.getPageSpec(pageId) : null;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            target,
            affectedPages: spec?.page ? [spec.page] : [],
            affectedFields: spec?.fields ?? [],
            affectedButtons: spec?.buttons ?? [],
            note: 'Full cross-page impact analysis requires multi-page relation traversal (Phase 2)',
          },
          null,
          2
        ),
      },
    ],
  };
}
