import { createInterface } from 'readline';
import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import {
  parseTree as parseJsoncTree,
  modify as modifyJsonc,
  applyEdits,
  findNodeAtLocation,
} from 'jsonc-parser';

const VERSION = (() => {
  try {
    const selfDir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(selfDir, '../../package.json'), 'utf-8')
    );
    return (pkg.version as string) ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
})();

interface SetupResult {
  editors: Array<{ name: string; status: 'ok' | 'skipped' | 'error'; detail?: string }>;
  configPath: string;
  binary: string;
}

function resolveBin(): string | null {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where' : 'which';
  const result = spawnSync(cmd, ['gant-atlas'], {
    encoding: 'utf-8',
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 5000,
  });
  if (result.status === 0) {
    const bin = (result.stdout || '').trim().split(/\r?\n/)[0]?.trim();
    if (bin) return bin;
  }
  return null;
}

function getNpxBin(): string {
  return `npx -y gant-atlas@${VERSION}`;
}

function getMcpEntry(configPath: string) {
  const bin = resolveBin() ?? getNpxBin();
  const args = ['mcp', 'serve', '--config', configPath];
  if (bin.startsWith('npx ')) {
    return {
      command: 'npx',
      args: ['-y', `gant-atlas@${VERSION}`, ...args],
    };
  }
  return { command: bin, args };
}

function getOpenCodeMcpEntry(configPath: string) {
  const bin = resolveBin();
  const args = ['mcp', 'serve', '--config', configPath];
  if (bin) {
    return { type: 'local' as const, command: [bin, ...args] };
  }
  return {
    type: 'local' as const,
    command: ['npx', '-y', `gant-atlas@${VERSION}`, ...args],
  };
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function mergeJsoncFile(
  filePath: string,
  keyPath: string[],
  value: unknown
): boolean {
  let text = '';
  if (existsSync(filePath)) {
    text = readFileSync(filePath, 'utf-8');
  } else {
    text = '{}';
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const root = parseJsoncTree(text);
  if (!root) return false;
  const existing = findNodeAtLocation(root, keyPath);

  if (existing) {
    // Already configured — idempotent
    return false;
  }

  const edits = modifyJsonc(text, keyPath, value, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
    },
  });
  const updated = applyEdits(text, edits);
  writeFileSync(filePath, updated, 'utf-8');
  return true;
}

/* ---------- Editor detectors ---------- */

function detectCursor(): boolean {
  return existsSync(join(homedir(), '.cursor'));
}

function detectClaudeCode(): boolean {
  return existsSync(join(homedir(), '.claude'));
}

function detectAntigravity(): boolean {
  return existsSync(join(homedir(), '.gemini', 'antigravity'));
}

function detectOpenCode(): boolean {
  return existsSync(join(homedir(), '.config', 'opencode'));
}

function detectCodex(): boolean {
  try {
    const result = spawnSync('codex', ['--version'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/* ---------- Per-editor setup ---------- */

function setupCursor(configPath: string): { status: 'ok' | 'skipped' | 'error'; detail?: string } {
  const filePath = join(homedir(), '.cursor', 'mcp.json');
  try {
    const entry = getMcpEntry(configPath);
    const didWrite = mergeJsoncFile(filePath, ['mcpServers', 'gant-atlas'], entry);
    return { status: 'ok', detail: didWrite ? '已写入配置' : '配置已存在，跳过' };
  } catch (err) {
    return { status: 'error', detail: String(err) };
  }
}

function setupClaudeCode(configPath: string): { status: 'ok' | 'skipped' | 'error'; detail?: string } {
  const filePath = join(homedir(), '.claude.json');
  try {
    const entry = getMcpEntry(configPath);
    const didWrite = mergeJsoncFile(filePath, ['mcpServers', 'gant-atlas'], entry);
    return { status: 'ok', detail: didWrite ? '已写入配置' : '配置已存在，跳过' };
  } catch (err) {
    return { status: 'error', detail: String(err) };
  }
}

function setupAntigravity(configPath: string): { status: 'ok' | 'skipped' | 'error'; detail?: string } {
  const filePath = join(homedir(), '.gemini', 'antigravity', 'mcp_config.json');
  try {
    const entry = getMcpEntry(configPath);
    const didWrite = mergeJsoncFile(filePath, ['mcpServers', 'gant-atlas'], entry);
    return { status: 'ok', detail: didWrite ? '已写入配置' : '配置已存在，跳过' };
  } catch (err) {
    return { status: 'error', detail: String(err) };
  }
}

function setupOpenCode(configPath: string): { status: 'ok' | 'skipped' | 'error'; detail?: string } {
  const filePath = join(homedir(), '.config', 'opencode', 'opencode.json');
  try {
    const entry = getOpenCodeMcpEntry(configPath);
    const didWrite = mergeJsoncFile(filePath, ['mcp_servers', 'gant-atlas'], entry);
    return { status: 'ok', detail: didWrite ? '已写入配置' : '配置已存在，跳过' };
  } catch (err) {
    return { status: 'error', detail: String(err) };
  }
}

function setupCodex(configPath: string): { status: 'ok' | 'skipped' | 'error'; detail?: string } {
  const bin = resolveBin() ?? getNpxBin();
  const codexArgs = ['mcp', 'add', 'gant-atlas', '--command'];
  if (bin.startsWith('npx ')) {
    codexArgs.push('npx');
    codexArgs.push(`-y gant-atlas@${VERSION} mcp serve --config ${configPath}`);
  } else {
    codexArgs.push(`${bin} mcp serve --config ${configPath}`);
  }

  try {
    const result = spawnSync('codex', codexArgs, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0) {
      return { status: 'ok', detail: '已通过 codex CLI 添加' };
    }
    // Fallback: write TOML directly
    return setupCodexToml(configPath);
  } catch {
    return setupCodexToml(configPath);
  }
}

function setupCodexToml(configPath: string): { status: 'ok' | 'skipped' | 'error'; detail?: string } {
  const filePath = join(homedir(), '.codex', 'config.toml');
  try {
    const bin = resolveBin();
    let commandLine: string;
    if (bin) {
      commandLine = `${bin} mcp serve --config ${configPath}`;
    } else {
      commandLine = `npx -y gant-atlas@${VERSION} mcp serve --config ${configPath}`;
    }

    let text = '';
    if (existsSync(filePath)) {
      text = readFileSync(filePath, 'utf-8');
      // Very naive TOML idempotency check
      if (text.includes('[mcpServers.gant-atlas]') || text.includes('"gant-atlas"')) {
        return { status: 'ok', detail: '配置已存在，跳过' };
      }
    }

    if (!existsSync(dirname(filePath))) {
      mkdirSync(dirname(filePath), { recursive: true });
    }

    const section = `\n[mcpServers.gant-atlas]\ncommand = "${commandLine.split(' ')[0]}"\nargs = [${commandLine
      .split(' ')
      .slice(1)
      .map((a) => `"${a}"`)
      .join(', ')}]\n`;

    writeFileSync(filePath, text + section, 'utf-8');
    return { status: 'ok', detail: '已写入 ~/.codex/config.toml' };
  } catch (err) {
    return { status: 'error', detail: String(err) };
  }
}

/* ---------- Public command ---------- */

export async function setupCommand(): Promise<SetupResult> {
  const binary = resolveBin() ?? getNpxBin();

  // Prompt for projects.json path
  const defaultPath = join(process.cwd(), 'projects.json');
  const input = await prompt(
    `请输入 projects.json 配置文件路径 [${defaultPath}]: `
  );
  let configPath = input || defaultPath;
  if (!configPath.startsWith('/')) {
    configPath = join(process.cwd(), configPath);
  }

  if (!existsSync(configPath)) {
    console.error(`[gant-atlas] 警告: 配置文件不存在: ${configPath}`);
    console.error(`[gant-atlas] 请先创建配置文件，或运行 ingest 命令初始化数据库。`);
  }

  const editors: SetupResult['editors'] = [];

  if (detectCursor()) {
    editors.push({ name: 'Cursor', ...setupCursor(configPath) });
  }
  if (detectClaudeCode()) {
    editors.push({ name: 'Claude Code', ...setupClaudeCode(configPath) });
  }
  if (detectAntigravity()) {
    editors.push({ name: 'Antigravity', ...setupAntigravity(configPath) });
  }
  if (detectOpenCode()) {
    editors.push({ name: 'OpenCode', ...setupOpenCode(configPath) });
  }
  if (detectCodex()) {
    editors.push({ name: 'Codex', ...setupCodex(configPath) });
  }

  if (editors.length === 0) {
    console.log('[gant-atlas] 未检测到已安装的 AI 编辑器。');
    console.log('[gant-atlas] 支持的编辑器: Cursor, Claude Code, Antigravity, OpenCode, Codex');
  } else {
    console.log('\n[gant-atlas] MCP 配置结果:');
    for (const ed of editors) {
      const icon = ed.status === 'ok' ? '✓' : ed.status === 'skipped' ? '○' : '✗';
      console.log(`  ${icon} ${ed.name}: ${ed.detail ?? ed.status}`);
    }
    console.log('');
  }

  return { editors, configPath, binary };
}
