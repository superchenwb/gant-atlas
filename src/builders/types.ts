/**
 * EntityParser 插件接口
 *
 * 每个解析器负责一种或多种实体类型的识别和解析。
 * buildProjectAsync() 会遍历项目目录，将匹配的路径分发给对应的解析器。
 */

import type { GraphNode, GraphEdge } from '../types/graph.js';

export interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface EntityParser {
  /** 判断该解析器是否能处理给定路径 */
  canHandle(path: string): boolean;

  /** 解析路径，返回节点和边 */
  parse(path: string): Promise<ParseResult>;
}
