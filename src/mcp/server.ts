import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Store } from '../store/sqlite.js';
import { handleGetPageSpec } from './tools/get-page-spec.js';
import { handleSearchPages } from './tools/search-pages.js';
import { handleAnalyzeImpact } from './tools/analyze-impact.js';
import { handleCheckConsistency } from './tools/check-consistency.js';
import { handleListProjects } from './tools/list-projects.js';

export interface ServerConfig {
  store: Store;
  projects: Array<{ id: string; name: string; docsPath: string }>;
}

export function createServer(config: ServerConfig): Server {
  const server = new Server(
    {
      name: 'gant-atlas',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_page_spec',
          description: '获取指定页面的完整业务规格（字段、表格列、按钮、接口）',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              pageId: { type: 'string', description: '页面 ID（格式：module/pageName）' },
            },
            required: ['projectId', 'pageId'],
          },
        },
        {
          name: 'search_pages',
          description: '按关键词搜索页面',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              keyword: { type: 'string', description: '搜索关键词' },
              module: { type: 'string', description: '模块名（可选，用于过滤）' },
            },
            required: ['projectId', 'keyword'],
          },
        },
        {
          name: 'analyze_impact',
          description: '分析修改某个接口/字段会影响哪些页面',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              apiName: { type: 'string', description: '接口名称' },
              fieldName: { type: 'string', description: '字段名称' },
              pageId: { type: 'string', description: '页面 ID' },
            },
            required: ['projectId'],
          },
        },
        {
          name: 'check_consistency',
          description: '检查数据一致性问题（空字段、孤儿 API、字段/API 不匹配等）',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              pageId: { type: 'string', description: '页面 ID（可选，指定则只检查该页面）' },
            },
            required: ['projectId'],
          },
        },
        {
          name: 'list_projects',
          description: '列出所有已配置的项目',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_page_spec':
          return await handleGetPageSpec(config.store, args);
        case 'search_pages':
          return await handleSearchPages(config.store, args);
        case 'analyze_impact':
          return await handleAnalyzeImpact(config.store, args);
        case 'check_consistency':
          return await handleCheckConsistency(config.store, args);
        case 'list_projects':
          return await handleListProjects(config.projects);
        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function serve(config: ServerConfig): Promise<void> {
  const server = createServer(config);
  const transport = new StdioServerTransport();

  // Ensure logs go to stderr, never stdout (MCP protocol isolation)
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    console.error(...args);
  };

  await server.connect(transport);

  // Restore after connect (though in stdio mode, the process usually runs until killed)
  console.log = originalConsoleLog;
}
