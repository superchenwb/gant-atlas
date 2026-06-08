/**
 * MCP tool: get_page_generation_context
 *
 * Returns a structured PageGenerationContext for a single page. This is the
 * raw material used by the /gant-atlas-generate skill (and by advanced MCP
 * clients) to produce complete feature-doc Markdown.
 *
 * Unlike generate_page_spec, this tool does NOT render Markdown; it returns
 * JSON containing route, schema fields, APIs, button/hook candidates, and
 * code snippets.
 */

import type { Store } from '../../store/sqlite.js';
import { scanRoutes, scanPageDir, resolveComponentPath } from '../../code-scanner.js';
import { buildPageGenerationContext } from '../../generator/context.js';
import { basename, join } from 'path';

export async function handleGetPageGenerationContext(
  _store: Store,
  args: unknown,
  codeDir?: string,
  routesFile?: string
) {
  const { pageId } = args as { pageId: string };

  if (!codeDir || !routesFile) {
    return {
      content: [
        {
          type: 'text' as const,
          text: '项目未配置 codeDir 或 routesFile，无法提取页面生成上下文。请在项目配置中添加 codeDir 和 routesFile 字段。',
        },
      ],
      isError: true,
    };
  }

  const routes = await scanRoutes(routesFile);
  const matchedRoute = routes.find((r) => {
    const cp = resolveComponentPath(r.component, codeDir);
    if (!cp) return false;
    const pn = basename(cp);
    const mn = basename(join(cp, '..'));
    return `${mn}/${pn}` === pageId;
  });

  if (!matchedRoute) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `未找到页面 "${pageId}" 对应的路由配置`,
        },
      ],
      isError: true,
    };
  }

  const componentPath = resolveComponentPath(matchedRoute.component, codeDir);
  if (!componentPath) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `无法解析组件路径: ${matchedRoute.component}`,
        },
      ],
      isError: true,
    };
  }

  const pageName = basename(componentPath);
  const moduleName = basename(join(componentPath, '..'));
  const info = await scanPageDir(componentPath, moduleName, pageName);
  const context = buildPageGenerationContext(info, matchedRoute);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(context, null, 2),
      },
    ],
  };
}
