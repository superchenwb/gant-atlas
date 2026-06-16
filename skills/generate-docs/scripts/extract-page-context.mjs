#!/usr/bin/env node
/**
 * extract-page-context.mjs
 *
 * Extracts a compact PageGenerationContext for a single page.
 *
 * Usage:
 *   node extract-page-context.mjs <codeDir> <routesFile> <pageId> <outputPath>
 *
 * Input:
 *   - codeDir:     root directory containing page components
 *   - routesFile:  path to the routes map file
 *   - pageId:      module/pageName (e.g. ibom/dataAuthGroup)
 *   - outputPath:  where to write the JSON context
 *
 * Output JSON: PageGenerationContext
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// skills/generate-docs/scripts/extract-page-context.mjs -> repo root needs 4 dirname steps
const PLUGIN_ROOT = dirname(dirname(dirname(dirname(__filename))));

async function resolveCore() {
  const distPath = join(PLUGIN_ROOT, 'dist', 'code-scanner.js');
  const contextPath = join(PLUGIN_ROOT, 'dist', 'generator', 'context.js');
  if (!existsSync(distPath) || !existsSync(contextPath)) {
    throw new Error(
      `Compiled core not found. Run 'pnpm run build' first.`,
    );
  }
  const scanner = await import(pathToFileURL(distPath).href);
  const context = await import(pathToFileURL(contextPath).href);
  return { ...scanner, ...context };
}

async function main() {
  const [, , codeDir, routesFile, pageId, outputPath] = process.argv;
  if (!codeDir || !routesFile || !pageId || !outputPath) {
    process.stderr.write(
      'Usage: node extract-page-context.mjs <codeDir> <routesFile> <pageId> <outputPath>\n',
    );
    process.exit(1);
  }

  const { scanRoutes, scanPageDir, buildPageGenerationContext, resolveComponentPath, loadPathAliases } = await resolveCore();
  const routes = await scanRoutes(routesFile);

  const targetRoute = routes.find((r) => {
    const pageDir = resolveComponentPath(r.component, codeDir);
    if (!pageDir) return false;
    const pageName = basename(pageDir);
    const moduleName = basename(dirname(pageDir));
    return `${moduleName}/${pageName}` === pageId;
  });

  if (!targetRoute) {
    process.stderr.write(`Error: page ${pageId} not found in routes\n`);
    process.exit(1);
  }

  const pageDir = resolveComponentPath(targetRoute.component, codeDir);
  if (!pageDir) {
    process.stderr.write(`Error: cannot resolve component path for ${pageId}\n`);
    process.exit(1);
  }

  const pageName = basename(pageDir);
  let moduleName = basename(dirname(pageDir));
  if (moduleName === 'src') {
    moduleName = basename(dirname(dirname(pageDir)));
  }

  const pathAliases = loadPathAliases(codeDir);
  const codeInfo = await scanPageDir(pageDir, moduleName, pageName, {
    codeDir,
    pathAliases,
  });
  const context = buildPageGenerationContext(codeInfo, targetRoute);

  // 页面类型检测：优先使用扫描器推断的结果，回退到路径启发式
  context.pageType = codeInfo.pageType ?? detectPageType(pageDir);

  // Post-process: extract hook usages from index.tsx to supplement scanPageButtons.
  // Only keep hooks imported from local files; skip framework hooks (procomponents, react, etc.).
  const mainFile = join(pageDir, 'index.tsx');
  try {
    const indexContent = readFileSync(mainFile, 'utf-8');
    const externalLibs = new Set([
      'react',
      'react-dom',
      'procomponents',
      'lodash-es',
      'lodash',
      '@gant/',
      '@ant-design',
      'antd',
    ]);

    // Build map: hookName -> import source
    const hookImportMap = new Map();
    const importRegex = /import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g;
    let im;
    while ((im = importRegex.exec(indexContent)) !== null) {
      const source = im[2];
      const isExternal = externalLibs.some((lib) => source === lib || source.startsWith(`${lib}/`));
      if (isExternal) {
        const names = im[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop());
        for (const name of names) {
          if (/^use[A-Z]\w*$/.test(name)) {
            hookImportMap.set(name, source);
          }
        }
      }
    }

    const usedHooks = new Set();
    const hookRegex = /\b(use[A-Z]\w+)\s*\(/g;
    let hm;
    while ((hm = hookRegex.exec(indexContent)) !== null) {
      const hookName = hm[1];
      if (
        [
          'useState',
          'useCallback',
          'useMemo',
          'useEffect',
          'useRef',
          'useContext',
          'useReducer',
          'useLayoutEffect',
        ].includes(hookName)
      ) {
        continue;
      }
      // Skip hooks known to come from external libraries
      if (hookImportMap.has(hookName)) continue;
      usedHooks.add(hookName);
    }
    for (const hookName of usedHooks) {
      if (!context.hooks.some((h) => h.name === hookName)) {
        context.hooks.push({ name: hookName, line: 0, apis: [] });
      }
    }
  } catch {
    // ignore if index.tsx doesn't exist
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(context, null, 2), 'utf-8');
  process.stderr.write(
    `extract-page-context: ${pageId} -> ${outputPath} ` +
    `(fields=${context.searchFields.length}, columns=${context.gridColumns.length}, ` +
    `apis=${context.apis.length}, buttons=${context.buttons.length}, hooks=${context.hooks.length})\n`,
  );
}

function detectPageType(pageDir) {
  // 简化的页面类型检测：文件夹路径中包含 /detail/ 或目录名为 detail 即为详情页
  const lower = pageDir.toLowerCase();
  if (lower.includes('/detail/') || lower.endsWith('/detail')) {
    return 'page-detail';
  }
  return 'page-main';
}

main().catch((err) => {
  process.stderr.write(`extract-page-context failed: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
