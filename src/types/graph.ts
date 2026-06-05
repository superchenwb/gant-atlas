/**
 * 统一图谱模型类型定义
 *
 * 将 Page/Field/Column/Button/API 等碎片化类型统一为 GraphNode + GraphEdge，
 * 支持未来扩展组件、Hook、工具函数等实体。
 *
 * 本文件 **不依赖** index.ts 中的旧类型，避免循环引用。
 */

// ─────────────────────────────────────────
// 节点类型
// ─────────────────────────────────────────

export type NodeType =
  | 'page'
  | 'field'
  | 'column'
  | 'button'
  | 'api'
  | 'component'
  | 'method'
  | 'modal'
  | 'tab';

/**
 * 图谱节点 —— 统一实体模型
 *
 * 所有业务实体（页面、字段、按钮、API 等）都通过 GraphNode 表达，
 * 类型差异由 `type` 字段和 `meta` 扩展字段承载。
 */
export interface GraphNode {
  /** 全局唯一标识，命名空间格式，如 "page:ibom/product/list" */
  id: string;

  /** 实体类型 */
  type: NodeType;

  /** 英文名 / 机器名 */
  name: string;

  /** 中文名 / 显示标题 */
  title: string;

  /** 功能描述摘要 */
  summary: string;

  /** 分类标签，如 ["主页面", "列表页", "BOM管理"] */
  tags: string[];

  /** 类型专属扩展字段，用于存放原 Page.route、Field.componentType 等 */
  meta?: Record<string, unknown>;

  /** 所属模块（仅页面等分层实体） */
  module?: string;

  /** 来源文档路径 */
  docsPath?: string;

  /** 内容哈希，用于增量更新 */
  contentHash?: string;
}

// ─────────────────────────────────────────
// 边类型
// ─────────────────────────────────────────

export type EdgeType =
  | 'contains' // page contains field/column/button
  | 'calls' // field calls api, button calls api
  | 'opens' // button opens modal
  | 'depends_on' // component depends_on api
  | 'belongs_to'; // child belongs_to parent

/**
 * 图谱边 —— 表达实体间关系
 */
export interface GraphEdge {
  /** 源节点 ID */
  source: string;

  /** 目标节点 ID */
  target: string;

  /** 关系类型 */
  type: EdgeType;

  /** 关系描述（可选） */
  description?: string;
}

// ─────────────────────────────────────────
// 项目级容器
// ─────────────────────────────────────────

/**
 * 完整项目图谱 —— 包含所有节点和边
 */
export interface GraphProject {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────

/** 生成规范化的节点 ID */
export function nodeId(type: NodeType, path: string): string {
  return `${type}:${path}`;
}

/** 从 ID 中解析类型和路径 */
export function parseNodeId(id: string): { type: NodeType; path: string } | null {
  const sep = id.indexOf(':');
  if (sep === -1) return null;
  const type = id.slice(0, sep) as NodeType;
  const path = id.slice(sep + 1);
  return { type, path };
}
