# gant-atlas Phase 1 改进计划

> **目标**: 基于 CodeGraph/GitNexus/Understand-Anything/gstack 的对比分析洞察，提升 gant-atlas 的 Agent 体验、图谱查询深度和代码关联能力。
> **范围**: Phase 1（高价值 / 低工作量）
> **日期**: 2026/06/05

---

## 一、背景与动机

已完成对 CodeGraph、GitNexus、Understand-Anything、gstack 的深度对比分析。四项目在以下方面展现了最佳实践：

1. **CodeGraph**: MCP 工具设计模式（`explore` 上下文查询、自适应输出、输入防护）
2. **GitNexus**: 影响分析深度（多级 blast radius、风险评级、跨实体传播）
3. **Understand-Anything**: 图谱 Schema 设计（四层验证、丰富关系类型）
4. **gstack**: 工程方法论（技能文件化、团队模式、系统化 review）

gant-atlas 当前存在以下可改进点：

| 问题 | 影响 | 来源项目对比 |
|------|------|-------------|
| `search_pages` 全表扫描 | 大项目查询慢 | CodeGraph 使用 FTS5，GitNexus 使用 BM25 |
| `analyze_impact` 只有一层深度 | 无法发现间接影响 | GitNexus 支持多级 blast radius |
| 缺少"探索上下文"工具 | Agent 需多次调用拼凑上下文 | CodeGraph `explore` 一次返回完整上下文 |
| 无死 API/孤儿字段检测 | 无法发现冗余业务实体 | CodeGraph `deadcode` |
| code-scanner 只扫描 routes/schema | 缺失组件和 service 关联 | CodeGraph 框架感知解析 |
| MCP tool 描述缺少使用指南 | Agent 不知道该何时调用 | CodeGraph/GitNexus 的 WHEN TO USE 模式 |

---

## 二、范围声明

### 2.1 In Scope（本计划包含）

1. **新增 3 个 MCP tools**：`explore_context`, `get_call_graph`, `find_dead_apis`
2. **增强 `analyze_impact`**：多级影响传播 + 风险评级
3. **改进 `search_pages`**：添加 SQLite FTS5 全文搜索
4. **增强 code-scanner**：扫描 React/Vue 组件和 API service 文件
5. **MCP tool 描述规范化**：添加 WHEN TO USE / AFTER THIS 指引
6. **输入验证**：添加输入长度限制（借鉴 CodeGraph 的 DoS 防护）

### 2.2 NOT In Scope（明确排除）

1. ❌ Web Dashboard（Phase 2 考虑，Understand-Anything 级别的工作量）
2. ❌ 向量嵌入搜索（业务文档量尚不需要语义搜索）
3. ❌ 多语言支持（当前团队使用中文，无国际化需求）
4. ❌ 跨项目/跨仓库分析（gant-atlas 当前是单项目工具）
5. ❌ 重写存储层（SQLite 已足够，不需要 LadybugDB 迁移）

---

## 三、任务拆解

### 3.1 任务总览

```
T1: 数据库层增强（FTS5 + 输入验证基础）
T2: 新增 explore_context MCP tool
T3: 新增 get_call_graph MCP tool
T4: 新增 find_dead_apis MCP tool
T5: 增强 analyze_impact（多级传播 + 风险评级）
T6: 增强 search_pages（FTS5 搜索）
T7: 增强 code-scanner（组件 + service 扫描）
T8: MCP server 注册新 tools + 描述规范化
T9: 测试覆盖
```

### 3.2 详细设计

---

#### T1: 数据库层增强

**文件**: `src/store/sqlite.ts`

**变更**: 添加 FTS5 虚拟表和输入验证辅助函数。

```sql
-- Migration v2: 添加 FTS5 全文搜索
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id, name, title, summary,
    content='nodes', content_rowid='rowid'
);

-- 触发器保持 FTS 索引同步
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, id, name, title, summary)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.title, NEW.summary);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, id, name, title, summary)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.title, OLD.summary);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, id, name, title, summary)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.title, OLD.summary);
    INSERT INTO nodes_fts(rowid, id, name, title, summary)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.title, NEW.summary);
END;
```

**新增 Store 接口**:
```typescript
searchNodesFTS(keyword: string): GraphNode[];
getCallGraph(nodeId: string, maxDepth?: number): { nodes: GraphNode[]; edges: GraphEdge[] };
findDeadApis(): GraphNode[];
findOrphanFields(): GraphNode[];
```

**输入验证辅助**（借鉴 CodeGraph）:
```typescript
export const MAX_INPUT_LENGTH = 10_000;
export const MAX_PATH_LENGTH = 4_096;

export function validateInputLength(input: string, maxLength: number = MAX_INPUT_LENGTH): string | null {
  if (input.length > maxLength) return `Input exceeds max length (${maxLength})`;
  return null;
}
```

---

#### T2: explore_context MCP tool

**文件**: `src/mcp/tools/explore-context.ts`

**定位**: 类似 CodeGraph 的 `codegraph_explore`。Agent 提出自然语言问题，一次返回最相关的业务上下文。

**输入**:
```typescript
{
  projectId: string;
  query: string;           // 自然语言查询，如 "支付流程涉及哪些页面和接口"
  taskContext?: string;    // 当前任务背景，帮助排序
  maxNodes?: number;       // 默认 20
  includeCode?: boolean;   // 是否包含代码片段
}
```

**算法**:
1. 从 query 提取关键词（分词 + 标识符识别）
2. FTS 搜索匹配节点（page/field/api）
3. 对匹配节点进行 BFS 遍历（限制深度 2，限制节点数）
4. 按相关性评分排序（节点匹配度 + 连接密度）
5. 返回子图 + 关系映射 + 关键节点代码（如果 includeCode=true）

**输出格式**（结构化 Markdown）:
```markdown
## 查询: "支付流程涉及哪些页面和接口"

### 核心节点
- **page:order/payment** — 支付页面
- **api:createOrder** — 创建订单接口
- **api:payCallback** — 支付回调接口

### 关系映射
page:order/payment → calls → api:createOrder
page:order/payment → calls → api:payCallback
api:payCallback → used_by → page:order/result

### 相关代码
```typescript
// src/pages/order/payment.tsx
const handlePay = async () => {
  await createOrder(params);  // api:createOrder
};
```

---

#### T3: get_call_graph MCP tool

**文件**: `src/mcp/tools/get-call-graph.ts`

**定位**: 给定 API 或页面，返回完整的调用链（上游调用者 + 下游被调用者）。

**输入**:
```typescript
{
  projectId: string;
  nodeId: string;          // 如 "api:createOrder" 或 "page:order/payment"
  direction?: 'upstream' | 'downstream' | 'both';  // 默认 both
  maxDepth?: number;       // 默认 2
}
```

**算法**: BFS 遍历 edges，方向由 `direction` 控制：
- `upstream`: 找所有指向该节点的 source（谁调用了我）
- `downstream`: 找该节点指向的所有 target（我调用了谁）
- `both`: 双向遍历

**输出**: 子图（nodes + edges），格式类似 explore_context。

---

#### T4: find_dead_apis MCP tool

**文件**: `src/mcp/tools/find-dead-apis.ts`

**定位**: 发现未被任何页面或字段引用的孤儿 API（类似 CodeGraph `codegraph_deadcode`）。

**算法**:
1. 获取所有 type='api' 的节点
2. 检查每个 api 节点是否有入边（edges.target === api.id）
3. 无入边的即为 dead API
4. 同时检查 type='field' 的孤儿字段（无 contains 边指向 page）

**输出**:
```json
{
  "deadApis": [{ "id": "api:legacyExport", "name": "legacyExport" }],
  "orphanFields": [{ "id": "field:oldStatus", "name": "oldStatus", "pageId": "page:system/config" }],
  "summary": "发现 2 个死 API 和 1 个孤儿字段"
}
```

---

#### T5: 增强 analyze_impact

**文件**: `src/mcp/tools/analyze-impact.ts`

**当前问题**:
- 只有一层传播深度
- 无风险评级
- 无结构化摘要

**改进**:

1. **多级传播**: BFS 遍历，支持 `maxDepth` 参数（默认 3）
2. **风险评级**:
   - LOW: 影响 < 3 个页面，无共享核心 API
   - MEDIUM: 影响 3-10 个页面，或涉及核心 API
   - HIGH: 影响 > 10 个页面，或涉及跨模块调用
3. **输出结构优化**:
```json
{
  "target": "api:createOrder",
  "targetType": "api",
  "riskLevel": "HIGH",
  "affectedPages": [...],
  "affectedFields": [...],
  "affectedApis": [...],
  "indirectEffects": [...],
  "summary": "API 'createOrder' 被 5 个页面直接引用，通过字段级联影响 12 个页面。风险等级：HIGH。"
}
```

---

#### T6: 增强 search_pages（FTS5）

**文件**: `src/mcp/tools/search-pages.ts`

**改进**:
1. 优先使用 FTS5 搜索（如果 keyword 适合）
2. 回退到当前的全表扫描（用于 module 过滤等）
3. 支持多关键词（空格分隔 = OR）

---

#### T7: 增强 code-scanner

**文件**: `src/code-scanner.ts`

**新增扫描能力**:

1. **组件扫描** (`scanComponents`): 扫描代码目录中的 React/Vue 组件文件，提取组件名和路径，与 feature-doc 中的页面关联。
2. **Service 扫描** (`scanServices`): 扫描 `src/services/` 或 `src/api/` 目录，提取 API 函数定义，建立代码侧 API 与 spec 侧 API 的映射。

**实现策略**: 复用现有的 regex + AST fallback 模式，保持工程一致性。

```typescript
export interface ComponentInfo {
  name: string;
  filePath: string;
  pageId?: string;  // 关联的 feature-doc page
}

export interface ServiceInfo {
  name: string;
  filePath: string;
  method: string;   // GET/POST/PUT/DELETE
  endpoint?: string;
}
```

---

#### T8: MCP Server 注册 + 描述规范化

**文件**: `src/mcp/server.ts`

**变更**:
1. 注册 3 个新 tools
2. 所有 tool 描述添加 **WHEN TO USE** / **AFTER THIS** 指引（借鉴 GitNexus MCP tool 描述格式）

示例:
```typescript
{
  name: 'explore_context',
  description: `根据自然语言查询探索业务上下文，返回最相关的页面、字段、API 及其关系。

WHEN TO USE: 当你需要理解某个业务概念涉及哪些页面和接口时使用。适用于模糊查询（如"支付流程"、"用户权限"）。
AFTER THIS: 使用 get_page_spec 查看具体页面的详细规格，或使用 analyze_impact 评估变更影响。`,
  inputSchema: { ... }
}
```

---

#### T9: 测试覆盖

**新增/修改测试文件**:
- `tests/mcp/tools/explore-context.test.ts`
- `tests/mcp/tools/get-call-graph.test.ts`
- `tests/mcp/tools/find-dead-apis.test.ts`
- `tests/mcp/tools/analyze-impact.test.ts`（增强）
- `tests/mcp/tools/search-pages.test.ts`（增强）
- `tests/store/sqlite.test.ts`（FTS5 + 新接口）
- `tests/code-scanner.test.ts`（组件 + service 扫描）

---

## 四、数据流架构

```
Agent Query
    │
    ▼
┌─────────────────────────────────────┐
│  MCP Server (gant-atlas)            │
│  ┌───────────────────────────────┐  │
│  │ Tool Router                   │  │
│  │  ├── explore_context          │  │
│  │  ├── get_call_graph           │  │
│  │  ├── find_dead_apis           │  │
│  │  ├── analyze_impact (v2)      │  │
│  │  ├── search_pages (v2)        │  │
│  │  └── ...existing tools        │  │
│  └───────────────────────────────┘  │
│              │                      │
│              ▼                      │
│  ┌───────────────────────────────┐  │
│  │ Store (SQLite + FTS5)         │  │
│  │  ├── nodes_fts (FTS5)         │  │
│  │  ├── nodes                    │  │
│  │  ├── edges                    │  │
│  │  └── __version                │  │
│  └───────────────────────────────┘  │
│              │                      │
│              ▼                      │
│  ┌───────────────────────────────┐  │
│  │ Graph Traversal               │  │
│  │  ├── BFS (explore/call_graph) │  │
│  │  ├── Impact Radius (bfs+rank) │  │
│  │  └── Dead Code Detection      │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
    │
    ▼
Code Scanner (enhanced)
  ├── scanRoutes (existing)
  ├── scanSchema (existing)
  ├── scanComponents (new)
  └── scanServices (new)
```

---

## 五、依赖与执行顺序

| 步骤 | 任务 | 依赖 | 并行性 |
|------|------|------|--------|
| 1 | T1: 数据库层（FTS5 + 接口） | — | 可并行 |
| 2 | T7: code-scanner 增强 | — | 可并行 |
| 3 | T2-T4: 新 tools 实现 | T1 | 可并行 |
| 4 | T5: analyze_impact 增强 | T1 | 可并行 |
| 5 | T6: search_pages 增强 | T1 | 可并行 |
| 6 | T8: MCP server 注册 | T2-T6 | 串行 |
| 7 | T9: 测试 | T1-T8 | 串行 |

**并行化建议**: Lane A（T1 + T7）和 Lane B（T2-T6 设计）可并行启动。T8 和 T9 必须等待前面全部完成。

---

## 六、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| FTS5 在 better-sqlite3 中不可用 | 中 | 先验证 `db.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5')").get()` |
| Migration v2 与现有数据兼容 | 低 | FTS5 是虚拟表，不影响 nodes/edges 数据 |
| BFS 遍历在大图谱上性能差 | 低 | 限制 maxDepth 和 maxNodes，添加提前终止 |
| code-scanner 组件识别误报 | 中 | 使用保守的 regex，AST fallback 验证 |
| 新 tools 增加 Agent 上下文负担 | 低 | 自适应输出预算（maxNodes 默认 20） |

---

## 七、验收标准

1. ✅ `explore_context` 能处理 "支付流程涉及哪些页面" 并返回相关子图
2. ✅ `get_call_graph` 能追溯 API 的上游调用者和下游被调用者
3. ✅ `find_dead_apis` 能发现至少一个未被引用的 API（在 fixtures 中构造测试用例）
4. ✅ `analyze_impact` 支持 maxDepth=3 且输出包含 riskLevel
5. ✅ `search_pages` 使用 FTS5 后，1000 个页面的搜索 < 100ms
6. ✅ code-scanner 能从 fixtures 中提取组件和 service 信息
7. ✅ 所有新 tools 有测试覆盖，通过率 100%
8. ✅ MCP tool 描述包含 WHEN TO USE / AFTER THIS

---

## 八、DX Review 修复（实施前必须完成）

以下 12 项 DX 问题已在计划阶段修复，编码时必须遵循。

### D1 — Migration v2 Rollback 策略（Critical → FIXED）

**T1 数据库层增加 DOWN migration：**

```typescript
// src/store/sqlite.ts — 迁移系统增加 rollback 支持
export interface Migration {
  version: number;
  up: string;
  down: string;  // 新增：回滚 SQL
}

const migrations: Migration[] = [
  // v1: init (existing)
  {
    version: 1,
    up: `...`,
    down: `DROP TABLE IF EXISTS edges; DROP TABLE IF EXISTS nodes; DROP TABLE IF EXISTS __version;`,
  },
  // v2: FTS5 + content_hash (new)
  {
    version: 2,
    up: `...`,
    down: `
      DROP TRIGGER IF EXISTS nodes_ai;
      DROP TRIGGER IF EXISTS nodes_ad;
      DROP TRIGGER IF EXISTS nodes_au;
      DROP TABLE IF EXISTS nodes_fts;
      ALTER TABLE pages DROP COLUMN content_hash;
    `,
  },
];

// migrate() 增加 backup 步骤
function migrate(db: Database): void {
  const backupPath = `${db.name}.backup.v${currentVersion}.${Date.now()}.db`;
  // 执行迁移前自动备份
  db.backup(backupPath);
  // ... existing migration logic
}
```

### D2 — 错误响应规范（High → FIXED）

**所有新 tools 统一错误响应格式：**

```typescript
// src/mcp/tools/error.ts
export interface ToolError {
  code: 'invalid_input' | 'not_found' | 'too_large' | 'internal_error' | 'fts_unavailable';
  message: string;
  details?: string;
}

export function formatToolError(error: ToolError) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error }, null, 2) }],
    isError: true,
  };
}

// 使用示例
if (!projectId || typeof projectId !== 'string') {
  return formatToolError({ code: 'invalid_input', message: 'projectId 是必填字符串' });
}
if (query.trim().length === 0) {
  return formatToolError({ code: 'invalid_input', message: 'query 不能为空' });
}
```

### D3 — 输入边界与默认值（Medium → FIXED）

| 参数 | 默认值 | 边界 |
|------|--------|------|
| `maxNodes` | 20 | [1, 100] |
| `maxDepth` | 2 (explore) / 3 (impact) | [1, 5] |
| `includeCode` | false | boolean |
| `direction` | 'both' | 'upstream' \| 'downstream' \| 'both' |

### D4 — FTS5 Failure Fallback（Medium → FIXED）

```typescript
// src/store/sqlite.ts
function isFTS5Available(db: Database): boolean {
  const result = db.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') as enabled").get() as { enabled: number };
  return result.enabled === 1;
}

// searchPages 实现
export function searchPagesFTS(store: Store, keyword: string): GraphNode[] {
  const db = getStoreDatabase(store);
  if (!isFTS5Available(db)) {
    // Fallback: 使用 LIKE 全表扫描
    return fallbackSearch(store, keyword);
  }
  // FTS5 路径
  const stmt = db.prepare(`
    SELECT n.* FROM nodes n
    JOIN nodes_fts fts ON n.rowid = fts.rowid
    WHERE nodes_fts MATCH ?
    AND n.type = 'page'
    LIMIT 100
  `);
  return stmt.all(keyword) as GraphNode[];
}
```

### D5 — 新开发者上手指南（High → FIXED）

**README.md 新增 Quick Start 章节：**

```markdown
## Quick Start（5 分钟上手）

1. 安装依赖：`pnpm install`
2. 构建：`pnpm run build`
3. 启动 MCP server：`pnpm run mcp`
4. 运行测试：`pnpm run test`
5. 导入示例数据：`pnpm run dev ingest tests/fixtures/feature-docs/`
```

### D6 — 完整输出 JSON Schema 示例（High → FIXED）

**`explore_context` 输出示例：**

```json
{
  "content": [
    {
      "type": "text",
      "text": "## 查询: 支付流程\n\n### 核心节点\n- **page:order/payment** — 支付页面\n- **api:createOrder** — 创建订单接口\n\n### 关系映射\npage:order/payment → calls → api:createOrder\n"
    }
  ]
}
```

**`get_call_graph` 输出示例：**

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"nodes\":[{\"id\":\"api:createOrder\",\"name\":\"createOrder\",\"type\":\"api\"}],\"edges\":[{\"source\":\"page:order/payment\",\"target\":\"api:createOrder\",\"type\":\"calls\"}]}"
    }
  ]
}
```

### D7 — Agent 工作流示例（Medium → FIXED）

```markdown
## 典型 Agent 工作流

1. **探索阶段**: `explore_context(query="支付流程")` → 获取相关页面和 API
2. **详情阶段**: `get_page_spec(pageId="order/payment")` → 查看页面详细规格
3. **影响评估**: `analyze_impact(apiName="createOrder")` → 评估变更影响范围
4. **代码关联**: `get_call_graph(nodeId="api:createOrder")` → 查看调用链
5. **清理检查**: `find_dead_apis()` → 发现是否有孤儿 API
```

### D8 — 工具命名规范（Low → FIXED）

所有 MCP tools 使用 `snake_case` 命名。新 tools:
- `explore_context`
- `get_call_graph`
- `find_dead_apis`

### D9 — 迁移幂等性规则（Medium → FIXED）

所有 migration SQL 必须包含 `IF NOT EXISTS` / `IF EXISTS`:
- `CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts`
- `CREATE TRIGGER IF NOT EXISTS nodes_ai`
- `DROP TRIGGER IF EXISTS nodes_ad`

这确保同一 migration 多次执行不会报错。

---

## 八、NOT in scope 详述

| 排除项 | 排除原因 |
|--------|----------|
| Web Dashboard | 需要 React + 可视化库，工程量 ≈ 新增一个子项目，属于 Phase 2 |
| 向量嵌入搜索 | 当前业务文档量（100-1000 页）FTS5 已足够，无需引入 embedding 依赖 |
| 多语言输出 | 团队当前使用中文，国际化需求不明确 |
| 跨项目分析 | gant-atlas 当前架构是单项目 SQLite，跨项目需要架构级重构 |
| LadybugDB/KuzuDB 迁移 | SQLite + WAL + FTS5 已满足当前需求，迁移成本高收益低 |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | Premises accepted, scope confirmed |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | unavailable | Codex CLI platform dependency missing |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 0 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | skipped | No UI scope detected |
| DX Review | `/plan-devex-review` | Developer experience gaps | 1 | issues_open | 12 findings, 1 critical |

- **UNRESOLVED**: 12 (from DX Review)
- **VERDICT**: Eng Review passed. DX Review found gaps. See below.

### DX Review Findings (Claude subagent)

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | Missing getting-started guide for new developers | High | Add 5-minute onboarding steps |
| 2 | FTS5 failure path not documented | Medium | Add fallback strategy if FTS5 unavailable |
| 3 | `includeCode` default undefined | Medium | Set default to `false` |
| 4 | `direction` default `both` may be noisy | Low | Consider `downstream` default or document |
| 5 | Tool naming convention not declared | Low | Document `snake_case` policy |
| 6 | Invalid `projectId` error handling undefined | High | Add error response spec per tool |
| 7 | `maxDepth`/`maxNodes` bounds undefined | Medium | Clamp to [1,5] and [1,100] |
| 8 | Empty `query` behavior undefined | Medium | Return `invalid_input` error |
| 9 | Output JSON Schema incomplete | High | Add full `CallToolResult` examples |
| 10 | Missing Agent workflow example | Medium | Add "typical Agent workflow" section |
| 11 | **Migration v2 rollback strategy missing** | **Critical** | Add `DOWN` migration or backup step |
| 12 | Schema version conflict on branch merge | Medium | Document migration idempotency rule |

### Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|---------------|-----------|-----------|
| 1 | CEO | Accept premises as-is | Mechanical | P6 | Premises are engineering improvements, not product strategy |
| 2 | CEO | Scope is correct (Phase 1) | Mechanical | P1 | 6 tasks cover high-value/low-effort improvements |
| 3 | Eng | FTS5 is right choice over embedding | Mechanical | P5 | SQLite native, no new deps, sufficient for doc volume |
| 4 | Eng | BFS with depth limit is correct | Mechanical | P5 | Simple, explicit, prevents runaway queries |
| 5 | Eng | Reuse regex+AST fallback pattern | Mechanical | P4 | Code scanner already uses this pattern |
| 6 | DX | Fix all 12 findings before ship | Taste | P1 | Critical rollback gap + 3 High findings block DX readiness |

### Cross-Phase Themes

**Theme: Input validation and error handling** — flagged in Eng (input length limits) and DX (invalid projectId, bounds, empty query). High-confidence signal that error paths need systematic attention across all new tools.

**Theme: Documentation completeness** — Eng noted missing WHEN TO USE, DX noted missing getting-started guide and workflow examples. Both phases agree documentation needs strengthening.

---

## 九、审批状态

**STATUS: APPROVED with DX fixes**

- 审批时间: 2026/06/05
- 审批方式: /autoplan 自动审查流程
- 条件: 12 项 DX 问题已在计划文档中修复（第 8 节），编码实施时必须遵循
- 下一步: 创建任务列表，按依赖顺序执行 T1-T9
