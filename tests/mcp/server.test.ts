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
    store.insertPage({ id: 'mod/page', module: 'mod', pageName: 'page', pageTitle: 'Page' });
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
      'list_projects',
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
    const parsed = JSON.parse(text);
    expect(parsed.page.pageTitle).toBe('Page');
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
    expect(text).toContain('Missing projectId');
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
    const parsed = JSON.parse(text);
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
    expect(text).toContain('Unknown tool');
    expect(result.isError).toBe(true);
  });
});
