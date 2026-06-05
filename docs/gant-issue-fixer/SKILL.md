---
name: gant-issue-fixer
description: '通用需求修改与Bug修复技能，支持所有业务包。双模式运行：分析模式（搜索定位+文档扫描+代码分析→输出结构化报告）和执行模式（按Spec在Worktree中修改代码）。本Skill不做任何git操作、不补文档、不测试、不生成Spec，这些职责由主流程（WF2）统一管理。触发词：修bug、修复问题、需求修改、改需求、bug修复、问题分析、功能修改、ibom修复、ilowcode修复、ip2system修复、usersystem修复、icost修复。'
---

# 通用需求修改与 Bug 修复

基于云效 MCP（可选）、代码分析和功能清单文档的需求修改与 Bug 修复技能。

> **职责边界**：本 Skill 只做**分析**和**代码修改**。文档补充、Worktree 创建、Spec 生成、测试验证、提交合并均由主流程（WF2）管理。本 Skill 不做任何 git 操作。

## 双模式

### 模式判定

- 提示词包含 `模式：分析` → **分析模式**
- 提示词包含 `模式：执行` → **执行模式**

---

## 分析模式

**目标**：获取问题 → 搜索定位 → 文档扫描 → 代码分析 → 输出结构化报告 → 返回主流程。

```
Step 1 获取问题 → Step 2 智能分析(2a→2b🚧→2c) → [Step 3 浏览器复现] → 输出报告 → 结束
```

### Step 1: 获取问题

| 输入方式 | 处理方法 |
|---------|---------|
| 云效工作项 ID/URL | 调用 `mcp__yunxiao_2__get_work_item` 获取详情 |
| 问题描述 | 直接解析关键词 |
| 文件路径 | 从路径提取包名和模块 |

解析提取：包名、模块、问题类型、复现步骤、严重程度。

### Step 2: 智能分析 + 文档查询

> **严格顺序**：2a → 2b → 2c，不可跳过或调换。

#### 2a: 搜索定位（仅 Glob/Grep，禁止 Read）

用 Glob/Grep 搜索定位涉及的文件目录，**禁止使用 Read**。

**必须输出**"📋 2a 搜索定位结果"表格（格式见 [step-output-formats.md](references/step-output-formats.md)），否则不可进入 2b。

搜索无结果时：扩大范围 → 换同义词 → 仍无结果则请求用户提供路径。

#### 2b: 文档扫描（🚧 只报告不补充——这是协议 A 在 WF2 中的执行点）

1. 对 2a 定位的每个代码目录，映射到文档路径（`packages/<pkg>/src/<module>/` → `ai-harness-root/docs/<pkg>/<module>/`），检查文档是否存在
2. **不补充文档**，只记录存在/缺失状态
3. 已存在文档 → 调用 `gant-feature-docs` 模式 B 读取
4. 涉及 procomponents 框架代码时标记 ⚡

**必须输出**"🚧 2b 文档扫描结果"表格（格式见 [step-output-formats.md](references/step-output-formats.md)），这是进入 2c 的**唯一凭证**。

#### 2c: 代码阅读与分析（2b 扫描通过后才可用 Read）

使用 Read 阅读代码，结合 2b 文档进行分析：
- 按目录阅读入口文件和接口定义
- 对照功能清单文档标注差异
- Bug：反向追踪（报错 → Store/API → 数据来源）
- 需求：正向追踪（入口 → Props → State → 子组件）

输出"📋 2c 分析结论"（格式见 [step-output-formats.md](references/step-output-formats.md)）。

**Step 2 完成检查**：2a✅ + 2b扫描✅ + 2c✅ → 已明确原因输出报告；无法确定则执行 Step 3。

### Step 3: 浏览器复现（条件执行）

仅当 Step 2 无法确定原因时执行。委托 `gant-create-test` 模式一（只测试），在浏览器中复现问题。本地服务未启动时先从 packages.json 获取 startCommand 启动。

### 输出结构化报告

分析模式结束时，**必须**返回以下结构化报告给主流程：

```markdown
## 📋 分析报告

### 涉及文件
- `packages/<pkg>/src/<module>/<file>`
- ...

### 文档扫描结果
| 代码目录 | 文档路径 | 状态 |
|---------|---------|------|
| `packages/<pkg>/src/<module>/` | `ai-harness-root/docs/<pkg>/<module>/` | ✅ 存在 / ❌ 缺失 |

### 缺失文档清单（主流程处理）
- `ai-harness-root/docs/<pkg>/<module>/` ← 需创建
（无缺失则标注"全部存在"）

### 根因分析
...

### 修改方案
| 文件 | 修改内容 |
|------|---------|
| `packages/<pkg>/src/<module>/<file>` | 具体修改说明 |
```

---

## 执行模式

**目标**：接收 Spec + Worktree 路径 + 文档 → 按 Spec 逐步修改代码 → 输出修改清单 → 返回主流程。

**前提**：
- Worktree 已由主流程创建
- 文档已由主流程补充完整
- Spec 已由主流程生成

### 执行流程

1. 读取 Spec 文件，理解修改计划
2. 读取相关文档，建立功能认知
3. 按 Spec 逐步执行 Edit，每步完成标记进度
4. 所有文件操作必须在 Worktree 目录中执行
5. 输出修改清单，结束返回主流程

### 输出修改清单

```markdown
## ✅ 修改完成

### 修改文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/<pkg>/src/<module>/<file>` | Edit | 修改说明 |

### 注意事项
- ...
```

---

## 配置表

包配置在 `config/packages.json`。**包名识别**：路径提取 > 用户指定 > 云效标签 > 提示选择。

## 委托的 Skill

| Skill | 模式 | 调用时机 |
|-------|------|---------|
| `gant-feature-docs` | B（读取） | 分析模式 2b：读取已有文档 |
| `gant-create-test` | 模式一（只测试） | 分析模式 Step 3：浏览器复现（条件） |

## 云效 MCP 工具（可选）

| 工具 | 用途 |
|-----|------|
| `mcp__yunxiao_2__get_work_item` | 获取工作项详情 |
| `mcp__yunxiao_2__list_work_item_comments` | 获取评论 |

---

## 关键规则

### 必须行为

- 分析模式：Step 2 严格按 2a→2b→2c 顺序，2a 仅 Glob/Grep，2b 扫描通过才可用 Read
- 分析模式：2a/2b 必须输出规定格式表格
- 分析模式：结束时必须返回结构化报告
- 执行模式：所有文件操作必须在 Worktree 路径中执行
- 执行模式：按 Spec 逐步修改，不做额外改动
- 代码修改遵守全局规则（tr 国际化、procomponents 方法、CSS-in-JS 规范）

### 禁止行为

- 2b 未完成时使用 Read、跳过 2b 进入 2c、调换顺序
- 未输出 2a/2b 规定格式就进入下一步
- **执行任何 git 操作**（commit、merge、push、worktree add/remove 等）
- 补充或创建文档（由主流程负责）
- 创建 Worktree（由主流程负责）
- 浏览器验证（由主流程负责）
- 在 Worktree 外修改源码文件

---

## 错误处理

| 场景 | 处理方式 |
|-----|---------|
| 2a 搜索无结果 | 扩大范围 → 换同义词 → 请求用户提供路径 |
| 2b 用户跳过所有文档 | 2c 标注"无文档参考"+ 信心等级 |
| 2b 框架代码 | 标记 ⚡ 并在报告中说明 |
| 代码无法定位 | 请求更多信息或文件路径 |
| 本地服务未启动 | 从 packages.json 获取 startCommand 启动 |

---

## 进阶参考

- [config/packages.json](config/packages.json) — 包配置表
- [references/common-bugs.md](references/common-bugs.md) — 通用问题类型与定位策略
- [references/code-modification-rules.md](references/code-modification-rules.md) — 代码修改规范
- [references/step-output-formats.md](references/step-output-formats.md) — 各步骤输出格式模板
- [templates/analysis-report.md](templates/analysis-report.md) — 分析报告模板
- [templates/verification-report.md](templates/verification-report.md) — 验证结果报告模板
