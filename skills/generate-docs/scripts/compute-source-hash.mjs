#!/usr/bin/env node
/**
 * compute-source-hash.mjs
 *
 * Computes a SHA-256 hash of all source code files (.ts, .tsx, .js, .jsx)
 * in a page directory. Used for incremental generation — only pages whose
 * source hash has changed need to be regenerated.
 *
 * Usage:
 *   node compute-source-hash.mjs <pageDir>
 *
 * Output: prints the hex hash to stdout
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function computeSourceHash(pageDir) {
  const hash = createHash('sha256');

  let entries;
  try {
    entries = readdirSync(pageDir).sort();
  } catch {
    // Directory doesn't exist — return a stable hash indicating "empty"
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
      // Skip unreadable files
    }
  }

  // Include file count to distinguish empty dirs from hash collision edge cases
  hash.update(`fileCount:${fileCount}`);

  return hash.digest('hex');
}

const [, , pageDir] = process.argv;
if (!pageDir) {
  process.stderr.write('Usage: node compute-source-hash.mjs <pageDir>\n');
  process.exit(1);
}

const hex = computeSourceHash(pageDir);
process.stdout.write(hex);
