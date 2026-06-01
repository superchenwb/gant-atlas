# GitNexus 架构深度解析与 Gant-Atlas 借鉴方案

> 本文档基于对 GitNexus 本地 npm 包源码的逐层研读，提取其架构精华，并映射到 Gant-Atlas 的设计中。

---

## 1. GitNexus 核心数据模型：属性图（Property Graph）

GitNexus 的核心抽象是**内存中的属性图**，而非直接操作数据库。

### 1.1 节点与边的类型定义

```typescript
// _shared/graph/types.d.ts

interface GraphNode {
  id: string;
  label: NodeLabel;           // 'Function' | 'Class' | 'Method' | ...
  properties: NodeProperties; // name, filePath, startLine, ...
}

interface GraphRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;     // 'CALLS' | 'IMPORTS' | 'EXTENDS' | ...
  confidence: number;         // 0-1，表示关系可信度
  reason: string;             // 为什么建立这条边
  step?: number;              // 用于 process 链的顺序
  evidence?: readonly { kind: string; weight: number; note?: string }[];
}
```

### 1.2 KnowledgeGraph 的双索引实现

`core/graph/graph.js` 中的 `createKnowledgeGraph()` 是图数据库核心遍历能力的**内存实现**，完全用原生 `Map`/`Set` 构建，避免了对 Neo4j/Kuzu 等图数据库的运行时依赖：

| 索引 | 类型 | 用途 |
|------|------|------|
| `nodeMap` | `Map<string, GraphNode>` | 所有节点 |
| `relationshipMap` | `Map<string, GraphRelationship>` | 所有边 |
| `relationshipsByType` | `Map<RelType, Map<string, GraphRelationship>>` | **按关系类型索引**，加速类型遍历 |
| `edgeIdsByNode` | `Map<string, Set<string>>` | **反向邻接索引**，删除节点时 O(edges) 而非 O(total) |
| `nodeIdsByFile` | `Map<string, Set<string>>` | **文件索引**，增量更新时直接移除整文件的节点 |

```typescript
const writeRel = (rel) => {
  relationshipMap.set(rel.id, rel);
  let typeBucket = relationshipsByType.get(rel.type);
  if (typeBucket === undefined) {
    typeBucket = new Map();
    relationshipsByType.set(rel.type, typeBucket);
  }
  typeBucket.set(rel.id, rel);
  addToBucket(edgeIdsByNode, rel.sourceId, rel.id);
  if (rel.targetId !== rel.sourceId) {
    addToBucket(edgeIdsByNode, rel.targetId, rel.id);
  }
};
```

**对 Gant-Atlas 的启示**：
- 采用同样的内存图模型，节点是 `Page`/`Field`/`API` 等业务实体
- 用 `Map`/`Set` 实现双索引，批量写入 SQLite
- 增量更新时通过 `nodeIdsByFile` 直接清理旧数据，无需全量扫描

---

## 2. Ingestion Pipeline：分阶段、拓扑排序执行

### 2.1 Phase 依赖图

```
scan → structure → [markdown, cobol] → parse → [routes, tools, orm]
  → crossFile → scopeResolution → [mro → communities → processes]
```

### 2.2 Phase 定义方式

每个 phase 是一个声明式对象：

```typescript
export const parsePhase = {
  name: 'parse',
  deps: ['structure', 'markdown', 'cobol'],
  async execute(ctx, declaredDeps) {
    const { scannedFiles, allPaths, totalFiles } = getPhaseOutput(deps, 'structure');
    const result = await runChunkedParseAndResolve(...);
    return { ...result, allPaths, allPathSet, totalFiles };
  },
};
```

### 2.3 Runner：Kahn 拓扑排序

`pipeline-phases/runner.js` 的核心逻辑：

1. **验证**：检查 phase 名是否重复、依赖是否都存在
2. **拓扑排序**：Kahn 算法将 phase 排成执行顺序
3. **顺序执行**：每个 phase 只接收其 `deps` 中声明的 upstream outputs
4. **错误处理**：phase 失败时 emit `error` progress event，保留原始 cause

**关键设计决策**：
- Phase 之间通过 **typed outputs** 传递数据，不是共享可变状态
- `declaredDeps` 机制强制 phase 只能访问自己声明的依赖，杜绝隐式耦合
- Parse phase 内部使用 **chunked + worker pool**，按字节预算分块，小项目顺序回退

**对 Gant-Atlas 的启示**：
- 采用同样的 Phase + Runner 架构
- Gant-Atlas 的 Phase 图更简单：
  ```
  scan → parseMain → parseSearchArea → parseGridArea → parseButtonArea
    → normalizeAPIs → buildGraph → writeSQLite
  ```
- 不需要 worker pool，Markdown 解析是轻量级的

---

## 3. 解析层：AST + Tree-sitter + 多语言支持

GitNexus 的解析层极其复杂（`parsing-processor.js` + `call-processor.js` 合计 170KB+）：

- **Tree-sitter** 生成 AST
- 多语言 Extractor：`call-extractors/`, `class-extractors/`, `method-extractors/`, `field-extractors/`, `heritage-extractors/`
- Scope Resolution：跨文件的符号解析、类型推断
- 解析结果写入内存 KnowledgeGraph，不直接写数据库

**对 Gant-Atlas 的启示**：
- **完全不需要 AST 解析**。我们的输入是 Markdown 表格，解析复杂度是 O(n) 的字符串处理
- 借鉴其"解析器 → 内存图 → 批量写入"的流水线，但解析器换成 Markdown 表格解析

---

## 4. 存储层：LadybugDB

GitNexus 曾经用 KuzuDB（嵌入式图数据库），后迁移到 **LadybugDB**（`@ladybugdb/core`）。

### 4.1 存储路径

```
<repoRoot>/.gitnexus/
  ├── lbug/           # LadybugDB 数据文件
  ├── meta.json       # 索引元数据
  └── parse-cache.json # 解析缓存
```

全局注册表：`~/.gitnexus/registry.json`

### 4.2 数据库 Schema

```typescript
// 31 种 Node 表
NODE_TABLES = ['File', 'Folder', 'Function', 'Class', 'Interface',
  'Method', 'CodeElement', 'Community', 'Process', 'Route', 'Tool', ...];

// 1 种 Edge 表（所有关系存在一张表，用 type 字段区分）
REL_TABLE_NAME = 'CodeRelation';
REL_TYPES = ['CONTAINS', 'DEFINES', 'IMPORTS', 'CALLS', 'EXTENDS',
  'IMPLEMENTS', 'HAS_METHOD', 'HAS_PROPERTY', 'ACCESSES', ...];

// Embedding 表
EMBEDDING_TABLE_NAME = 'CodeEmbedding';
```

**关键模式**：
- **内存中建图 → 批量写入数据库**
- 所有边存在一张表 `CodeRelation` 中，通过 `type` 字段区分关系类型

**对 Gant-Atlas 的启示**：
- 使用 SQLite 而非 LadybugDB
- 业务关系是树形/星形（页面为中心），SQLite JOIN 足够
- 可以借鉴"单表存边 + type 字段区分"的模式，也可以按关系类型分表

---

## 5. 搜索层：Hybrid Search（BM25 + Semantic + RRF）

`core/search/hybrid-search.js`：

```typescript
const RRF_K = 60;
// BM25 排名得分
const rrfScore = 1 / (RRF_K + bm25Rank + 1);
// 语义排名得分
const rrfScore = 1 / (RRF_K + semanticRank + 1);
// 合并：两种来源的分数相加
```

- **BM25**：LadybugDB FTS 全文检索
- **Semantic**：向量相似度（embedding）
- **RRF**：Reciprocal Rank Fusion，无需分数归一化

**对 Gant-Atlas 的启示**：
- **不需要混合搜索**。我们的查询是精确的结构化查询：
  ```sql
  SELECT * FROM fields WHERE page_id = ?;
  SELECT p.* FROM pages p JOIN page_apis pa ON p.id = pa.page_id WHERE pa.api_id = ?;
  ```
- 没有语义搜索需求，没有向量 embedding 需求

---

## 6. MCP Server 设计

`mcp/server.js` 是一个非常干净的实现：

```typescript
export function createMCPServer(backend) {
  const server = new Server({ name: 'gitnexus', version: pkgVersion }, {
    capabilities: { tools: {}, resources: {}, prompts: {} }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ... }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await backend.callTool(name, args);
    const hint = getNextStepHint(name, args);
    return { content: [{ type: 'text', text: resultText + hint }] };
  });

  return server;
}
```

### 6.1 三个值得借鉴的设计

**① Next-step Hints（下一步提示）**

每个 Tool 返回后自动追加建议，引导 AI Agent 形成自驱动工作流：

```typescript
function getNextStepHint(toolName, args) {
  switch (toolName) {
    case 'query':
      return '\n\n---\n**Next:** To understand a specific symbol, use context({name: "..."})';
    case 'context':
      return '\n\n---\n**Next:** If planning changes, use impact({target: "...", direction: "upstream"})';
    case 'impact':
      return '\n\n---\n**Next:** Review d=1 items first (WILL BREAK).';
  }
}
```

**② Backend 抽象层**

MCP Server 不直接操作数据，而是通过 `backend.callTool()`：

```typescript
const result = await backend.callTool(name, args);
```

`LocalBackend` 是其中一个实现，未来可以扩展为 `RemoteBackend`。

**③ Resources 机制**

除了 Tools，还暴露 URI 资源供 AI 直接 READ：

```
gitnexus://repos                      # 所有索引仓库列表
gitnexus://repo/{name}/context        # 仓库概览
gitnexus://repo/{name}/clusters       # 功能模块（Leiden 聚类）
gitnexus://repo/{name}/processes      # 执行流程
gitnexus://repo/{name}/schema         # 图结构 Schema
gitnexus://repo/{name}/process/{name} # 具体执行流程追踪
```

### 6.2 CLI + MCP 双入口

```typescript
// cli/mcp.js
export const mcpCommand = async () => {
  installGlobalStdoutSentinel();  // 拦截 stdout，防止污染 MCP 协议
  const [{ startMCPServer }, { LocalBackend }] = await Promise.all([
    import('../mcp/server.js'),
    import('../mcp/local/local-backend.js'),
  ]);
  const backend = new LocalBackend();
  await backend.init();
  await startMCPServer(backend);
};
```

**关键细节**：
- `installGlobalStdoutSentinel()`：防止第三方库的 `console.log` 污染 stdio MCP 协议流
- 所有非 `node:` 模块使用 **动态 import**，确保 sentinel 先于任何可能写 stdout 的代码运行
- 全局注册表：`backend.listRepos()` 从 `~/.gitnexus/registry.json` 加载所有已索引仓库

**对 Gant-Atlas 的启示**：
- 完全照搬 MCP Server 的骨架：`Server` + `Backend` + `stdio transport`
- 实现 Next-step Hints，引导 AI 从 `search_pages` → `get_page_spec` → `analyze_impact`
- 暴露 Resources：`atlas://pages`, `atlas://page/{id}/spec`, `atlas://apis`
- 同样需要 `stdout sentinel` 保护 MCP 协议流

---

## 7. 增量更新机制

### 7.1 三层缓存体系

| 层级 | 文件 | 机制 |
|------|------|------|
| 解析缓存 | `.gitnexus/parse-cache.json` | 内容寻址（content hash），未变更文件复用解析结果 |
| 元数据 | `.gitnexus/meta.json` | 记录上次索引时间、commit hash、文件数量 |
| 全局注册表 | `~/.gitnexus/registry.json` | 所有已索引仓库的索引 |

### 7.2 Git Staleness 检测

`core/git-staleness.js`：

1. 读取 `.gitnexus/meta.json` 中的 `lastCommit`
2. 与当前 `git rev-parse HEAD` 对比
3. 通过 `git diff` 获取变更文件列表
4. 只对变更文件重新解析，其余从 parse cache 恢复

```typescript
// 伪代码
const changedFiles = await getGitChangedFiles(repoPath, lastCommit);
for (const file of allFiles) {
  if (!changedFiles.has(file.path) && parseCache.has(hash(file.content))) {
    // 从缓存恢复
    graph.addNodes(cachedResult.nodes);
    graph.addRelationships(cachedResult.relationships);
  } else {
    // 重新解析
    const result = await parseFile(file);
    parseCache.set(hash(file.content), result);
  }
}
```

**对 Gant-Atlas 的启示**：
- 同样采用三层缓存：解析缓存 + 元数据 + 全局注册表
- 增量更新逻辑：检测 feature-docs 目录的 mtime/文件 hash 变化
- 由于 Markdown 解析极快，甚至可以简化：只记录文件 mtime，变更则全量重解析该文件

---

## 8. GitNexus vs Gant-Atlas：本质区别

| 维度 | GitNexus | Gant-Atlas |
|------|----------|------------|
| **输入** | 源代码（20+ 种语言） | Markdown 规格文档 |
| **解析复杂度** | AST + Tree-sitter + Scope Resolution | Markdown 表格解析（O(n) 字符串处理） |
| **图谱节点** | 31 种代码实体（Function/Class/Method...） | 6 种业务实体（Page/Field/Column/Button/API/Modal） |
| **关系类型** | 20 种代码关系（CALLS/IMPORTS/EXTENDS...） | 6 种业务关系（HAS_FIELD/CALLS_API/BINDS_TO_API...） |
| **查询方式** | BM25 + 向量混合搜索 + Cypher 图查询 | 精确 SQL JOIN（SQLite） |
| **核心价值** | 代码理解、影响面分析、架构可视化 | 规格查询、业务影响面、一致性校验 |
| **存储** | LadybugDB（图数据库） | SQLite（关系数据库） |
| **部署** | 索引整个代码仓库（数分钟） | 解析 Markdown 表格（秒级） |

**核心结论**：

> 两者方法论一致（扫描 → 图谱化 → 查询），但数据模型完全不同。GitNexus 解决"代码理解"问题，Gant-Atlas 解决"业务规格理解"问题。

---

## 9. Gant-Atlas 借鉴方案

### 9.1 直接借鉴（适合照搬）

#### ① Pipeline 架构

```typescript
// Gant-Atlas 的 Phase 图
const phases = [
  scanPhase,        // 扫描 feature-docs/ 目录，收集文件路径
  parseMainPhase,   // 解析 main.md → Page + API + Modal
  parseSearchPhase, // 解析 search-area.md → Field + API
  parseGridPhase,   // 解析 grid-area.md → Column + API
  parseButtonPhase, // 解析 button-area.md → Button + Modal
  normalizePhase,   // API 名称归一化
  buildGraphPhase,  // 内存中建图
  writeSQLitePhase, // 批量写入 SQLite
];
```

#### ② KnowledgeGraph 内存模型

```typescript
export interface BusinessGraph {
  // 节点
  iterNodes: () => IterableIterator<BusinessNode>;
  iterRelationships: () => IterableIterator<BusinessRelationship>;
  iterRelationshipsByType: (type: BusinessRelType) => IterableIterator<BusinessRelationship>;

  // 索引查询
  getNode: (id: string) => BusinessNode | undefined;
  getNodesByFile: (filePath: string) => BusinessNode[];
  getNodesByLabel: (label: BusinessNodeLabel) => BusinessNode[];

  // 变更
  addNode: (node: BusinessNode) => void;
  addRelationship: (rel: BusinessRelationship) => void;
  removeNode: (nodeId: string) => boolean;
  removeNodesByFile: (filePath: string) => number;

  // 统计
  nodeCount: number;
  relationshipCount: number;
}
```

#### ③ MCP Server 设计

```typescript
// 完全照搬 GitNexus 的骨架
export function createAtlasMCPServer(backend: AtlasBackend) {
  const server = new Server({ name: 'gant-atlas', version }, {
    capabilities: { tools: {}, resources: {} }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ATLAS_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await backend.callTool(name, args);
    const hint = getNextStepHint(name, args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) + hint }] };
  });

  return server;
}
```

#### ④ CLI + MCP 双入口

```bash
# 人类用
atlas ingest              # 全量构建图谱
atlas sync                # 增量同步
atlas query page <id>     # 查询页面规格
atlas impact --api <name> # 影响面分析

# AI Agent 用
atlas mcp serve           # 启动 MCP Server (stdio)
```

### 9.2 应该简化（不需要的复杂度）

| 复杂度 | GitNexus 做法 | Gant-Atlas 简化 |
|--------|--------------|-----------------|
| 搜索 | BM25 + 向量 + RRF 混合搜索 | 不需要，精确 SQL JOIN 即可 |
| 解析 | Tree-sitter AST + Worker Pool | Markdown 表格正则解析，单线程 |
| 数据库 | LadybugDB 图数据库 | SQLite，零部署 |
| 查询语言 | Cypher | SQL |
| 语言支持 | 20+ 种编程语言 | 只解析一种 Markdown 格式 |
| 聚类分析 | Leiden 社区检测算法 | 不需要，业务模块已经是分好的 |
| 执行流程 | Process 提取（DFS 调用链） | 不需要，业务关系是静态的 |

---

## 10. Gant-Atlas 建议架构

```
┌─────────────────────────────────────────────┐
│              MCP Server (stdio)              │
│  ├─ get_page_spec     → Backend.query()      │
│  ├─ search_pages      → Backend.query()      │
│  ├─ analyze_impact    → Backend.traverse()   │
│  └─ check_consistency → Backend.compare()    │
├─────────────────────────────────────────────┤
│            Backend (统一抽象层)               │
│  ├─ ingest(docsPath)  → Pipeline.run()       │
│  ├─ query(sql)        → SQLite               │
│  ├─ traverse(nodeId)  → Graph.walk()         │
│  └─ sync()            → Incremental.update() │
├─────────────────────────────────────────────┤
│        Ingestion Pipeline (Phases)           │
│  scan → parseMain → parseSearchArea          │
│       → parseGrid → parseButton              │
│       → normalizeAPIs → buildGraph           │
│       → writeSQLite                          │
├─────────────────────────────────────────────┤
│         KnowledgeGraph (内存双索引)           │
│  nodeMap + relMap + byType + byFile          │
├─────────────────────────────────────────────┤
│            SQLite (持久化)                    │
│  pages / fields / columns / buttons          │
│  apis / page_apis / field_apis               │
├─────────────────────────────────────────────┤
│         feature-docs/ (Markdown)             │
│  main.md / search-area.md / grid-area.md     │
│  button-area.md                              │
└─────────────────────────────────────────────┘
```

### 10.1 与 GitNexus 的对应关系

| GitNexus 模块 | Gant-Atlas 对应模块 | 复用程度 |
|--------------|-------------------|---------|
| `core/graph/graph.js` | `src/graph/graph.ts` | 高，直接借鉴双索引实现 |
| `core/ingestion/pipeline.js` | `src/ingestion/pipeline.ts` | 高，简化 phase 图 |
| `core/ingestion/pipeline-phases/runner.js` | `src/ingestion/runner.ts` | 高，直接照搬拓扑排序 |
| `mcp/server.js` | `src/mcp/server.ts` | 高，直接借鉴骨架 |
| `mcp/tools.js` | `src/mcp/tools.ts` | 中，替换 tool 定义 |
| `storage/repo-manager.js` | `src/storage/manager.ts` | 中，简化存储逻辑 |
| `core/search/*` | **不需要** | 零 |
| `core/ingestion/*-extractors/` | **不需要** | 零 |
| `core/ingestion/parsing-processor.js` | `src/parser/markdown.ts` | 低，完全不同 |

---

## 11. 关键设计决策记录

### 11.1 为什么用 SQLite 而不是 LadybugDB/Neo4j？

- 业务关系是**树形/星形结构**（页面为中心，辐射字段、按钮、接口）
- 没有复杂图遍历（没有环、没有多跳路径）
- SQLite 零配置、单文件、足够满足 JOIN 需求
- 不需要引入额外的原生依赖

### 11.2 为什么内存中建图再批量写入？

借鉴 GitNexus 的核心模式：
1. **解析器只关心图操作**，不关心数据库 schema
2. **批量写入**比逐条 INSERT 快 10-100 倍
3. **增量更新**时可以通过 `removeNodesByFile` 精确清理旧数据
4. 未来如果换数据库，只需改 `writeSQLitePhase`，解析器不受影响

### 11.3 为什么不需要向量搜索？

- Gant-Atlas 的查询是**精确的结构化查询**，不是语义搜索
- "数据权限管理页面有哪些查询字段？" → `SELECT field_label FROM fields WHERE page_id = 'bombusiness/dataauthgroup'`
- "修改 dataAuthGroupFindListApi 会影响哪些页面？" → `SELECT p.* FROM pages p JOIN page_apis pa ON p.id = pa.page_id JOIN apis a ON pa.api_id = a.id WHERE a.name = 'dataAuthGroupFindListApi'`
- 这些问题用 SQL JOIN 回答，不需要语义理解

---

*文档版本：v1.0*
*基于 GitNexus 源码版本：本地 npm 包（2025-05-18 安装）*
*分析日期：2026-06-01*
