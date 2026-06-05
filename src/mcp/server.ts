import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { NAME, VERSION } from '../version.js';
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
import { formatToolError } from './tools/error.js';

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

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer(
    {
      name: NAME,
      version: VERSION,
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

  const readOnlyAnnotations = { readOnlyHint: true, idempotentHint: true };

  const GetPageSpecInputSchema = z.object({
    projectId: z.string(),
    pageId: z.string().min(1),
  });

  const SearchPagesInputSchema = z.object({
    projectId: z.string(),
    keyword: z.string().min(1),
    module: z.string().optional(),
  });

  const AnalyzeImpactInputSchema = z.object({
    projectId: z.string(),
    apiName: z.string().optional(),
    fieldName: z.string().optional(),
    pageId: z.string().optional(),
    maxDepth: z.number().int().min(1).max(5).optional(),
  });

  const CheckConsistencyInputSchema = z.object({
    projectId: z.string(),
    pageId: z.string().optional(),
  });

  const GeneratePageSpecInputSchema = z.object({
    projectId: z.string(),
    pageId: z.string().min(1),
  });

  const ListEntriesInputSchema = z.object({
    projectId: z.string(),
    type: z.string().optional(),
  });

  const ExploreContextInputSchema = z.object({
    projectId: z.string(),
    query: z.string().min(1),
    taskContext: z.string().optional(),
    maxNodes: z.number().int().min(1).max(100).optional(),
    includeCode: z.boolean().optional(),
  });

  const GetCallGraphInputSchema = z.object({
    projectId: z.string(),
    nodeId: z.string().min(1),
    direction: z.string().optional(),
    maxDepth: z.number().int().min(1).max(5).optional(),
  });

  const FindDeadApisInputSchema = z.object({
    projectId: z.string(),
  });

  const ListProjectsInputSchema = z.object({});

  server.registerTool('get_page_spec', {
    description: `获取指定页面的完整业务规格（字段、表格列、按钮、接口）。

WHEN TO USE: 当你需要查看某个页面的详细业务定义时使用。
AFTER THIS: 使用 analyze_impact 评估修改该页面相关字段或接口的影响。`,
    inputSchema: GetPageSpecInputSchema,
    annotations: readOnlyAnnotations,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    return handleGetPageSpec(store, args);
  });

  server.registerTool('search_pages', {
    description: `按关键词搜索页面。支持 FTS5 全文搜索（如果可用）或 LIKE 回退。

WHEN TO USE: 当你需要快速查找与某个关键词相关的页面时使用。支持模糊匹配和模块过滤。
AFTER THIS: 使用 get_page_spec 查看匹配页面的详细规格。`,
    inputSchema: SearchPagesInputSchema,
    annotations: readOnlyAnnotations,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    return handleSearchPages(store, args);
  });

  server.registerTool('analyze_impact', {
    description: `分析修改某个接口/字段会影响哪些页面。支持多级影响传播和风险评级。

WHEN TO USE: 当你需要评估修改某个 API、字段或页面的影响范围时使用。适用于变更前的风险评估和测试范围确定。
AFTER THIS: 使用 get_call_graph 查看完整的上下游调用链。`,
    inputSchema: AnalyzeImpactInputSchema,
    annotations: readOnlyAnnotations,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    return handleAnalyzeImpact(store, args);
  });

  server.registerTool('check_consistency', {
    description: `检查数据一致性问题（空字段、孤儿 API、字段/API 不匹配等）。

WHEN TO USE: 当你需要验证 feature-doc 与代码的同步状态时使用。适用于定期巡检。
AFTER THIS: 使用 find_dead_apis 清理已确认冗余的 API。`,
    inputSchema: CheckConsistencyInputSchema,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    return handleCheckConsistency(store, args);
  });

  server.registerTool('generate_page_spec', {
    description: `根据代码自动生成指定页面的 feature-doc Markdown 骨架。

WHEN TO USE: 当你需要为已有代码补全业务文档时使用。
AFTER THIS: 使用 check_consistency 验证生成的文档与实际代码的一致性。`,
    inputSchema: GeneratePageSpecInputSchema,
    annotations: readOnlyAnnotations,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    const project = projectMap.get(args.projectId);
    return handleGeneratePageSpec(store, args, project?.codeDir, project?.routesFile);
  });

  server.registerTool('list_entries', {
    description: `列出项目中的所有业务实体（页面、字段、按钮、API 等）。

WHEN TO USE: 当你需要概览项目中的全部业务实体时使用。
AFTER THIS: 使用 search_pages 或 explore_context 深入查看特定实体。`,
    inputSchema: ListEntriesInputSchema,
    annotations: readOnlyAnnotations,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    return handleListEntries(store, args);
  });

  server.registerTool('list_projects', {
    description: `列出所有已配置的项目。

WHEN TO USE: 当你需要查看当前可用的项目列表时使用。`,
    inputSchema: ListProjectsInputSchema,
    annotations: readOnlyAnnotations,
  }, async () => {
    return handleListProjects(config.projects);
  });

  server.registerTool('explore_context', {
    description: `根据自然语言查询探索业务上下文，返回最相关的页面、字段、API 及其关系。

WHEN TO USE: 当你需要理解某个业务概念涉及哪些页面和接口时使用。适用于模糊查询（如"支付流程"、"用户权限"）。
AFTER THIS: 使用 get_page_spec 查看具体页面的详细规格，或使用 analyze_impact 评估变更影响。`,
    inputSchema: ExploreContextInputSchema,
    annotations: readOnlyAnnotations,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    return handleExploreContext(store, args);
  });

  server.registerTool('get_call_graph', {
    description: `给定 API 或页面，返回完整的调用链（上游调用者 + 下游被调用者）。

WHEN TO USE: 当你需要追溯某个 API 或页面的完整调用关系时使用。适用于影响分析前的上下游依赖梳理。
AFTER THIS: 使用 analyze_impact 评估变更对上下游的影响范围。`,
    inputSchema: GetCallGraphInputSchema,
    annotations: readOnlyAnnotations,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    return handleGetCallGraph(store, args);
  });

  server.registerTool('find_dead_apis', {
    description: `发现未被任何页面或字段引用的孤儿 API，以及未归属到页面的孤儿字段。

WHEN TO USE: 当你需要清理冗余业务实体，或检查 feature-doc 与代码的同步状态时使用。适用于定期巡检和重构前的清理工作。
AFTER THIS: 使用 analyze_impact 确认删除死 API 是否会影响其他模块。`,
    inputSchema: FindDeadApisInputSchema,
    annotations: readOnlyAnnotations,
  }, async (args) => {
    const store = getStore(args.projectId);
    if (!store) {
      return formatToolError({ code: 'not_found', message: `Unknown project: ${args.projectId}` });
    }
    return handleFindDeadApis(store, args);
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
