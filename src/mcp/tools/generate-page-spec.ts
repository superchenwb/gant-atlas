import type { Store } from '../../store/sqlite.js';
import { scanRoutes, scanPageDir, resolveComponentPath } from '../../code-scanner.js';
import { generatePageSkeleton } from '../../generator.js';
import { basename, join } from 'path';

export async function handleGeneratePageSpec(
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
          text: '项目未配置 codeDir 或 routesFile，无法生成页面骨架。请在项目配置中添加 codeDir 和 routesFile 字段。',
        },
      ],
      isError: true,
    };
  }

  const routes = await scanRoutes(routesFile);
  let matchedRoute = routes.find((r) => {
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
  const skeleton = generatePageSkeleton(info, matchedRoute);

  const md = [
    skeleton.mainMd,
    skeleton.searchAreaMd,
    skeleton.gridAreaMd,
    skeleton.buttonAreaMd,
  ].join('\n');

  return {
    content: [
      {
        type: 'text' as const,
        text: md,
      },
    ],
  };
}
