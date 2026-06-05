# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-06-05

### Added

- **FTS5 全文搜索**: SQLite FTS5 虚拟表 `nodes_fts` 支持对业务节点（页面、字段、API 等）的全文检索，含自动同步触发器。
- **MCP 工具增强**:
  - `explore_context` — 自然语言查询探索业务上下文，自动关键词提取 + BFS 关系扩展。
  - `get_call_graph` — 查看 API/页面/字段的上下游调用链，支持双向遍历和深度限制。
  - `find_dead_apis` — 检测无引用的孤儿 API 和未归属字段。
- **analyze_impact 升级**:
  - 新增 `maxDepth` 参数（1–5），支持多级影响传播分析。
  - 新增 `riskLevel` 风险评估（LOW / MEDIUM / HIGH）。
  - 新增 `indirectEffects`，展示间接影响的节点列表。
- **CJK 搜索兼容性**: FTS5 对中文搜索自动降级为单字 tokenization + LIKE 回退。
- **输入验证**: 所有 MCP 工具增加输入长度校验和边界值限制（maxNodes、maxDepth clamp）。
- **代码扫描扩展**:
  - `scanComponents()` — 递归扫描 React/Vue 组件文件。
  - `scanServicesDir()` — 批量扫描 services 目录下的 API 函数。

### Fixed

- `indirectEffects` 去重 — BFS 遍历中同一节点通过不同路径被多次加入结果的问题。
- `formatToolResult()` 统一成功响应格式，减少各 tool 中的重复 `JSON.stringify` 代码。

### Docs

- 添加四份项目分析报告（Understand-Anything、CodeGraph 及对比报告）和 Phase 1 改进计划。

## [0.1.0] - 2026-06-02

### Added

- 初始发布：业务知识图谱引擎 CLI + MCP Server。
- Markdown feature-doc 解析（key-value / flat 表格格式）。
- SQLite 统一图谱存储（nodes / edges 表）。
- 基础 MCP 工具：`get_page_spec`、`search_pages`、`analyze_impact`、`check_consistency`、`list_projects`。
- 代码扫描器（routes、schema、services）与语义映射器 `buildMapping()`。
