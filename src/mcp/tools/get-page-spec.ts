import type { Store } from '../../store/sqlite.js';

export async function handleGetPageSpec(store: Store, args: unknown) {
  const { pageId } = args as { pageId: string };
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

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(spec, null, 2),
      },
    ],
  };
}
