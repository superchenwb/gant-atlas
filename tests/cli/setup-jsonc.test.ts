import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mergeJsoncFile } from '../../src/cli/setup.js';

describe('mergeJsoncFile', () => {
  const tmpDir = join(tmpdir(), `gant-atlas-test-${Date.now()}`);

  beforeEach(() => {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new file when none exists', () => {
    const filePath = join(tmpDir, 'new.json');
    const entry = { command: 'gant-atlas', args: ['mcp', 'serve'] };
    const didWrite = mergeJsoncFile(filePath, ['mcpServers', 'gant-atlas'], entry);

    expect(didWrite).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.mcpServers['gant-atlas']).toEqual(entry);
  });

  it('appends to an existing file', () => {
    const filePath = join(tmpDir, 'existing.json');
    writeFileSync(filePath, JSON.stringify({ otherKey: true }, null, 2), 'utf-8');

    const entry = { command: 'npx', args: ['gant-atlas'] };
    const didWrite = mergeJsoncFile(filePath, ['mcpServers', 'gant-atlas'], entry);

    expect(didWrite).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.otherKey).toBe(true);
    expect(content.mcpServers['gant-atlas']).toEqual(entry);
  });

  it('skips when key already exists (idempotent)', () => {
    const filePath = join(tmpDir, 'idempotent.json');
    const existing = { mcpServers: { gantAtlas: { command: 'old' } } };
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');

    const entry = { command: 'new' };
    const didWrite = mergeJsoncFile(filePath, ['mcpServers', 'gantAtlas'], entry);

    expect(didWrite).toBe(false);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.mcpServers.gantAtlas.command).toBe('old');
  });

  it('preserves JSONC comments and formatting', () => {
    const filePath = join(tmpDir, 'with-comments.jsonc');
    const original = `{
  // This is a comment
  "existing": true,
  "trailing": "comma",
}`;
    writeFileSync(filePath, original, 'utf-8');

    const entry = { command: 'gant-atlas' };
    mergeJsoncFile(filePath, ['mcpServers', 'gant-atlas'], entry);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('// This is a comment');
    expect(content).toContain('"existing": true');
    expect(content).toContain('"mcpServers"');
  });

  it('creates parent directories if needed', () => {
    const filePath = join(tmpDir, 'deep', 'nested', 'mcp.json');
    const entry = { command: 'gant-atlas' };
    mergeJsoncFile(filePath, ['mcpServers', 'gant-atlas'], entry);

    expect(existsSync(filePath)).toBe(true);
  });
});
