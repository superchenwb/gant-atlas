#!/usr/bin/env node
/**
 * merge-docs.mjs
 *
 * Copies generated Markdown files from the intermediate directory into the
 * final feature-docs tree.
 *
 * Usage:
 *   node merge-docs.mjs <intermediateDir> <docsPath>
 *
 * Expected intermediate layout (produced by page-writer agents):
 *   intermediate/
 *     module/
 *       pageName/
 *         main.md
 *         search-area.md
 *         grid-area.md
 *         button-area.md
 *         api-area.md
 *
 * Output:
 *   docsPath/module/pageName/*.md
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';

function walk(dir, cb) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, cb);
    } else if (ent.isFile()) {
      cb(full, ent.name);
    }
  }
}

async function main() {
  const [, , intermediateDir, docsPath] = process.argv;
  if (!intermediateDir || !docsPath) {
    process.stderr.write('Usage: node merge-docs.mjs <intermediateDir> <docsPath>\n');
    process.exit(1);
  }

  let copied = 0;
  let skipped = 0;

  walk(intermediateDir, (srcPath, name) => {
    if (extname(name) !== '.md') return;
    const rel = srcPath.slice(intermediateDir.length).replace(/^\/+/, '');
    const dest = join(docsPath, rel);

    try {
      mkdirSync(dirname(dest), { recursive: true });
      const existing = readFileSync(srcPath, 'utf-8');
      writeFileSync(dest, existing, 'utf-8');
      copied++;
    } catch (err) {
      process.stderr.write(`Warning: merge-docs: failed to copy ${rel}: ${err.message}\n`);
      skipped++;
    }
  });

  process.stderr.write(`merge-docs: copied ${copied} files, skipped ${skipped} -> ${docsPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`merge-docs failed: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
