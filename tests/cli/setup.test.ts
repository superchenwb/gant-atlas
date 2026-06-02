import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const tmpDir = join(tmpdir(), `gant-atlas-setup-${Date.now()}`);

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (answer: string) => void) => cb(join(tmpDir, 'projects.json'))),
    close: vi.fn(),
  })),
}));

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawnSync: vi.fn((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') {
        if (args[0] === 'gant-atlas') {
          return { status: 0, stdout: '/usr/local/bin/gant-atlas\n', stderr: '' };
        }
        return { status: 1, stdout: '', stderr: '' };
      }
      if (cmd === 'codex') {
        if (args[0] === '--version') {
          return { status: 1, stdout: '', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      }
      return actual.spawnSync(cmd, args);
    }),
  };
});

// Mock editor detection directories
const mockHomedir = join(tmpDir, 'home');
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => mockHomedir,
  };
});

describe('setupCommand', () => {
  beforeEach(() => {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    if (!existsSync(mockHomedir)) mkdirSync(mockHomedir, { recursive: true });

    // Write a dummy projects.json
    writeFileSync(join(tmpDir, 'projects.json'), JSON.stringify([{ id: 'p1', name: 'Test', docsPath: '/tmp/docs' }]), 'utf-8');
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('configures Cursor when .cursor directory exists', async () => {
    mkdirSync(join(mockHomedir, '.cursor'), { recursive: true });

    const { setupCommand } = await import('../../src/cli/setup.js');
    const result = await setupCommand();

    const cursorConfig = join(mockHomedir, '.cursor', 'mcp.json');
    expect(existsSync(cursorConfig)).toBe(true);
    const content = JSON.parse(readFileSync(cursorConfig, 'utf-8'));
    expect(content.mcpServers['gant-atlas']).toBeDefined();
    expect(content.mcpServers['gant-atlas'].command).toBe('/usr/local/bin/gant-atlas');

    const cursorEntry = result.editors.find((e) => e.name === 'Cursor');
    expect(cursorEntry?.status).toBe('ok');
  });

  it('configures Claude Code when .claude directory exists', async () => {
    mkdirSync(join(mockHomedir, '.claude'), { recursive: true });

    const { setupCommand } = await import('../../src/cli/setup.js');
    await setupCommand();

    const claudeConfig = join(mockHomedir, '.claude.json');
    expect(existsSync(claudeConfig)).toBe(true);
    const content = JSON.parse(readFileSync(claudeConfig, 'utf-8'));
    expect(content.mcpServers['gant-atlas']).toBeDefined();
  });

  it('skips already-configured editors (idempotent)', async () => {
    mkdirSync(join(mockHomedir, '.cursor'), { recursive: true });
    const cursorConfig = join(mockHomedir, '.cursor', 'mcp.json');
    writeFileSync(cursorConfig, JSON.stringify({ mcpServers: { 'gant-atlas': { command: 'old' } } }, null, 2), 'utf-8');

    const { setupCommand } = await import('../../src/cli/setup.js');
    const result = await setupCommand();

    const content = JSON.parse(readFileSync(cursorConfig, 'utf-8'));
    expect(content.mcpServers['gant-atlas'].command).toBe('old');

    const cursorEntry = result.editors.find((e) => e.name === 'Cursor');
    expect(cursorEntry?.status).toBe('ok');
    expect(cursorEntry?.detail).toContain('跳过');
  });

  it('reports no editors found when none are installed', async () => {
    // Do not create any editor directories
    const { setupCommand } = await import('../../src/cli/setup.js');
    const result = await setupCommand();

    expect(result.editors.length).toBe(0);
  });
});
