#!/usr/bin/env node
/**
 * update-generate-meta.mjs
 *
 * Updates the generate-meta.json after a successful generation run.
 * Marks the specified pages as successfully generated at the current timestamp.
 *
 * Usage:
 *   node update-generate-meta.mjs <metaJson> <pageId1> [pageId2] ...
 *
 * This reads the existing meta, updates generatedAt for each pageId, and writes back.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function main() {
  const [, , metaJsonPath, ...pageIds] = process.argv;

  if (!metaJsonPath || pageIds.length === 0) {
    process.stderr.write(
      'Usage: node update-generate-meta.mjs <metaJson> <pageId1> [pageId2] ...\n',
    );
    process.exit(1);
  }

  let meta = { version: 1, pages: {} };
  if (existsSync(metaJsonPath)) {
    try {
      meta = JSON.parse(readFileSync(metaJsonPath, 'utf-8'));
      if (!meta.pages) meta.pages = {};
    } catch {
      meta = { version: 1, pages: {} };
    }
  }

  const now = new Date().toISOString();
  meta.lastGeneratedAt = now;

  for (const pageId of pageIds) {
    if (meta.pages[pageId]) {
      meta.pages[pageId].generatedAt = now;
    } else {
      // Page not in meta yet (e.g. first generation or meta was deleted)
      meta.pages[pageId] = {
        sourceHash: 'unknown',
        generatedAt: now,
      };
    }
  }

  writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), 'utf-8');

  process.stderr.write(
    `update-generate-meta: marked ${pageIds.length} pages as generated -> ${metaJsonPath}\n`,
  );
}

main();
