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

import { writeFileSync, readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

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

function loadPathAliases(codeDir) {
  try {
    const projectsPath = join(homedir(), '.gant-atlas', 'projects.json');
    if (!existsSync(projectsPath)) return {};
    const raw = readFileSync(projectsPath, 'utf-8');
    const data = JSON.parse(raw);
    const projects = data.projects || [];
    const project = projects.find((p) => {
      const pDir = p.codeDir || '';
      return (
        codeDir === pDir ||
        codeDir.startsWith(pDir + '/') ||
        pDir.startsWith(codeDir + '/')
      );
    });
    if (project && project.pathAliases) {
      return project.pathAliases;
    }
  } catch {
    // ignore
  }
  return {};
}

function resolveComponentPath(component, codeDir) {
  const aliases = loadPathAliases(codeDir);
  const entries = Object.entries(aliases);

  // Sort by prefix length descending so longer matches take priority
  entries.sort((a, b) => b[0].length - a[0].length);

  for (const [prefix, base] of entries) {
    if (component.startsWith(prefix)) {
      const fullPath = join(codeDir, base, component.slice(prefix.length));
      try {
        if (statSync(fullPath).isDirectory()) return fullPath;
      } catch {}
    }
  }

  // Legacy fallback for ibom-style paths
  let cleanPath = component.replace(/^@+/, '');
  cleanPath = cleanPath.replace(/^ibom(?:\/src)?\//, '');
  const fullPath = join(codeDir, cleanPath);
  try {
    const st = statSync(fullPath);
    if (st.isDirectory()) return fullPath;
  } catch {
    // Not found
  }
  return null;
}

async function main() {
  const [, , codeDir, routesFile, pageId, outputPath] = process.argv;
  if (!codeDir || !routesFile || !pageId || !outputPath) {
    process.stderr.write(
      'Usage: node extract-page-context.mjs <codeDir> <routesFile> <pageId> <outputPath>\n',
    );
    process.exit(1);
  }

  const { scanRoutes, scanPageDir, buildPageGenerationContext } = await resolveCore();
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

  // 页面类型检测
  context.pageType = detectPageType(pageDir);

  // Post-process: extract hook usages from index.tsx to supplement scanPageButtons
  const mainFile = join(pageDir, 'index.tsx');
  try {
    const indexContent = readFileSync(mainFile, 'utf-8');
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
