#!/usr/bin/env node
/**
 * scan-pages.mjs
 *
 * Enumerates all pages that can be documented from a codebase.
 *
 * Usage:
 *   node scan-pages.mjs <codeDir> <routesFile> <outputPath>
 *
 * Input:
 *   - codeDir:     root directory containing page components (e.g. packages/ibom/src)
 *   - routesFile:  path to the routes map file (e.g. maps.ts)
 *
 * Output JSON:
 *   {
 *     "schemaVersion": 1,
 *     "totalPages": 3,
 *     "pages": [
 *       { "pageId": "ibom/dataAuthGroup", "route": "/data-auth-group", "pageDir": "..." }
 *     ]
 *   }
 */

import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// skills/generate-docs/scripts/scan-pages.mjs -> repo root needs 4 dirname steps
const PLUGIN_ROOT = dirname(dirname(dirname(dirname(__filename))));

// Resolve compiled core from dist/; fall back to building with tsx if absent.
async function resolveCore() {
  const distPath = join(PLUGIN_ROOT, 'dist', 'code-scanner.js');
  if (existsSync(distPath)) {
    return import(pathToFileURL(distPath).href);
  }
  throw new Error(
    `Compiled core not found at ${distPath}. Run 'pnpm run build' first.`,
  );
}

async function main() {
  const [, , codeDir, routesFile, outputPath] = process.argv;
  if (!codeDir || !routesFile || !outputPath) {
    process.stderr.write(
      'Usage: node scan-pages.mjs <codeDir> <routesFile> <outputPath>\n',
    );
    process.exit(1);
  }

  if (!existsSync(codeDir)) {
    process.stderr.write(`Error: codeDir does not exist: ${codeDir}\n`);
    process.exit(1);
  }
  if (!existsSync(routesFile)) {
    process.stderr.write(`Error: routesFile does not exist: ${routesFile}\n`);
    process.exit(1);
  }

  const { scanRoutes, resolveComponentPath } = await resolveCore();
  const routes = await scanRoutes(routesFile);

  const pages = [];
  for (const route of routes) {
    const pageDir = resolveComponentPath(route.component, codeDir);
    if (!pageDir) continue;
    const pageName = basename(pageDir);
    let moduleName = basename(dirname(pageDir));
    // Fix: when component path is like 'usersystem/src/login',
    // dirname(pageDir) becomes '.../usersystem/src', yielding moduleName='src'.
    // Use the package name as module instead.
    if (moduleName === 'src') {
      moduleName = basename(dirname(dirname(pageDir)));
    }
    const pageId = `${moduleName}/${pageName}`;
    pages.push({
      pageId,
      route: route.path,
      title: route.title,
      pageDir,
      module: moduleName,
      pageName,
    });
  }

  pages.sort((a, b) => a.pageId.localeCompare(b.pageId));

  const output = {
    schemaVersion: 1,
    totalPages: pages.length,
    codeDir,
    routesFile,
    pages,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  process.stderr.write(`scan-pages: found ${pages.length} pages -> ${outputPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`scan-pages failed: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
