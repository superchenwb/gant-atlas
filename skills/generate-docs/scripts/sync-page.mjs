#!/usr/bin/env node
/**
 * sync-page.mjs
 *
 * Skill-internal Sync Hook entry point.
 *
 * Compares the existing feature-docs for a single page against the current
 * code, records the diff in the sync outbox, and prints the diff as JSON.
 *
 * Usage:
 *   node sync-page.mjs <docsPath> <dbPath> <codeDir> <routesFile> <pageId>
 *
 * Input:
 *   - docsPath:    feature-docs root directory
 *   - dbPath:      SQLite database path
 *   - codeDir:     code root directory
 *   - routesFile:  routes map file
 *   - pageId:      module/pageName
 *
 * Output JSON: SyncDiff (as returned by runSync)
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// skills/generate-docs/scripts/sync-page.mjs -> repo root needs 4 dirname steps
const PLUGIN_ROOT = dirname(dirname(dirname(dirname(__filename))));

async function resolveCore() {
  const actionsPath = join(PLUGIN_ROOT, 'dist', 'cli', 'actions.js');
  if (!existsSync(actionsPath)) {
    throw new Error(
      `Compiled core not found at ${actionsPath}. Run 'pnpm run build' first.`,
    );
  }
  const actions = await import(pathToFileURL(actionsPath).href);
  return actions;
}

async function main() {
  const [, , docsPath, dbPath, codeDir, routesFile, pageId] = process.argv;
  if (!docsPath || !dbPath || !codeDir || !routesFile || !pageId) {
    process.stderr.write(
      'Usage: node sync-page.mjs <docsPath> <dbPath> <codeDir> <routesFile> <pageId>\n',
    );
    process.exit(1);
  }

  const { runSync } = await resolveCore();
  const result = await runSync({
    docsPath,
    dbPath,
    codeDir,
    routesFile,
    pageId,
  });

  process.stderr.write(
    `sync-page: ${pageId} -> ${result.diff?.hasChanges ? '有变更' : '无变更'}\n`,
  );
  process.stdout.write(JSON.stringify(result.diff, null, 2));
}

main().catch((err) => {
  process.stderr.write(`sync-page failed: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
