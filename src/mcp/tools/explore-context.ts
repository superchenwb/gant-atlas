import type { Store } from '../../store/sqlite.js';
import { validateInputLength } from '../../store/sqlite.js';
import type { GraphNode, GraphEdge } from '../../types/graph.js';
import { formatToolError } from './error.js';

/**
 * 根据自然语言查询探索业务上下文，返回最相关的页面、字段、API 及其关系。
 *
 * WHEN TO USE: 当你需要理解某个业务概念涉及哪些页面和接口时使用。
 * 适用于模糊查询（如"支付流程"、"用户权限"）。
 * AFTER THIS: 使用 get_page_spec 查看具体页面的详细规格，
 * 或使用 analyze_impact 评估变更影响。
 */
export async function handleExploreContext(store: Store, args: unknown) {
  const { projectId, query, taskContext, maxNodes, includeCode } = args as {
    projectId: string;
    query: string;
    taskContext?: string;
    maxNodes?: number;
    includeCode?: boolean;
  };

  // ─── Input validation ───
  if (!projectId || typeof projectId !== 'string') {
    return formatToolError({ code: 'invalid_input', message: 'projectId 是必填字符串' });
  }
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return formatToolError({ code: 'invalid_input', message: 'query 不能为空字符串' });
  }
  const lengthErr = (validateInputLength as (input: string) => string | null)(query);
  if (lengthErr) {
    return formatToolError({ code: 'too_large', message: lengthErr });
  }

  const safeMaxNodes = Math.max(1, Math.min(100, maxNodes ?? 20));
  const safeIncludeCode = includeCode ?? false;

  // ─── Step 1: Extract keywords ───
  const keywords = extractKeywords(query + (taskContext ? ' ' + taskContext : ''));
  if (keywords.length === 0) {
    return formatToolError({ code: 'invalid_input', message: '无法从 query 中提取有效关键词' });
  }

  // ─── Step 2: FTS search for seed nodes ───
  const seedNodes: GraphNode[] = [];
  const seenIds = new Set<string>();

  for (const kw of keywords) {
    const matches = store.searchNodesFTS(kw);
    for (const n of matches) {
      if (!seenIds.has(n.id)) {
        seenIds.add(n.id);
        seedNodes.push(n);
      }
    }
  }

  if (seedNodes.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `## 查询: "${query}"\n\n未找到匹配的业务节点。`,
        },
      ],
    };
  }

  // ─── Step 3: BFS expansion (depth 2) ───
  const { nodes: expandedNodes, edges: expandedEdges } = bfsExpand(store, seedNodes, 2, safeMaxNodes);

  // ─── Step 4: Relevance scoring ───
  const scored = expandedNodes.map((n) => ({
    node: n,
    score: scoreNode(n, keywords, seedNodes),
  }));
  scored.sort((a, b) => b.score - a.score);

  const topNodes = scored.slice(0, safeMaxNodes).map((s) => s.node);
  const topIds = new Set(topNodes.map((n) => n.id));
  const topEdges = expandedEdges.filter((e) => topIds.has(e.source) && topIds.has(e.target));

  // ─── Step 5: Format output ───
  const lines: string[] = [];
  lines.push(`## 查询: "${query}"`);
  lines.push('');

  // Core nodes by type
  const byType = groupByType(topNodes);
  for (const [type, items] of Object.entries(byType)) {
    if (items.length === 0) continue;
    lines.push(`### ${typeLabel(type)}`);
    for (const n of items) {
      const isSeed = seedNodes.some((s) => s.id === n.id);
      const marker = isSeed ? ' ⭐' : '';
      lines.push(`- **${n.id}** — ${n.title}${marker}`);
    }
    lines.push('');
  }

  // Relationship mapping
  if (topEdges.length > 0) {
    lines.push('### 关系映射');
    for (const e of topEdges) {
      lines.push(`${e.source} → ${e.type} → ${e.target}`);
    }
    lines.push('');
  }

  // Optional code snippets
  if (safeIncludeCode) {
    lines.push('### 相关代码');
    for (const n of topNodes.slice(0, 5)) {
      if (n.docsPath) {
        lines.push(`- ${n.docsPath}`);
      }
    }
    lines.push('');
  }

  lines.push(`_共找到 ${topNodes.length} 个相关节点，${topEdges.length} 条关系。_`);

  return {
    content: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  };
}

// ─── Helpers ───

function extractKeywords(text: string): string[] {
  // Split by common separators and filter
  const tokens = text
    .toLowerCase()
    .split(/[\s,;.!?，。！？、]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  // Deduplicate
  return Array.from(new Set(tokens));
}

function bfsExpand(
  store: Store,
  seeds: GraphNode[],
  maxDepth: number,
  maxNodes: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const visited = new Set<string>();
  const resultNodes: GraphNode[] = [];
  const resultEdges: GraphEdge[] = [];

  let queue: Array<{ id: string; depth: number }> = seeds.map((s) => ({ id: s.id, depth: 0 }));

  for (const s of seeds) {
    visited.add(s.id);
    resultNodes.push(s);
  }

  while (queue.length > 0 && resultNodes.length < maxNodes) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const outEdges = store.getEdgesFromSource(id);
    for (const e of outEdges) {
      resultEdges.push(e);
      if (!visited.has(e.target) && resultNodes.length < maxNodes) {
        visited.add(e.target);
        const node = store.getNodeById(e.target);
        if (node) {
          resultNodes.push(node);
          queue.push({ id: e.target, depth: depth + 1 });
        }
      }
    }

    const inEdges = store.getEdgesToTarget(id);
    for (const e of inEdges) {
      resultEdges.push(e);
      if (!visited.has(e.source) && resultNodes.length < maxNodes) {
        visited.add(e.source);
        const node = store.getNodeById(e.source);
        if (node) {
          resultNodes.push(node);
          queue.push({ id: e.source, depth: depth + 1 });
        }
      }
    }
  }

  return { nodes: resultNodes, edges: resultEdges };
}

function scoreNode(node: GraphNode, keywords: string[], seeds: GraphNode[]): number {
  let score = 0;
  const text = `${node.id} ${node.name} ${node.title} ${node.summary}`.toLowerCase();

  // Keyword match score
  for (const kw of keywords) {
    if (text.includes(kw)) score += 10;
  }

  // Seed proximity bonus
  if (seeds.some((s) => s.id === node.id)) {
    score += 50;
  }

  // Connection density bonus (more connected = more central)
  // This is approximated by node id patterns; in a real system we'd pre-compute degrees
  if (node.type === 'api') score += 5;
  if (node.type === 'page') score += 3;

  return score;
}

function groupByType(nodes: GraphNode[]): Record<string, GraphNode[]> {
  const groups: Record<string, GraphNode[]> = {};
  for (const n of nodes) {
    if (!groups[n.type]) groups[n.type] = [];
    groups[n.type].push(n);
  }
  return groups;
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    page: '页面',
    field: '字段',
    column: '表格列',
    button: '按钮',
    api: '接口',
    component: '组件',
    method: '方法',
    modal: '弹窗',
    tab: '标签页',
  };
  return labels[type] || type;
}
