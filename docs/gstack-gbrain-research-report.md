# GStack & GBrain 研究报告

> 研究对象：gstack (v1.52.0.0) + gbrain (配套版本)
> 研究目的：理解两者架构、能力边界、协同机制，为 gant-atlas 的设计提供参考
> 报告日期：2026-06-01

---

## 1. 执行摘要

<font color="#ff4d4f">核心结论：gstack 是"AI 工程团队的 workflow 编排层"，gbrain 是"AI Agent 的语义记忆层"。两者是互补关系，不是替代关系。</font>

| 维度 | gstack | gbrain | gant-atlas |
|------|--------|--------|------------|
| **定位** | AI 工程工作流技能集 | AI Agent 持久化知识库 | 业务规格关系查询引擎 |
| **核心能力** | 浏览器自动化、代码审查、QA、设计评审 | 语义搜索、跨会话记忆、代码索引 | 结构化关系查询、影响面分析、一致性校验 |
| **数据模型** | 工作流状态、会话跟踪、学习记录 | 文档 chunk + 向量嵌入 | 实体-关系图（SQLite） |
| **存储** | `~/.gstack/`（文件系统 + git） | Postgres/PGLite + pgvector | SQLite |
| **查询方式** | 技能触发（/command） | 语义相似度搜索 | 精确结构化查询（SQL JOIN） |

**对 gant-atlas 的启示：**

1. <font color="#52c41a">gbrain 的"语义搜索"无法替代 gant-atlas 的"结构化关系查询"</font> —— 这是两个正交问题
2. <font color="#52c41a">gstack 的"技能即工作流"设计值得借鉴</font> —— 将复杂任务封装为可复用的结构化流程
3. <font color="#8c8c8c">不要试图在 gbrain 上构建关系图谱</font> —— 违背其设计哲学，且效果差

---

## 2. gstack 深度分析

### 2.1 定位与愿景

gstack 由 Garry Tan（Y Combinator CEO）开发并开源，目标是**将 Claude Code 变成一个完整的虚拟工程团队**。

> "I don't think I've typed like a line of code probably since December..." — Andrej Karpathy, March 2026

gstack 的核心理念是：在 AI 辅助编程时代，单个开发者可以完成过去需要 20 人团队的工程量。gstack 通过结构化的工作流技能（skills），将软件开发的全生命周期（思考 → 规划 → 构建 → 审查 → 测试 → 发布 → 反思）自动化。

Garry Tan 的 2026 年数据（截至 4 月 18 日）：
- 60 天内发布 3 个生产服务、40+ 功能
- 2026 年代码产出是 2013 年的 **240 倍**
- 逻辑代码变更速度是 2013 年的 **810 倍**

### 2.2 核心架构

gstack 的架构可分为三个层次：

```
┌─────────────────────────────────────────────────────────────┐
│                    Skill 层 (Markdown)                       │
│  /office-hours  /plan-ceo-review  /review  /ship  /qa ...   │
├─────────────────────────────────────────────────────────────┤
│                   CLI / Bin 层 (TypeScript)                  │
│  browse binary  |  make-pdf  |  gstack-* helpers            │
├─────────────────────────────────────────────────────────────┤
│                  Daemon 层 (Chromium + Bun)                  │
│  HTTP Server ←→ Playwright ←→ Chromium (headless/headed)    │
└─────────────────────────────────────────────────────────────┘
```

#### 2.2.1 浏览器 Daemon（ hardest part ）

gstack 的浏览器架构是其核心竞争力：

| 特性 | 说明 |
|------|------|
| **持久化状态** | Chromium 长期运行，cookie、localStorage、登录会话跨命令保持 |
| **低延迟** | 首次启动 ~3s，后续命令 ~100-200ms |
| **自动生命周期** | 30 分钟空闲自动关闭，无需进程管理 |
| **双监听器架构** | Local listener（127.0.0.1）+ Tunnel listener（ngrok），物理端口隔离保证安全 |
| **Ref 系统** | 通过 ARIA 树分配 `@e1`, `@e2` 等引用，避免 CSS selector 脆弱性 |

**Ref 系统的工作流程：**

```
1. Agent: $B snapshot -i
2. Server: Playwright page.accessibility.snapshot()
3. Parser: 遍历 ARIA 树，分配 @e1, @e2, @e3...
4. Server: 为每个 ref 构建 Locator (getByRole(role, { name }).nth(index))
5. Agent: $B click @e3  →  Server 解析 @e3 → Locator → locator.click()
```

**为什么选择 Locator 而不是 DOM mutation？**
- CSP 阻止 DOM 修改
- React/Vue/Svelte hydration 会剥离注入属性
- Shadow DOM 无法从外部访问

#### 2.2.2 为什么用 Bun

| 原因 | 说明 |
|------|------|
| **编译二进制** | `bun build --compile` 产出 ~58MB 单文件可执行程序，无 node_modules |
| **原生 SQLite** | 内置 `new Database()`，无需 better-sqlite3，无 gyp 编译问题 |
| **原生 TypeScript** | 开发时直接 `bun run server.ts`，无编译步骤 |
| **内置 HTTP Server** | `Bun.serve()` 足够快，无需 Express/Fastify |

#### 2.2.3 SKILL.md 模板系统

gstack 的技能文档不是手写维护的，而是通过模板系统自动化生成：

```
SKILL.md.tmpl（人类编写的流程 + 占位符）
    ↓
gen-skill-docs.ts（读取源码元数据）
    ↓
SKILL.md（自动生成的命令参考，已提交到 git）
```

**关键占位符：**

| 占位符 | 来源 | 生成内容 |
|--------|------|----------|
| `{{COMMAND_REFERENCE}}` | `commands.ts` | 分类命令表 |
| `{{PREAMBLE}}` | `gen-skill-docs.ts` | 启动块：更新检查、会话跟踪、学习者模式 |
| `{{GBRAIN_CONTEXT_LOAD}}` | `resolvers/gbrain.ts` | Brain-first 上下文搜索（注入到 10 个 brain-aware 技能） |
| `{{GBRAIN_SAVE_RESULTS}}` | `resolvers/gbrain.ts` | 技能结束后持久化结果到 gbrain |

**为什么提交生成文件而不是运行时生成？**
1. Claude 在技能加载时读取 SKILL.md，没有构建步骤
2. CI 可以验证 freshness：`gen:skill-docs --dry-run` + `git diff --exit-code`
3. Git blame 可追溯命令添加历史

### 2.3 工作流技能矩阵

gstack 当前包含 40+ 个技能，覆盖软件工程全生命周期：

#### 规划阶段（Think → Plan）

| 技能 | 角色 | 核心能力 |
|------|------|----------|
| `/office-hours` | YC Office Hours | 6 个强制性问题重新框定产品，挑战前提假设 |
| `/plan-ceo-review` | CEO/Founder | 4 种范围模式（扩张/选择性扩张/保持/缩减） |
| `/plan-eng-review` | Eng Manager | 架构锁定、数据流图、边界情况、测试矩阵 |
| `/plan-design-review` | Senior Designer | 0-10 评分，AI Slop 检测 |
| `/plan-devex-review` | DX Lead | 开发者体验审计，TTHW 基准测试 |
| `/autoplan` | Review Pipeline | CEO → design → eng 自动串联 |

#### 构建阶段（Build）

| 技能 | 角色 | 核心能力 |
|------|------|----------|
| `/design-consultation` | Design Partner | 从零构建设计系统 |
| `/design-shotgun` | Design Explorer | 4-6 个 AI mockup 变体，浏览器中对比迭代 |
| `/design-html` | Design Engineer | Pretext 计算布局，30KB 零依赖，可生产部署 |
| `/spec` | Spec Author | 五阶段精确规格：why → scope → technical → draft → file |

#### 审查阶段（Review）

| 技能 | 角色 | 核心能力 |
|------|------|----------|
| `/review` | Staff Engineer | 发现 CI 通过但生产会爆炸的 bug，自动修复明显问题 |
| `/codex` | Second Opinion | OpenAI Codex CLI 独立审查，跨模型分析 |
| `/cso` | Chief Security Officer | OWASP Top 10 + STRIDE，8/10+ 置信度门槛 |

#### 测试阶段（Test）

| 技能 | 角色 | 核心能力 |
|------|------|----------|
| `/qa` | QA Lead | 真实浏览器测试，发现 bug，原子提交修复，生成回归测试 |
| `/qa-only` | QA Reporter | 只报告不修复 |
| `/benchmark` | Performance Engineer | 基线页面加载时间，Core Web Vitals |

#### 发布阶段（Ship）

| 技能 | 角色 | 核心能力 |
|------|------|----------|
| `/ship` | Release Engineer | 同步 main，运行测试，审计覆盖率，推送，开 PR |
| `/land-and-deploy` | Release Engineer | 合并 PR，等待 CI 和部署，验证生产健康 |
| `/canary` | SRE | 发布后监控循环，控制台错误、性能回归 |

#### 反思阶段（Reflect）

| 技能 | 角色 | 核心能力 |
|------|------|----------|
| `/retro` | Eng Manager | 每周回顾，个人分解，发布 streak，测试健康趋势 |
| `/learn` | Memory | 管理跨会话学习记录 |

#### Power Tools

| 技能 | 说明 |
|------|------|
| `/browse` | 持久化无头 Chromium，~100ms/命令 |
| `/open-gstack-browser` | 带侧边栏的 headed 浏览器，反 bot 隐身 |
| `/pair-agent` | 跨 Agent 浏览器共享（Claude + OpenClaw + Codex 等） |
| `/setup-gbrain` | gbrain 一键安装配置 |
| `/sync-gbrain` | 代码重新索引到 gbrain |
| `/freeze` / `/guard` / `/unfreeze` | 编辑锁定与安全护栏 |

### 2.4 安全模型（深度）

gstack 的安全设计是其架构中最令人印象深刻的部分之一：

#### 2.4.1 双监听器隧道架构（v1.6.0.0）

当运行 `pair-agent --client` 时，daemon 启动 ngrok 隧道供远程 Agent 使用。安全设计不是通过 header 检查，而是**物理端口分离**：

| Endpoint | Local Listener | Tunnel Listener |
|----------|---------------|-----------------|
| `GET /health` | public（本地 token 引导） | **404** |
| `POST /command` | auth（Bearer root OR scoped） | auth（scoped only，命令白名单） |
| `GET /cookie-picker` | public UI | **404** |
| `POST /pair` | root-only | **404** |

> "Header inference 不可靠（ngrok header 行为会变化；本地代理可以添加这些 header）；socket 分离是可靠的。"

#### 2.4.2 提示注入防御（6 层）

gstack 的 Chrome 侧边栏 Agent 是最暴露在提示注入攻击下的部分，防御是分层设计：

| 层级 | 机制 | 说明 |
|------|------|------|
| L1-L3 | 内容安全 (`content-security.ts`) | 数据标记、隐藏元素剥离、ARIA 正则、URL 黑名单、信任边界信封 |
| L4 | ML 分类器 (TestSavantAI) | 22MB BERT-small ONNX 模型，本地运行，扫描每条消息和工具输出 |
| L4b | 转录分类器 | Claude Haiku 检查完整对话形状（user message + tool calls + tool output） |
| L5 | Canary token (`security.ts`) | 随机 token 注入系统提示，跨 text_delta/input_json_delta 流检测泄露 |
| L6 | 集成组合器 (`combineVerdict`) | BLOCK 需要两个 ML 分类器 >= WARN (0.75) 达成一致 |

**关键约束：** `security-classifier.ts` 只在 sidebar-agent 进程中运行，不在编译的 browse 二进制中运行（因为 `@huggingface/transformers` v4 需要 `onnxruntime-node`，在 Bun compile 的临时提取目录中会 `dlopen` 失败）。

#### 2.4.3 其他安全措施

- **Cookie 安全：** Keychain 访问需用户批准、内存中解密、只读复制 SQLite DB、不记录 cookie 值
- **Shell 注入防护：** 浏览器注册表硬编码、数据库路径由已知常量构造、使用 `Bun.spawn()` 显式参数数组
- **Unicode 清理：** 在服务器出口处清理孤立的 UTF-16 代理半字节（防止 Anthropic API 400 错误）
- **Secret 保护：** `/sync-gbrain` 阶段的 secret 扫描器阻止 AWS keys、GitHub tokens、PEM blocks、JWTs 离开机器

### 2.5 构建理念（ETHOS.md）

gstack 的构建哲学值得深入理解：

#### 2.5.1 Boil the Lake（煮沸湖水）

> "AI 辅助编码使完整实现的边际成本趋近于零。当完整实现比快捷方式只多花几分钟时——每次都做完整的事。"

- **Lake vs. Ocean：** "湖"是可以煮沸的（100% 测试覆盖、完整功能实现、所有边界情况）；"海洋"不能（重写整个系统、多季度平台迁移）
- **反模式：** "选择 B，它用更少代码覆盖 90%"（如果 A 只多 70 行，选 A）

#### 2.5.2 Search Before Building（构建前先搜索）

三层知识来源：

| 层级 | 类型 | 策略 |
|------|------|------|
| Layer 1 | 久经考验 | 标准模式，偶尔质疑 |
| Layer 2 | 新潮流行 | 搜索，但批判性审视 |
| Layer 3 | 第一性原理 | 最宝贵，基于具体问题推理的原创观察 |

#### 2.5.3 User Sovereignty（用户主权）

> "AI 模型推荐。用户决定。这是凌驾于所有其他规则的规则。"

- 两个 AI 模型达成一致是强信号，但不是命令
- 用户拥有的上下文模型永远不知道：领域知识、业务关系、战略时机、个人品味
- 正确的模式是生成-验证循环：AI 生成推荐，用户验证并决定

---

## 3. gbrain 深度分析

### 3.1 定位与技术架构

gbrain 是**为 AI Agent 设计的持久化知识库**。它的核心功能是存储 Agent 学到的东西、用户的决策、什么有效什么无效，并让 Agent 按需搜索。

**技术栈：**

```
┌────────────────────────────────────────┐
│           gbrain CLI (TypeScript)       │
│  • search  • put  • get  • serve       │
├────────────────────────────────────────┤
│         Postgres / PGLite + pgvector    │
│  • pages  • chunks  • embeddings       │
│  • links  • tags  • timeline           │
├────────────────────────────────────────┤
│         Embedding Provider              │
│  • voyage-code-3 (1024-dim, 首选)      │
│  • OpenAI text-embedding-3-large        │
└────────────────────────────────────────┘
```

**核心数据模型：**

- **Page：** 知识的基本单元，带有 YAML frontmatter（title, tags, date）
- **Chunk：** Page 的分块，用于向量搜索
- **Embedding：** 文本的向量表示，存储在 pgvector 中
- **Link：** Page 之间的链接关系
- **Tag：** 分类标签
- **Timeline：** 时间线事件

**查询接口：**

| 命令 | 功能 |
|------|------|
| `gbrain search "query"` | 语义搜索，返回排序的文档片段 |
| `gbrain code-def "symbol"` | 符号定义查询（调用图） |
| `gbrain code-refs "symbol"` | 符号引用查询 |
| `gbrain code-callers "symbol"` | 调用者查询 |
| `gbrain code-callees "symbol"` | 被调用者查询 |
| `gbrain put "slug" --content "..."` | 写入 page |
| `gbrain get "slug"` | 获取 page |

### 3.2 部署模式

gstack 提供四种路径，通过 `/setup-gbrain` 一键配置：

| 路径 | 场景 | 时间 | 特点 |
|------|------|------|------|
| **Path 1: Supabase 现有 URL** | 已有 cloud brain | 秒级 | 粘贴 Session Pooler URL |
| **Path 2a: Supabase 自动配置** | 新 Supabase 账户 | ~90s | 粘贴 PAT，自动创建项目 |
| **Path 3: PGLite 本地** | 试用/隔离 | ~30s | `~/.gbrain/brain.pglite`，零账户 |
| **Path 4: 远程 gbrain MCP** | 跨机器共享 | 可变 | 分离引擎：远程 brain + 本地 code search |

**嵌入模型选择：**

- 当 `VOYAGE_API_KEY` 存在时，使用 `voyage-code-3`（1024 维）—— Voyage 的代码专用嵌入模型
- 否则回退到 OpenAI `text-embedding-3-large`（1536 维）
- 无 API key 时，页面以结构方式导入（符号表、chunk），但语义搜索降级为 BM25

### 3.3 与 gstack 的集成

#### 3.3.1 `/setup-gbrain` — 一键安装

```bash
/setup-gbrain
```

自动完成：
1. 检测当前状态（gbrain 是否在 PATH、版本、配置引擎）
2. 选择路径（4 种之一）
3. 初始化数据库
4. 注册 MCP：`claude mcp add gbrain -- gbrain serve`
5. 配置按仓库信任策略（read-write / read-only / deny）

#### 3.3.2 `/sync-gbrain` — 保持 brain 最新

```bash
/sync-gbrain              # 增量同步（默认，~秒级）
/sync-gbrain --full       # 全量重新索引（~25-35 分钟）
/sync-gbrain --code-only  # 仅代码阶段
/sync-gbrain --dry-run    # 预览，不写入
```

三阶段独立运行：
1. **Code stage：** 注册 cwd 为 federated source → `gbrain sync --strategy code`
2. **Memory stage：** 暂存 `~/.gstack/` 的转录 + 精选记忆
3. **Brain-sync stage：** 推送精选产物到私有 artifacts repo（如果配置）

#### 3.3.3 按仓库信任策略（Triad）

每个仓库获得一个策略决策：

| 策略 | 含义 | 场景 |
|------|------|------|
| `read-write` | 可搜索 + 可写入 | 自己的项目（默认） |
| `read-only` | 可搜索，永不写入 | 多客户顾问：搜索共享 brain，不污染 |
| `deny` | 无 gbrain 交互 | 敏感/临时仓库 |

存储在 `~/.gstack/gbrain-repo-policy.json`，SSH 和 HTTPS remote 变体折叠为同一 key。

### 3.4 能力边界

gbrain 的核心限制已在 `gbrain-analysis.md` 中详细分析，这里总结关键结论：

<font color="#ff4d4f">gbrain 是搜索引擎，不是数据库。它的数据模型是"文档-向量"，不是"实体-关系"。</font>

| 需求类型 | gbrain 能否满足 | 原因 |
|----------|----------------|------|
| 语义代码搜索 | ✅ 完全满足 | 向量化 + BM25 混合排序 |
| 跨会话记忆 | ✅ 完全满足 | Page + timeline 模型 |
| 符号调用图 | ✅ 满足 | `code-def`, `code-refs` 等 |
| **结构化关系查询** | ❌ **不能满足** | 无关系概念，只有文档相似度 |
| **影响面分析** | ❌ **不能满足** | 无法做"接口 → 字段 → 页面"的多跳遍历 |
| **一致性校验** | ❌ **不能满足** | 无表结构，无法做集合对比 |

**强行基于 gbrain 做的方案缺陷：**

| 问题 | 说明 |
|------|------|
| 数据预处理复杂 | 需把 Markdown 拆成几十个独立 page，维护映射关系 |
| 查询不精确 | 语义搜索返回"相似"结果，可能混入无关内容 |
| 无法多跳遍历 | 无法做链式查询 |
| 一致性校验仍做不了 | 没有表结构 |
| 违背 gbrain 设计 | gbrain 设计为"文档知识库"，不是"关系数据库" |

---

## 4. gstack + gbrain 协同分析

### 4.1 协同机制

gstack 和 gbrain 的协同体现在三个层面：

#### 层面 1：上下文加载（Context Load）

10 个 brain-aware 技能的 preamble 中注入 `{{GBRAIN_CONTEXT_LOAD}}`：

- 从 gbrain 搜索相关上下文
- 关键词提取、健康感知、数据研究路由
- 如果 gbrain 未配置，零上下文成本（不阻塞）

#### 层面 2：结果持久化（Save Results）

8 个技能在完成后将结果保存到 gbrain：

- CEO plans → gbrain page
- Design docs → gbrain page
- Review findings → gbrain page
- Learnings → gbrain page + `~/.gstack/` JSONL

#### 层面 3：跨机器记忆（Memory Sync）

```
Machine A: ~/.gstack/ → git push → private repo
                      ↓
Machine B: git pull → ~/.gstack/ → gbrain re-index
```

- `gstack-brain-init`：将 `~/.gstack/` 转为 git repo，配置 remote
- 每次技能运行自动同步（开始和结束边界，~200-800ms）
- Secret 扫描器阻止凭证离开机器
- JSONL 文件使用自定义 merge driver（按时间戳排序去重）

### 4.2 记忆闭环（v1.52.0.0 — Plan-Tune Cathedral）

gstack v1.52 引入了完整的"记忆闭环"系统：

```
AskUserQuestion 触发
    ↓
PostToolUse Hook 捕获 → question-log.jsonl
    ↓
gstack-developer-profile --derive → 心理画像
    ↓
PreToolUse Hook 执行偏好 → 自动决定 "never-ask" 选项
    ↓
"Other" 自由文本回答 → gstack-distill-free-text → 结构化提案
    ↓
/plan-tune distill → 用户审批 → never-ask / declared-nudge / memory-nugget
    ↓
memory-nugget → gbrain put_page → 跨项目回忆
```

这个闭环使 gstack 越用越聪明——每个回答都在积累个人偏好和项目知识。

### 4.3 安全协同

| 安全维度 | gstack | gbrain | 协同 |
|----------|--------|--------|------|
| Secret 管理 | 扫描器阻止凭证离开机器 | env var 传递，不写入 argv | gstack 的 secret 扫描保护 gbrain 同步内容 |
| 按仓库隔离 | per-remote trust triad | 无原生隔离 | gstack 的策略决定哪些代码进入 gbrain |
| 传输安全 | ngrok 隧道 + scoped token | localhost / TLS | Path 4 远程 MCP 模式下，gstack 管理 token |

---

## 5. 与 gant-atlas 的对比与启示

### 5.1 定位差异

```
                    ┌─────────────────┐
                    │   Claude Code    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐        ┌───────────┐        ┌───────────┐
   │  gstack  │        │  gbrain    │        │ gant-atlas │
   │ Workflow │        │  Memory    │        │  Business  │
   │  Orchestration    │  (Semantic)│        │  Spec Query│
   └─────────┘        └───────────┘        └───────────┘
        │                    │                    │
        ▼                    ▼                    ▼
   浏览器自动化         向量语义搜索            结构化关系
   代码审查             跨会话记忆              影响面分析
   QA 测试              代码索引                一致性校验
   设计评审             文档检索                规格查询
```

### 5.2 技术路径对比

| 维度 | gbrain | gant-atlas |
|------|--------|------------|
| **核心问题** | "这段代码/文档在语义上类似什么？" | "修改这个接口会影响哪些页面/字段？" |
| **数据结构** | 文档 → chunk → 向量 | 实体（Page/Field/API） → 关系（HAS_FIELD/CALLS_API） |
| **查询语言** | 语义相似度 + BM25 | SQL JOIN / Cypher |
| **存储** | Postgres + pgvector | SQLite |
| **适用场景** | 模糊搜索、记忆回忆、代码发现 | 精确查询、影响分析、一致性校验 |

### 5.3 对 gant-atlas 的设计启示

#### 启示 1：技能封装（Skill-as-Workflow）

gstack 将复杂任务封装为 `/command` 形式的技能。gant-atlas 可以借鉴这一模式：

```
当前：
  用户问："数据权限管理页面有哪些查询字段？"
  Agent 需要：find + grep + 解析 Markdown 表格

借鉴 gstack 后：
  用户问："数据权限管理页面有哪些查询字段？"
  Agent 调用：atlas.get_page_spec("bombusiness/dataauthgroup")
  → 返回结构化 JSON
```

**建议：** 将 `get_page_spec`, `analyze_impact`, `check_consistency` 包装为 Claude Code 的 MCP tools，让 Agent 像调用 gstack 技能一样调用 atlas。

#### 启示 2：Preamble 设计

gstack 的每个技能都有 `{{PREAMBLE}}` 块，处理更新检查、会话跟踪、学习加载等通用逻辑。gant-atlas 的 MCP Server 可以设计类似的"上下文加载"机制：

- 在 MCP tool 调用前自动加载相关页面上下文
- 在 tool 调用后将查询结果保存到记忆（可选集成 gbrain）

#### 启示 3：不要重复造轮子

gbrain 已经很好地解决了"语义搜索"和"跨会话记忆"问题。gant-atlas 应该：

1. **专注做 gbrain 做不了的事：** 结构化关系查询、影响面分析、一致性校验
2. **与 gbrain 互补而非替代：** 在需要语义搜索时（如"找一下跟权限相关的页面"），调用 gbrain；在需要精确关系查询时，使用 atlas
3. **不要试图在 gbrain 上构建关系图谱：** 违背设计哲学，效果差，维护成本高

#### 启示 4：渐进式部署

gstack 的四种 gbrain 部署路径体现了"渐进式"设计哲学：

| 阶段 | gbrain 路径 | gant-atlas 对应 |
|------|------------|----------------|
| 试用 | PGLite 本地 | SQLite 本地，零配置 |
| 团队 | Supabase 共享 | 共享 atlas.db |
| 生产 | 远程 MCP | MCP Server 远程部署 |

gant-atlas 当前的 SQLite 单文件设计是正确选择——零部署成本，足够满足业务关系查询需求。

#### 启示 5：测试策略

gstack 的三层测试策略值得借鉴：

| 层级 | 内容 | 成本 | 速度 |
|------|------|------|------|
| Tier 1 | 静态验证（解析命令，验证注册表）| 免费 | <2s |
| Tier 2 | E2E（真实 Claude 会话）| ~$3.85 | ~20min |
| Tier 3 | LLM-as-judge（评分清晰度/完整性）| ~$0.15 | ~30s |

**建议：** gant-atlas 的解析器应优先建设 Tier 1（单元测试覆盖所有 Markdown 表格变体），再考虑 Tier 2（端到端 MCP tool 调用）。

### 5.4 潜在集成点

虽然 gant-atlas 不应基于 gbrain 构建，但两者可以在以下点集成：

```
┌─────────────────────────────────────────────────────────────┐
│                        Claude Code                          │
├─────────────────────────────────────────────────────────────┤
│  1. 用户问："修改 dataAuthGroupFindListApi 会影响什么？"      │
│                                                            │
│  2. Agent 路由决策：                                        │
│     • 如果是模糊搜索（"找权限相关的东西"）→ gbrain search   │
│     • 如果是精确影响分析（"修改这个接口"）→ atlas.analyze_impact │
│                                                            │
│  3. atlas.analyze_impact 执行：                             │
│     • 查询 SQLite 关系图                                    │
│     • 返回结构化影响面报告                                  │
│                                                            │
│  4. （可选）将结果保存到 gbrain：                           │
│     gbrain put "impact-dataauthgroup-api"                   │
│     用于未来跨会话回忆                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 结论

### 6.1 核心发现

1. **gstack 是 AI 工程工作流的巅峰实现。** 它不是简单的工具集合，而是一个完整的"软件工厂"操作系统，将浏览器自动化、代码审查、QA、设计评审、安全审计、发布管理等环节串联为可复用的结构化工作流。其安全模型（双监听器、6 层提示注入防御、Secret 扫描）尤其值得学习。

2. **gbrain 是语义记忆的优秀实现。** Postgres + pgvector 的组合为代码和文档提供了高质量的语义搜索能力。但其设计哲学明确为"文档知识库"，不适合结构化关系查询。

3. **gant-atlas 与 gbrain 是正交关系。** atlas 解决的是"业务规格的结构化关系查询"问题，这是 gbrain 的设计边界之外。已有的 `gbrain-analysis.md` 结论完全正确：gbrain 是搜索引擎，atlas 是数据库，两者可以并存但不能替代。

### 6.2 对 gant-atlas 的建议

<font color="#52c41a">建议优先级：</font>

| 优先级 | 建议 | 理由 |
|--------|------|------|
| P0 | **保持 SQLite 关系存储** | 零部署、精确查询、适合业务关系 |
| P0 | **封装 MCP Tools** | 让 Agent 像调用 gstack 技能一样调用 atlas |
| P1 | **设计 Agent 路由规则** | 教 Agent 何时用 gbrain（语义搜索），何时用 atlas（精确查询） |
| P1 | **参考 gstack 的 Preamble 模式** | 在 MCP tool 调用前后自动加载/保存上下文 |
| P2 | **考虑与 gbrain 的集成点** | 将 atlas 查询结果保存到 gbrain，实现跨会话记忆 |
| P2 | **建设 Tier 1 测试** | 解析器需要高覆盖率的单元测试（参考 gstack 的静态验证策略） |

### 6.3 一句话总结

> **gstack 是"怎么做"（workflow），gbrain 是"记得什么"（memory），gant-atlas 是"什么关系"（structure）。三者互补，共同构成 AI 辅助开发的完整基础设施。**

---

## 附录 A：参考资源

| 资源 | 路径/URL |
|------|----------|
| gstack 源码 | `/home/chen/github/gstack/` |
| gstack README | `/home/chen/github/gstack/README.md` |
| gstack 架构文档 | `/home/chen/github/gstack/ARCHITECTURE.md` |
| gstack 构建理念 | `/home/chen/github/gstack/ETHOS.md` |
| gbrain 使用指南 | `/home/chen/github/gstack/USING_GBRAIN_WITH_GSTACK.md` |
| gbrain 同步文档 | `/home/chen/github/gstack/docs/gbrain-sync.md` |
| gbrain GitHub | `https://github.com/garrytan/gbrain` |
| gbrain 分析（已有） | `/home/chen/gant-codespace/gant-atlas/docs/gbrain-analysis.md` |
| gant-atlas 设计文档 | `/home/chen/gant-codespace/gant-atlas/docs/design.md` |

## 附录 B：gstack 技能完整列表

```
/office-hours          /plan-ceo-review       /plan-eng-review
/plan-design-review    /plan-devex-review     /design-consultation
/design-shotgun        /design-html           /design-review
/review                /investigate           /devex-review
/qa                    /qa-only               /pair-agent
/cso                   /ship                  /land-and-deploy
/canary                /benchmark             /document-release
/document-generate     /retro                 /browse
/open-gstack-browser   /setup-browser-cookies /setup-deploy
/setup-gbrain          /sync-gbrain           /autoplan
/spec                  /learn                 /codex
/careful               /freeze                /guard
/unfreeze              /gstack-upgrade        /context-save
/context-restore       /make-pdf              /health
/plan-tune             /ios-qa                /ios-fix
/ios-design-review     /ios-clean             /ios-sync
```

## 附录 C：版本信息

| 组件 | 版本 | 日期 |
|------|------|------|
| gstack | v1.52.0.0 | 2026-05-27 |
| Bun | >= 1.0.0 | — |
| Playwright | ^1.58.2 | — |
| gbrain | 配套 gstack 版本 | — |
