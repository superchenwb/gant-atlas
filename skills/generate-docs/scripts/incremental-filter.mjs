#!/usr/bin/env node
/**
 * incremental-filter.mjs
 *
 * Compares current source code hashes against a previous generation meta file
 * to determine which pages need regeneration. Outputs a filtered pages list
 * and an updated meta file.
 *
 * Usage:
 *   node incremental-filter.mjs <pagesJson> <metaJson> <outputPagesJson> <outputMetaJson> [--full]
 *
 * Input:
 *   - pagesJson:      path to pages.json from scan-pages.mjs
 *   - metaJson:       path to previous generate-meta.json (may not exist)
 *   - outputPagesJson: where to write filtered pages
 *   - outputMetaJson:  where to write updated meta
 *   - --full:          force full rebuild (include all pages)
 *
 * Output:
 *   - outputPagesJson: pages that need generation (unchanged pages removed)
 *   - outputMetaJson:  updated meta with current hashes
 *   - stderr: summary stats
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Compute SHA-256 of all source files in a page directory.
 */
function computeSourceHash(pageDir) {
  const hash = createHash('sha256');

  let entries;
  try {
    entries = readdirSync(pageDir).sort();
  } catch {
    return '0000000000000000000000000000000000000000000000000000000000000000';
  }

  let fileCount = 0;
  for (const entry of entries) {
    const ext = extname(entry);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    const filePath = join(pageDir, entry);
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) continue;

      hash.update(entry);
      hash.update(readFileSync(filePath, 'utf-8'));
      fileCount++;
    } catch {
      // skip unreadable files
    }
  }

  hash.update(`fileCount:${fileCount}`);
  return hash.digest('hex');
}

function main() {
  const args = process.argv.slice(2);
  const isFull = args.includes('--full');

  // Filter out flags to get positional args
  const positional = args.filter((a) => !a.startsWith('--'));

  const [pagesJsonPath, metaJsonPath, outputPagesPath, outputMetaPath] = positional;

  if (!pagesJsonPath || !metaJsonPath || !outputPagesPath || !outputMetaPath) {
    process.stderr.write(
      'Usage: node incremental-filter.mjs <pagesJson> <metaJson> <outputPagesJson> <outputMetaJson> [--full]\n',
    );
    process.exit(1);
  }

  // Read pages.json
  const pagesData = JSON.parse(readFileSync(pagesJsonPath, 'utf-8'));
  const pages = pagesData.pages || [];

  // Read previous meta (may not exist)
  let previousMeta = { version: 1, pages: {} };
  if (!isFull && existsSync(metaJsonPath)) {
    try {
      previousMeta = JSON.parse(readFileSync(metaJsonPath, 'utf-8'));
      if (!previousMeta.pages) previousMeta.pages = {};
    } catch {
      previousMeta = { version: 1, pages: {} };
    }
  }

  const now = new Date().toISOString();
  const changedPages = [];
  const skippedPages = [];
  const newMetaPages = { ...previousMeta.pages };

  for (const page of pages) {
    const currentHash = computeSourceHash(page.pageDir);
    const previousHash = previousMeta.pages[page.pageId]?.sourceHash;

    // Update meta with current hash
    newMetaPages[page.pageId] = {
      sourceHash: currentHash,
      ...(previousMeta.pages[page.pageId]?.generatedAt
        ? { generatedAt: previousMeta.pages[page.pageId].generatedAt }
        : {}),
    };

    if (isFull || currentHash !== previousHash) {
      changedPages.push(page);
    } else {
      skippedPages.push(page.pageId);
    }
  }

  // Write filtered pages
  const outputPagesData = {
    ...pagesData,
    totalPages: changedPages.length,
    originalTotalPages: pages.length,
    skippedPages: skippedPages.length,
    pages: changedPages,
  };
  writeFileSync(outputPagesPath, JSON.stringify(outputPagesData, null, 2), 'utf-8');

  // Write updated meta
  const outputMeta = {
    version: 1,
    lastFilteredAt: now,
    ...(isFull ? { lastFullRebuildAt: now } : {}),
    pages: newMetaPages,
  };
  writeFileSync(outputMetaPath, JSON.stringify(outputMeta, null, 2), 'utf-8');

  // Report to stderr
  process.stderr.write(
    `incremental-filter: ${changedPages.length} changed, ${skippedPages.length} unchanged` +
      (isFull ? ' (full rebuild)' : '') +
      ` -> ${outputPagesPath}\n`,
  );
}

main();
