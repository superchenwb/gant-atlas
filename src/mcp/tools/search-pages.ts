import type { Store } from '../../store/sqlite.js';

export async function handleSearchPages(store: Store, args: unknown) {
  const { keyword, module } = args as { keyword: string; module?: string };
  const results = store.searchPages(keyword, module);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ results, total: results.length }, null, 2),
      },
    ],
  };
}
