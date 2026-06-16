# CLAUDE.md

This file is the **project command center** for both AI agents and the human architect. It serves two purposes:

1. **For AI**: Technical guidance to work on this codebase effectively
2. **For the human (via AI)**: Project status, verification guide, quality bar, roadmap

---

## 0. What Is This Project?

**gant-atlas = 前端团队的业务真相源**

一句话：让功能文档和代码保持同步，并能随时查询任何页面/字段/API 之间的关系。

### 用户能用它做什么（5 个能力）

| # | 能力 | 输入 | 输出 | 状态 |
|---|------|------|------|:--:|
| ① | **生成功能清单** | 前端代码（路由 + 页面组件） | 结构化 Markdown 文档 | ✅ |
| ② | **构建知识图谱** | `feature-docs/` 目录 | SQLite 图数据库，可查询 | ✅ |
| ③ | **变更感知与同步** | 代码变更 + 旧文档 | Markdown diff，人工审核后同步 | ✅ |
| ④ | **一致性检查** | 知识图谱 | 自动发现 stale_page / orphan_api / 字段-API 不匹配 | ✅ |
| ⑤ | **跨项目查询** | 多个项目的 SQLite | 聚合搜索结果、跨项目孤儿 API | ⚠️ 原型 |

### 完整数据流

```
前端代码仓库
    │
    ├─→ ① generate        → feature-docs/*.md      （代码 → 文档）
    │
    ├─→ ② ingest           → SQLite 图数据库         （文档 → 图谱）
    │
    ├─→ ③ sync             → diff → 审核 → 同步      （代码变更 → 文档更新）
    │
    ├─→ ④ check-consistency → 问题报告               （质量检测）
    │
    └─→ ⑤ federation       → 跨项目聚合结果           （全局视图）
```

---

## 1. Project Status Dashboard

> **更新规则**：每次有意义的变更后更新此表。当前日期见 git log。

| 任务 | 优先级 | 状态 | 验证方式 |
|------|--------|:--:|---------|
| T1 Sync Hook 核心 (diff/outbox/llm-diff) | P0 | ✅ | 13 个单元测试 |
| T1.5 Generator 扩展 (api-area/hook/tab/permission) | P0 | ✅ | golden test |
| T2 Sync CLI (runSync + sync 命令) | P0 | ✅ | 4 个 E2E 测试 |
| T3 Skill 内 Hook (sync-page.mjs) | P0 | ✅ | skill 脚本存在 |
| T3.5 拒绝 diff 后 stale 标记 | P0 | ✅ | 端到端测试 |
| **T4 跨 repo / filesystem 手工验证** | **P0** | **⬜** | **人工验证（阻塞 Phase 2）** |
| T5 Golden Eval 扩展 | P1 | ✅ | 2 个 golden 场景 |
| T6 Consistency Check 增强 | P1 | ✅ | 11 项检查规则 |
| T7 联邦查询层 | P2 | ✅ | 3 个测试 |
| T8 Schema Migration 框架 | P3 | ✅ | up/downgrade 测试 |

**测试总览**：36 个测试文件，242 个测试用例，全部通过。TypeScript strict 模式零错误。

**阻塞项**：T4（在真实项目上跑通一次完整 Sync Hook 闭环）。

---

## 2. Manual Verification Guide（你如何亲手验证）

**这是最重要的部分。自动化测试通过 ≠ 项目真的能用。**

### 快速验证（5 分钟，用内置测试数据）

```bash
# Step 1: 构建图谱
pnpm exec tsx src/index.ts ingest \
  --docsPath tests/fixtures/test-module \
  --db /tmp/gant-atlas-demo.db

# Step 2: 查询
pnpm exec tsx src/index.ts query page simple-page --db /tmp/gant-atlas-demo.db

# Step 3: 一致性检查
pnpm exec tsx src/index.ts validate --db /tmp/gant-atlas-demo.db

# Step 4: 过期页面
pnpm exec tsx src/index.ts status --db /tmp/gant-atlas-demo.db
```

### 完整闭环验证（30 分钟，用真实项目 yadea-bom）

```bash
# Step 1: 生成功能清单
pnpm exec tsx src/index.ts generate \
  --codeDir /home/chen/gant-codespace/yadea-bom \
  --routesFile /home/chen/gant-codespace/yadea-bom/packages/ibom/src/.gant/routes/maps.ts \
  --docsPath /tmp/yadea-docs \
  --page <选一个页面>

# Step 2: 查看生成效果
cat /tmp/yadea-docs/<module>/<page>/main.md

# Step 3: 导入图谱
pnpm exec tsx src/index.ts ingest \
  --docsPath /tmp/yadea-docs \
  --db /tmp/yadea-bom.db

# Step 4: 运行 sync（对比代码和文档）
pnpm exec tsx src/index.ts sync <pageId> \
  --docsPath /tmp/yadea-docs \
  --db /tmp/yadea-bom.db \
  --codeDir /home/chen/gant-codespace/yadea-bom \
  --routesFile /home/chen/gant-codespace/yadea-bom/packages/ibom/src/.gant/routes/maps.ts

# Step 5: 查看 sync diff
pnpm exec tsx src/index.ts sync --list-pending \
  --docsPath /tmp/yadea-docs \
  --db /tmp/yadea-bom.db \
  --codeDir /home/chen/gant-codespace/yadea-bom \
  --routesFile /home/chen/gant-codespace/yadea-bom/packages/ibom/src/.gant/routes/maps.ts
```

---

## 3. Key Architecture Decisions

| 决策 | 结论 | 原因 |
|------|------|------|
| 存储方案 | 每个项目独立 SQLite 文件 | 物理隔离，避免单点故障；跨项目查询通过联邦层 |
| Diff 策略 | 粗粒度确定性 diff + LLM 语义层 | 确定性部分可测试、快速；LLM 处理语义变更 |
| Sync 模式 | 双模式：skill 内 Hook（主）+ CLI（fallback） | 覆盖 AI 辅助和独立使用两种场景 |
| Migration 框架 | 自研 runner（`__migrations` 表 + up/down） | 零外部依赖，简单可控 |
| 代码扫描 | regex 快速路径 + TypeScript AST fallback | 性能优先，AST 只用于复杂场景 |
| 跨项目查询 | 内存聚合，不做跨库 SQL join | 避免 SQLite attach 的 WAL/版本兼容问题 |
| 联邦查询 | 当前为原型，只覆盖 searchPages + findDeadApis | 等真实多项目需求驱动再扩展 |

---

## 4. Quality Gates

在以下检查全部通过之前，不要声称"完成了"：

- [ ] `pnpm run build` — TypeScript strict 模式零错误
- [ ] `pnpm run test` — 所有测试通过
- [ ] 新增代码有对应测试
- [ ] 手工验证指南中的快速验证步骤全部跑通
- [ ] 如果是用户可见功能：在真实项目上跑过一次

---

## 5. Roadmap

```
Phase 1 (当前, 90%)         Phase 2 (2-4 月)           Phase 3 (4-6 月)
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ ⬜ T4 手工验证       │    │ 多项目支持完善       │    │ Semantic Mapper    │
│ ✅ 其他全部完成      │    │ CI 一致性校验        │    │   准确率 > 95%     │
│                     │    │ 第 2 个试点项目接入   │    │ 跨项目影响分析      │
│ 下一步:              │    │ 团队采用             │    │ 自动变更建议        │
│ 在 yadea-bom 上     │    │                     │    │                    │
│ 跑通完整闭环         │    │                     │    │                    │
└────────────────────┘    └────────────────────┘    └────────────────────┘
```

**当前阻塞**：T4（在真实项目上手工验证 Sync Hook 闭环）。

**下一个里程碑**：T4 完成 → 提交所有代码 → 进入 Phase 2 规划。

---

## 6. Common Commands

- `pnpm run build` — TypeScript 编译 (`tsc`)，输出到 `dist/`
- `pnpm run dev` — 开发模式 (`tsx src/index.ts <command> ...`)
- `pnpm run dev -- ingest --docsPath ... --db ...` — 开发模式运行具体命令
- `pnpm run test` — 运行全部测试 (`vitest run`)
- `pnpm run test:watch` — 监听模式
- `pnpm exec vitest run tests/path/to/test.ts` — 运行单个测试文件
- `pnpm run mcp` — 启动 MCP Server（使用编译产物 `dist/index.js`）

**环境要求**：Node >= 22，ES Modules (`"type": "module"`)。

---

## 7. Architecture Reference

### Data Flow

```
feature-docs/ (每页面一个目录，含多个 .md 文件)
    → src/parser/markdown.ts     (解析 Markdown 表格，提取 API 引用)
    → src/graph/builder.ts       (构建 Page/Field/Column/Button/API 实体 + 关系)
    → src/store/sqlite.ts        (持久化到 SQLite，含 migration 框架)
    → src/mcp/tools/*.ts         (通过 MCP 工具暴露查询)
    → src/cli/actions.ts         (通过 CLI 命令暴露操作)
```

### Module Map

| 模块 | 文件 | 职责 |
|------|------|------|
| **Parser** | `src/parser/markdown.ts` | Markdown 表格解析：KV 格式 (`| 属性 | 内容 |`) 和 Flat 格式 (header-row) |
| **Graph Builder** | `src/graph/builder.ts` | 从 feature-docs 目录构建 `ParsedFeatureDoc[]`；`buildGraphAsync()` 是主入口 |
| **Store** | `src/store/sqlite.ts` | SQLite 存储层，含 v1-v3 migration、FTS5 全文搜索、stale 标记 |
| **MCP Server** | `src/mcp/server.ts` | MCP Server 入口，注册 11 个工具 |
| **MCP Tools** | `src/mcp/tools/*.ts` | 11 个工具：`get_page_spec`, `search_pages`, `analyze_impact`, `check_consistency`, `list_projects`, `explore_context`, `find_dead_apis`, `get_call_graph`, `generate_page_spec`, `get_page_generation_context`, `list_entries` |
| **CLI** | `src/cli/actions.ts`, `src/index.ts` | 10 个命令：`ingest`, `mcp serve`, `query page`, `map`, `validate`, `generate`, `sync`, `manifest`, `status`, `setup` |
| **Code Scanner** | `src/code-scanner.ts` | 前端代码扫描：`scanRoutes()` / `scanSchema()` / `scanServices()`，regex + AST fallback |
| **Generator** | `src/generator.ts`, `src/generator/context.ts` | 从 `PageCodeInfo` 生成 Markdown 骨架，支持 api-area + hook/tab/permission 表格 |
| **Sync** | `src/sync/diff.ts`, `src/sync/llm-diff.ts`, `src/sync/outbox.ts` | Diff 生成（确定性 + LLM 辅助）+ outbox 管理（pending/rejected/applied） |
| **Federation** | `src/query/federation.ts` | 联邦查询层，多项目内存聚合 |
| **Plugins** | `src/plugins/custom-yml.ts` | 页面级覆盖配置 (`custom.yml`) |
| **Builders** | `src/builders/*.ts` | 文档生成构建器 (page/component/method) |
| **Validation** | `src/validation/*.ts` | 图谱数据校验 |

### Key Conventions

- 所有导入使用 `.js` 扩展名（NodeNext module resolution）
- ID 构造规则：
  - 页面：`page:${module}/${pageName}`
  - 子实体：`${pageId}/{field|column|button}/${index}`
  - API：`api/${name}`
- `Store` 接口隐藏 `db` 实例。需要原始 SQL 时用 `getStoreDatabase(store)`（从 `WeakMap` 读取）
- 新增表时：在 `src/store/sqlite.ts` 的 `migrations` 数组添加新 migration，并递增 `SCHEMA_VERSION`
- 当前 Schema Version：**3**（v1: unified_graph, v2: fts5_search, v3: add_stale_flag）
- Migration 框架：`__migrations` 表记录迁移历史，`migrate(db, targetVersion)` 支持 up/downgrade

### Testing

- 框架：**vitest**，`globals: true`
- 测试目录结构镜像 `src/`
- `tests/fixtures/` 包含 4 种页面类型测试数据：`simple-page/`, `kv-page/`, `custom-page/`, `rich-schema-page/`
- MCP 测试用 `InMemoryTransport.createLinkedPair()` + `Client`（见 `tests/mcp/server.test.ts`）
- SQLite 临时文件 (`*.db-shm`, `*.db-wal`) 和 `coverage/` 已被 `.gitignore` 忽略

### Project Configuration

全局配置：`~/.gant-atlas/projects.json`（当前配置了 1 个项目 `yadea-bom`）。

Skill 目录：`skills/generate-docs/`，含 SKILL.md + agents/ + prompts/（18 个模板）+ scripts/（7 个脚本）。

---

## 8. AI Collaboration Rules

当用户提出需求时，遵循以下优先级：

1. **先理解意图**：用户想达成什么业务效果？（不是"你想让我改哪个文件"）
2. **对照能力清单**：这个需求属于 ①生成 ②图谱 ③同步 ④检查 ⑤联邦查询 中的哪一个？
3. **检查是否已有实现**：参考上方的 Module Map，避免重复造轮子
4. **小步验证**：每完成一个可感知的变更，建议用户手工验证（参考上方 Verification Guide）
5. **更新仪表盘**：任务完成后更新 Section 1 的 Status Dashboard

**关键原则**：

- 代码写完 ≠ 任务完成。必须通过质量门禁（Section 4）。
- 用户看不到代码质量，只能看到"能不能用"。优先保证手工验证路径畅通。
- 保持 CLAUDE.md 更新——它是项目唯一的真相源。
