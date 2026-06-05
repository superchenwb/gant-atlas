/**
 * 四级验证体系（借鉴 Understand-Anything）
 *
 * 1. Sanitize    —— 清理 null/undefined，标准化大小写、空白
 * 2. Auto-fix    —— 填充默认值（missing type → 推断，missing title → 使用 name）
 * 3. Validate    —— 逐个验证节点/边，丢弃无效的，记录 issues
 * 4. Fatal       —— 无有效节点时返回致命错误
 */

import type { GraphNode, GraphEdge, NodeType, EdgeType } from '../types/graph.js';

export interface ValidationIssue {
  /** 问题级别 */
  level: 'warn' | 'error' | 'fatal';
  /** 问题描述 */
  message: string;
  /** 涉及节点 ID（如果有） */
  nodeId?: string;
  /** 涉及边（如果有） */
  edge?: GraphEdge;
}

export interface ValidationResult {
  /** 是否通过验证（至少有一个有效节点且没有 fatal） */
  valid: boolean;
  /** 清理并修复后的节点 */
  nodes: GraphNode[];
  /** 清理并修复后的边 */
  edges: GraphEdge[];
  /** 验证过程中发现的所有问题 */
  issues: ValidationIssue[];
}

const VALID_NODE_TYPES: NodeType[] = [
  'page', 'field', 'column', 'button', 'api',
  'component', 'method', 'modal', 'tab',
];

const VALID_EDGE_TYPES: EdgeType[] = [
  'contains', 'calls', 'opens', 'depends_on', 'belongs_to',
];

// ─────────────────────────────────────────
// Tier 1: Sanitize —— 清理与标准化
// ─────────────────────────────────────────

function sanitizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sanitizeArray<T>(value: unknown, itemSanitizer: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(itemSanitizer).filter((item) => item !== null && item !== undefined);
}

function sanitizeNode(node: unknown): GraphNode | null {
  if (!node || typeof node !== 'object') return null;

  const n = node as Record<string, unknown>;

  return {
    id: sanitizeString(n.id),
    type: sanitizeString(n.type) as NodeType,
    name: sanitizeString(n.name),
    title: sanitizeString(n.title),
    summary: sanitizeString(n.summary),
    tags: sanitizeArray(n.tags, sanitizeString),
    meta: n.meta && typeof n.meta === 'object' ? (n.meta as Record<string, unknown>) : undefined,
    module: n.module !== undefined ? sanitizeString(n.module) : undefined,
    docsPath: n.docsPath !== undefined ? sanitizeString(n.docsPath) : undefined,
    contentHash: n.contentHash !== undefined ? sanitizeString(n.contentHash) : undefined,
  };
}

function sanitizeEdge(edge: unknown): GraphEdge | null {
  if (!edge || typeof edge !== 'object') return null;

  const e = edge as Record<string, unknown>;

  return {
    source: sanitizeString(e.source),
    target: sanitizeString(e.target),
    type: sanitizeString(e.type) as EdgeType,
    description: e.description !== undefined ? sanitizeString(e.description) : undefined,
  };
}

// ─────────────────────────────────────────
// Tier 2: Auto-fix —— 智能修复
// ─────────────────────────────────────────

function autoFixNode(node: GraphNode): { node: GraphNode; fixes: string[] } {
  const fixes: string[] = [];
  const fixed = { ...node };

  // Fix 1: 推断缺失的 type
  if (!fixed.type) {
    const inferred = inferNodeTypeFromId(fixed.id);
    if (inferred) {
      fixed.type = inferred;
      fixes.push(`推断 type 为 '${inferred}' (从 id: ${fixed.id})`);
    }
  }

  // Fix 2: 缺失 title → 使用 name
  if (!fixed.title && fixed.name) {
    fixed.title = fixed.name;
    fixes.push(`填充 title = name (${fixed.name})`);
  }

  // Fix 3: 缺失 name → 使用 title
  if (!fixed.name && fixed.title) {
    fixed.name = fixed.title;
    fixes.push(`填充 name = title (${fixed.title})`);
  }

  // Fix 4: 缺失 summary → 空字符串
  if (!fixed.summary) {
    fixed.summary = '';
  }

  // Fix 5: 缺失 tags → 空数组
  if (!fixed.tags) {
    fixed.tags = [];
  }

  return { node: fixed, fixes };
}

/**
 * 从节点 ID 推断类型，如 "page:ibom/list" → "page"
 */
function inferNodeTypeFromId(id: string): NodeType | null {
  const sep = id.indexOf(':');
  if (sep === -1) return null;
  const prefix = id.slice(0, sep);
  if (VALID_NODE_TYPES.includes(prefix as NodeType)) {
    return prefix as NodeType;
  }
  return null;
}

// ─────────────────────────────────────────
// Tier 3: Validate —— 规则校验，丢弃无效项
// ─────────────────────────────────────────

interface ValidateNodeResult {
  valid: boolean;
  node?: GraphNode;
  issues: ValidationIssue[];
}

function validateNode(node: GraphNode): ValidateNodeResult {
  const issues: ValidationIssue[] = [];

  // 规则 1: id 不能为空
  if (!node.id) {
    issues.push({ level: 'error', message: '节点 id 为空', nodeId: '(unknown)' });
    return { valid: false, issues };
  }

  // 规则 2: type 必须有效
  if (!VALID_NODE_TYPES.includes(node.type)) {
    issues.push({
      level: 'error',
      message: `无效的节点类型 '${node.type}'`,
      nodeId: node.id,
    });
    return { valid: false, issues };
  }

  // 规则 3: name 或 title 至少有一个
  if (!node.name && !node.title) {
    issues.push({
      level: 'error',
      message: '节点 name 和 title 均为空',
      nodeId: node.id,
    });
    return { valid: false, issues };
  }

  // 规则 4: tags 必须是字符串数组
  if (node.tags && !Array.isArray(node.tags)) {
    issues.push({
      level: 'warn',
      message: 'tags 不是数组，已重置为空',
      nodeId: node.id,
    });
    node = { ...node, tags: [] };
  }

  return { valid: true, node, issues };
}

interface ValidateEdgeResult {
  valid: boolean;
  edge?: GraphEdge;
  issues: ValidationIssue[];
}

function validateEdge(edge: GraphEdge, validNodeIds: Set<string>): ValidateEdgeResult {
  const issues: ValidationIssue[] = [];

  // 规则 1: source 和 target 不能为空
  if (!edge.source) {
    issues.push({ level: 'error', message: '边的 source 为空', edge });
    return { valid: false, issues };
  }
  if (!edge.target) {
    issues.push({ level: 'error', message: '边的 target 为空', edge });
    return { valid: false, issues };
  }

  // 规则 2: type 必须有效
  if (!VALID_EDGE_TYPES.includes(edge.type)) {
    issues.push({
      level: 'error',
      message: `无效的边类型 '${edge.type}'`,
      edge,
    });
    return { valid: false, issues };
  }

  // 规则 3: source 和 target 必须指向存在的节点（可选，取决于场景）
  if (validNodeIds.size > 0) {
    if (!validNodeIds.has(edge.source)) {
      issues.push({
        level: 'warn',
        message: `边的 source 节点不存在: ${edge.source}`,
        edge,
      });
    }
    if (!validNodeIds.has(edge.target)) {
      issues.push({
        level: 'warn',
        message: `边的 target 节点不存在: ${edge.target}`,
        edge,
      });
    }
  }

  return { valid: true, edge, issues };
}

// ─────────────────────────────────────────
// Tier 4: Fatal —— 全局致命错误检查
// ─────────────────────────────────────────

function checkFatal(nodes: GraphNode[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (nodes.length === 0) {
    issues.push({
      level: 'fatal',
      message: '没有有效的节点 —— 图谱为空，无法继续',
    });
  }

  // 检测重复 ID
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) {
      issues.push({
        level: 'error',
        message: `检测到重复节点 ID: ${node.id}`,
        nodeId: node.id,
      });
    }
    seen.add(node.id);
  }

  return issues;
}

// ─────────────────────────────────────────
// 公开 API
// ─────────────────────────────────────────

/**
 * 验证并清理图谱数据
 *
 * 执行四级验证流程：
 * 1. Sanitize —— 清理 null/undefined，标准化字符串
 * 2. Auto-fix —— 推断缺失字段，填充默认值
 * 3. Validate —— 按规则校验，丢弃无效项，记录 issues
 * 4. Fatal —— 全局检查（空图谱、重复 ID 等）
 *
 * @param data 原始输入数据（可能来自 JSON、解析器、用户输入）
 * @returns 验证结果，包含清理后的节点/边列表和问题记录
 */
export function validateGraph(data: unknown): ValidationResult {
  const allIssues: ValidationIssue[] = [];

  // --- Tier 1: Sanitize ---
  let rawNodes: unknown[] = [];
  let rawEdges: unknown[] = [];

  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.nodes)) rawNodes = d.nodes;
    if (Array.isArray(d.edges)) rawEdges = d.edges;
  }

  const sanitizedNodes = rawNodes
    .map(sanitizeNode)
    .filter((n): n is GraphNode => n !== null);

  const sanitizedEdges = rawEdges
    .map(sanitizeEdge)
    .filter((e): e is GraphEdge => e !== null);

  // --- Tier 2: Auto-fix ---
  const fixedNodes: GraphNode[] = [];
  for (const node of sanitizedNodes) {
    const { node: fixed, fixes } = autoFixNode(node);
    for (const fix of fixes) {
      allIssues.push({ level: 'warn', message: fix, nodeId: fixed.id });
    }
    fixedNodes.push(fixed);
  }

  // --- Tier 3: Validate nodes ---
  const validNodes: GraphNode[] = [];
  const validNodeIds = new Set<string>();

  for (const node of fixedNodes) {
    const result = validateNode(node);
    allIssues.push(...result.issues);
    if (result.valid && result.node) {
      validNodes.push(result.node);
      validNodeIds.add(result.node.id);
    }
  }

  // --- Tier 3: Validate edges ---
  const validEdges: GraphEdge[] = [];
  for (const edge of sanitizedEdges) {
    const result = validateEdge(edge, validNodeIds);
    allIssues.push(...result.issues);
    if (result.valid && result.edge) {
      validEdges.push(result.edge);
    }
  }

  // --- Tier 4: Fatal checks ---
  const fatalIssues = checkFatal(validNodes);
  allIssues.push(...fatalIssues);

  const hasFatal = fatalIssues.some((i) => i.level === 'fatal');

  return {
    valid: !hasFatal && validNodes.length > 0,
    nodes: validNodes,
    edges: validEdges,
    issues: allIssues,
  };
}
