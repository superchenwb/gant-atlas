import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type ServerConfig } from '../../src/mcp/server.js';
import { createStore } from '../../src/store/sqlite.js';
import { join } from 'path';
import { rmSync } from 'fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('createServer', () => {
  const dbPath = join(process.cwd(), 'tests', 'server-project.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);
    store.insertNode({ id: 'page:mod/page', type: 'page', name: 'page', title: 'Page', summary: '', tags: [] });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  async function createClientServer(config: ServerConfig) {
    const server = createServer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.1' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return { client, server };
  }

  it('lists available tools', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.listTools();
    expect(result.tools.map((t) => t.name)).toEqual([
      'get_page_spec',
      'search_pages',
      'analyze_impact',
      'check_consistency',
      'generate_page_spec',
      'list_entries',
      'list_projects',
      'explore_context',
      'get_call_graph',
      'find_dead_apis',
    ]);
  });

  it('calls get_page_spec tool successfully', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.callTool({
      name: 'get_page_spec',
      arguments: { projectId: 'p1', pageId: 'mod/page' },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text).data;
    expect(parsed.page.title).toBe('Page');
  });

  it('returns error for unknown project', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.callTool({
      name: 'get_page_spec',
      arguments: { projectId: 'unknown', pageId: 'mod/page' },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('Unknown project');
    expect(result.isError).toBe(true);
  });

  it('returns error for missing projectId', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.callTool({
      name: 'get_page_spec',
      arguments: { pageId: 'mod/page' },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    // McpServer performs input validation before reaching our handler
    expect(text).toContain('-32602');
    expect(text).toContain('projectId');
    expect(result.isError).toBe(true);
  });

  it('calls list_projects without projectId', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.callTool({
      name: 'list_projects',
      arguments: {},
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text).data;
    expect(parsed).toEqual([{ id: 'p1', name: 'P1' }]);
  });

  it('returns error for unknown tool', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.callTool({
      name: 'unknown_tool',
      arguments: { projectId: 'p1' },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    // McpServer returns its own error for unknown tools
    expect(text).toContain('unknown_tool');
    expect(text).toContain('-32602');
    expect(result.isError).toBe(true);
  });

  it('all tools declare annotations', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.listTools();
    for (const tool of result.tools) {
      if (tool.name !== 'check_consistency') {
        expect(tool.annotations?.readOnlyHint, `tool ${tool.name} should have annotations`).toBe(true);
      }
    }
  });

  it('tool responses conform to outputSchema structure', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.callTool({
      name: 'get_page_spec',
      arguments: { projectId: 'p1', pageId: 'mod/page' },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);

    // Verify outputSchema contract: { success, data|error, meta }
    expect(parsed).toHaveProperty('success');
    expect(typeof parsed.success).toBe('boolean');
    expect(parsed).toHaveProperty('meta');
    expect(parsed.meta).toHaveProperty('timestamp');

    if (parsed.success) {
      expect(parsed).toHaveProperty('data');
      expect(parsed).not.toHaveProperty('error');
    } else {
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toHaveProperty('code');
      expect(parsed.error).toHaveProperty('message');
    }
  });

  it('returns error for generate_page_spec when codeDir is not configured', async () => {
    const config: ServerConfig = {
      projects: [{ id: 'p1', name: 'P1', docsPath: '/docs', dbPath }],
    };
    const { client } = await createClientServer(config);

    const result = await client.callTool({
      name: 'generate_page_spec',
      arguments: { projectId: 'p1', pageId: 'test-module/simple-page' },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('codeDir');
    expect(result.isError).toBe(true);
  });

  it('calls generate_page_spec successfully when configured', async () => {
    const fixturesDir = join(process.cwd(), 'tests', 'fixtures');
    const config: ServerConfig = {
      projects: [
        {
          id: 'p1',
          name: 'P1',
          docsPath: '/docs',
          dbPath,
          codeDir: join(fixturesDir, 'test-module'),
          routesFile: join(fixturesDir, 'routes-maps.ts'),
        },
      ],
    };
    const { client } = await createClientServer(config);

    const result = await client.callTool({
      name: 'generate_page_spec',
      arguments: { projectId: 'p1', pageId: 'test-module/simple-page' },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('# 测试页面');
    expect(text).toContain('## 查询条件');
    expect(text).toContain('## 表格列');
    expect(text).toContain('## 按钮区域');
  });
});
