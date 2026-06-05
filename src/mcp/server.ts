import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createStore } from '../store/sqlite.js';
import type { Store } from '../store/sqlite.js';
import { handleGetPageSpec } from './tools/get-page-spec.js';
import { handleSearchPages } from './tools/search-pages.js';
import { handleAnalyzeImpact } from './tools/analyze-impact.js';
import { handleCheckConsistency } from './tools/check-consistency.js';
import { handleListProjects } from './tools/list-projects.js';
import { handleGeneratePageSpec } from './tools/generate-page-spec.js';
import { handleListEntries } from './tools/list-entries.js';
import { handleExploreContext } from './tools/explore-context.js';
import { handleGetCallGraph } from './tools/get-call-graph.js';
import { handleFindDeadApis } from './tools/find-dead-apis.js';

export interface ProjectConfig {
  id: string;
  name: string;
  docsPath: string;
  dbPath: string;
  codeDir?: string;
  routesFile?: string;
}

export interface ServerConfig {
  projects: ProjectConfig[];
}

export function createServer(config: ServerConfig): Server {
  const server = new Server(
    {
      name: 'gant-atlas',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const projectMap = new Map<string, ProjectConfig>();
  const storeMap = new Map<string, Store>();

  for (const project of config.projects) {
    projectMap.set(project.id, project);
    storeMap.set(project.id, createStore(project.dbPath));
  }

  function getStore(projectId: string): Store | undefined {
    return storeMap.get(projectId);
  }

  // Shared output schema — all tools return { success, data/error, meta } via formatToolResult/formatToolError
  const outputSchema = {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' as const, description: 'Whether the tool call succeeded' },
      data: { type: 'object' as const, description: 'Response payload on success' },
      error: {
        type: 'object' as const,
        description: 'Error details on failure',
        properties: {
          code: { type: 'string' as const, enum: ['invalid_input', 'not_found', 'too_large', 'internal_error', 'fts_unavailable'] },
          message: { type: 'string' as const },
          details: { type: 'string' as const },
        },
      },
      meta: {
        type: 'object' as const,
        description: 'Response metadata',
        properties: {
          timestamp: { type: 'string' as const, format: 'date-time' },
          count: { type: 'number' as const },
          durationMs: { type: 'number' as const },
        },
      },
    },
  };

  const readOnlyAnnotations = { readOnlyHint: true, idempotentHint: true };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_page_spec',
          description: `获取指定页面的完整业务规格（字段、表格列、按钮、接口）。

WHEN TO USE: 当你需要查看某个页面的详细业务定义时使用。
AFTER THIS: 使用 analyze_impact 评估修改该页面相关字段或接口的影响。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              pageId: { type: 'string', description: '页面 ID（格式：module/pageName）' },
            },
            required: ['projectId', 'pageId'],
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
        {
          name: 'search_pages',
          description: `按关键词搜索页面。支持 FTS5 全文搜索（如果可用）或 LIKE 回退。

WHEN TO USE: 当你需要快速查找与某个关键词相关的页面时使用。支持模糊匹配和模块过滤。
AFTER THIS: 使用 get_page_spec 查看匹配页面的详细规格。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              keyword: { type: 'string', description: '搜索关键词' },
              module: { type: 'string', description: '模块名（可选，用于过滤）' },
            },
            required: ['projectId', 'keyword'],
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
        {
          name: 'analyze_impact',
          description: `分析修改某个接口/字段会影响哪些页面。支持多级影响传播和风险评级。

WHEN TO USE: 当你需要评估修改某个 API、字段或页面的影响范围时使用。适用于变更前的风险评估和测试范围确定。
AFTER THIS: 使用 get_call_graph 查看完整的上下游调用链。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              apiName: { type: 'string', description: '接口名称' },
              fieldName: { type: 'string', description: '字段名称' },
              pageId: { type: 'string', description: '页面 ID' },
              maxDepth: { type: 'number', description: '影响传播深度（1-5，默认 3）' },
            },
            required: ['projectId'],
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
        {
          name: 'check_consistency',
          description: `检查数据一致性问题（空字段、孤儿 API、字段/API 不匹配等）。

WHEN TO USE: 当你需要验证 feature-doc 与代码的同步状态时使用。适用于定期巡检。
AFTER THIS: 使用 find_dead_apis 清理已确认冗余的 API。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              pageId: { type: 'string', description: '页面 ID（可选，指定则只检查该页面）' },
            },
            required: ['projectId'],
          },
          outputSchema,
        },
        {
          name: 'generate_page_spec',
          description: `根据代码自动生成指定页面的 feature-doc Markdown 骨架。

WHEN TO USE: 当你需要为已有代码补全业务文档时使用。
AFTER THIS: 使用 check_consistency 验证生成的文档与实际代码的一致性。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              pageId: { type: 'string', description: '页面 ID（格式：module/pageName）' },
            },
            required: ['projectId', 'pageId'],
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
        {
          name: 'list_entries',
          description: `列出项目中的所有业务实体（页面、字段、按钮、API 等）。

WHEN TO USE: 当你需要概览项目中的全部业务实体时使用。
AFTER THIS: 使用 search_pages 或 explore_context 深入查看特定实体。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              type: { type: 'string', description: '实体类型过滤（可选：page | field | column | button | api | component | method）' },
            },
            required: ['projectId'],
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
        {
          name: 'list_projects',
          description: `列出所有已配置的项目。

WHEN TO USE: 当你需要查看当前可用的项目列表时使用。`,
          inputSchema: {
            type: 'object',
            properties: {},
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
        {
          name: 'explore_context',
          description: `根据自然语言查询探索业务上下文，返回最相关的页面、字段、API 及其关系。

WHEN TO USE: 当你需要理解某个业务概念涉及哪些页面和接口时使用。适用于模糊查询（如"支付流程"、"用户权限"）。
AFTER THIS: 使用 get_page_spec 查看具体页面的详细规格，或使用 analyze_impact 评估变更影响。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              query: { type: 'string', description: '自然语言查询，如"支付流程涉及哪些页面和接口"' },
              taskContext: { type: 'string', description: '当前任务背景，帮助排序结果（可选）' },
              maxNodes: { type: 'number', description: '返回的最大节点数（1-100，默认 20）' },
              includeCode: { type: 'boolean', description: '是否包含代码片段（默认 false）' },
            },
            required: ['projectId', 'query'],
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
        {
          name: 'get_call_graph',
          description: `给定 API 或页面，返回完整的调用链（上游调用者 + 下游被调用者）。

WHEN TO USE: 当你需要追溯某个 API 或页面的完整调用关系时使用。适用于影响分析前的上下游依赖梳理。
AFTER THIS: 使用 analyze_impact 评估变更对上下游的影响范围。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
              nodeId: { type: 'string', description: '节点 ID，如 api:createOrder 或 page:order/payment' },
              direction: { type: 'string', description: '遍历方向：upstream | downstream | both（默认 both）' },
              maxDepth: { type: 'number', description: '遍历深度（1-5，默认 2）' },
            },
            required: ['projectId', 'nodeId'],
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
        {
          name: 'find_dead_apis',
          description: `发现未被任何页面或字段引用的孤儿 API，以及未归属到页面的孤儿字段。

WHEN TO USE: 当你需要清理冗余业务实体，或检查 feature-doc 与代码的同步状态时使用。适用于定期巡检和重构前的清理工作。
AFTER THIS: 使用 analyze_impact 确认删除死 API 是否会影响其他模块。`,
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: '项目 ID' },
            },
            required: ['projectId'],
          },
          outputSchema,
          annotations: readOnlyAnnotations,
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const { projectId } = args as { projectId?: string };

    try {
      if (name === 'list_projects') {
        return await handleListProjects(config.projects);
      }

      if (!projectId || !storeMap.has(projectId)) {
        return {
          content: [
            {
              type: 'text',
              text: projectId
                ? `Unknown project: ${projectId}`
                : 'Missing projectId',
            },
          ],
          isError: true,
        };
      }

      const store = getStore(projectId)!;

      const project = projectMap.get(projectId!);

      switch (name) {
        case 'get_page_spec':
          return await handleGetPageSpec(store, args);
        case 'search_pages':
          return await handleSearchPages(store, args);
        case 'analyze_impact':
          return await handleAnalyzeImpact(store, args);
        case 'check_consistency':
          return await handleCheckConsistency(store, args);
        case 'generate_page_spec':
          return await handleGeneratePageSpec(store, args, project?.codeDir, project?.routesFile);
        case 'list_entries':
          return await handleListEntries(store, args);
        case 'explore_context':
          return await handleExploreContext(store, args);
        case 'get_call_graph':
          return await handleGetCallGraph(store, args);
        case 'find_dead_apis':
          return await handleFindDeadApis(store, args);
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
