---
name: gant-issue-fixer
description: '[project] 通用需求修改与Bug修复技能，支持所有业务包。核心特色：修改代码时同步更新功能清单文档。融合 gant-feature-docs（文档管理）和 gant-create-test（浏览器测试验证）。触发词：修bug、修复问题、需求修改、改需求、bug修复、问题分析、功能修改、ibom修复、ilowcode修复、ip2system修复、usersystem修复、icost修复。'
---

# 通用需求修改与Bug修复

基于云效 MCP（可选）、代码分析和功能清单文档的需求修改与 Bug 修复技能，支持所有业务包。

核心特色：**修改代码时同步更新功能清单文档**。

## 核心原则

1. **文档同步第一**：任何涉及页面/组件/方法功能变更的修改，必须同步更新对应功能清单文档；无文档则先创建再修改
2. **通用包支持**：通过 `config/packages.json` 配置表支持所有业务包，不硬编码端口和路径
3. **委托测试**：浏览器测试验证委托给 `gant-create-test`（模式一：只测试），不自建浏览器流程
4. **云效可选**：云效 MCP 为可选问题来源，同时支持直接描述问题和文件路径
5. **两阶段确认**：方案确认 + 验证确认，确认后自动提交

---

## 执行流程 (6 步)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    通用需求修改与 Bug 修复流程                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Step 1: 获取问题                                                        │
│    ├→ 方式 A: 云效 MCP 获取工作项详情（可选）                               │
│    ├→ 方式 B: 用户提供问题描述                                            │
│    ├→ 方式 C: 用户提供文件路径                                            │
│    └→ 解析：提取包名、模块、关键词、复现步骤                                │
│         ↓                                                                │
│  Step 2: 智能分析 + 文档查询                                              │
│    ├→ 2a: 根据关键词定位相关模块和文件（代码搜索）                           │
│    ├→ 2b: 扫描所有涉及目录文档状态，与用户确认缺失文档处理方式               │
│    │       ├→ 文档存在：调用模式 B 读取内容                                │
│    │       └→ 文档缺失：询问用户选择创建/跳过，再按选择调用模式 A            │
│    ├→ 2c: 对比文档与代码，理解当前功能逻辑                                  │
│    └→ 初步判断问题原因 / 需求影响范围                                      │
│         ↓ (如已定位原因 → 跳到 Step 4；否则 ↓)                             │
│  Step 3: 浏览器复现问题（条件执行）                                        │
│    ├→ 仅当 Step 2 无法确定原因时执行                                      │
│    ├→ 委托 gant-create-test（模式一：只测试）                              │
│    └→ 返回问题现象截图和描述                                              │
│         ↓                                                                │
│  Step 4: 方案确认 ⏸️ (第一个确认点)                                       │
│    ├→ 输出根因分析 / 需求影响分析                                         │
│    ├→ 展示代码修改 diff + 文档修改计划                                     │
│    ├→ 列出修改文件列表（代码文件 + 文档文件）                               │
│    └→ 等待用户确认                                                       │
│         ↓ (用户确认方案)                                                  │
│  Step 5: 执行修改与验证 ⏸️ (第二个确认点)                                  │
│    ├→ 5a: 执行代码修改                                                   │
│    ├→ 5b: 代码质量检查（code-detection-toolbox）                          │
│    ├→ 5c: 委托 gant-create-test（模式一）验证修复效果                      │
│    ├→ 5d: 调用 gant-feature-docs（模式 C）同步更新功能清单文档             │
│    │       └→ 纯性能/样式修改不影响功能描述时可跳过                         │
│    └→ 等待用户确认验证结果                                                │
│         ↓ (用户确认通过)                                                  │
│  Step 6: 提交与收尾 (自动执行)                                            │
│    ├→ 6a: 提交代码变更至远程分支                                          │
│    ├→ 6b: 如来源为云效，更新工作项状态并添加解决说明                        │
│    └→ 输出完成报告                                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 配置表

所有包配置存放在 `config/packages.json`。执行时从中读取对应包的路径、命令、端口等信息。

**包名识别决策树**：

1. 用户输入含 `packages/{pkg}/` 路径 → 取 `{pkg}`
2. 用户明确说"ibom 的xxx"、"ilowcode的xxx" → 取对应包名
3. 云效工作项的标签/模块字段 → 查 packages.json 中的 description 反查
4. 以上均无法确定 → 使用 `AskUserQuestion` 列出所有包名让用户选择

---

## Step 1: 获取问题

### 输入方式

| 输入方式 | 示例 | 处理方法 |
|---------|------|---------|
| 云效工作项 ID | `修复 #12345` | 调用 `mcp__yunxiao_2__get_work_item` |
| 云效工作项 URL | `https://yunxiao.aliyun.com/...` | 解析 URL 提取 ID |
| 问题描述 | `零件详情页的设计信息Tab加载报错` | 直接解析关键词 |
| 文件路径 | `packages/ibom/src/ebom/ecr/detail/index.tsx 有bug` | 从路径提取包名和模块 |

### 从云效获取工作项（可选）

```bash
# 获取工作项详情
mcp__yunxiao_2__get_work_item(organizationId, workItemId)

# 获取工作项评论（可能包含更多信息）
mcp__yunxiao_2__list_work_item_comments(organizationId, workItemId)
```

### 解析关键信息

| 字段 | 说明 | 提取方法 |
|-----|------|---------|
| 包名 | 所属业务包 | 路径提取 > 用户指定 > 提示选择 |
| 模块 | 业务模块 | 关键词匹配 |
| 问题类型 | Bug/需求修改/样式 | 语义判断 |
| 复现步骤 | 操作路径 | 问题描述中提取 |
| 严重程度 | 阻塞/严重/一般 | 云效优先级或语义判断 |

---

## Step 2: 智能分析 + 文档查询

### 2a: 代码搜索定位

根据问题关键词在对应包下搜索：

```bash
# 按模块搜索
Glob: packages/{pkg}/src/{module}/**/*.tsx

# 按关键词搜索
Grep: pattern="xxxApi" path="packages/{pkg}/"

# 按错误信息搜索
Grep: pattern="错误消息文本" path="packages/{pkg}/"
```

### 2b: 查询功能清单文档

**调用 `gant-feature-docs` skill 的模式 B（读取文档）**，输入为代码目录路径。

#### 第一步：扫描所有涉及的代码目录

一个 bug/需求可能涉及多个页面、组件或公共组件，需先收集**所有相关代码目录**，再统一处理文档状态：

1. 根据问题分析，列出所有涉及的代码目录，例如：
   - 主页面目录：`packages/ibom/src/ebom/ecr/`
   - 组件目录：`packages/ibom/src/components/xxx/`
   - 公共 Hook：`packages/ibom/src/hooks/bom/useBomSearch.ts`

2. 对每个目录按路径规则映射到文档路径（`src` → `docs`），检查文档是否存在：

| 序号 | 代码路径 | 文档路径 | 文档状态 |
|------|---------|---------|---------|
| 1 | `packages/ibom/src/ebom/ecr/` | `packages/ibom/docs/ebom/ecr/main.md` | ✅ 存在 / ❌ 缺失 |
| 2 | `packages/ibom/src/components/xxx/` | `packages/ibom/docs/components/xxx/main.md` | ✅ 存在 / ❌ 缺失 |

#### 第二步：与用户确认缺失文档的处理方式

**仅当有文档缺失时**，使用 `AskUserQuestion` 询问用户：

```
以下代码目录尚无对应的功能清单文档，请选择需要补充文档的范围：

❌ packages/ibom/src/components/xxx/ （组件，文档缺失）
❌ packages/ibom/src/hooks/bom/useBomSearch.ts （Hook，文档缺失）

选项：
A. 全部创建（为所有缺失目录生成文档）
B. 仅创建主要页面文档（跳过组件和 Hook）
C. 手动选择（用户指定哪些需要创建）
D. 跳过（此次不创建文档，只修复代码）
```

> **重要**：不要自动为所有缺失目录创建文档，应由用户决定范围。

#### 第三步：按用户选择执行文档操作

- **已存在的文档** → 直接调用 gant-feature-docs 模式 B，读取内容
- **用户选择创建的缺失文档** → 调用 gant-feature-docs 模式 A 先生成，再读取
- **用户选择跳过的缺失文档** → 记录为"无文档参考"，依靠代码分析继续

5. 将读取到的功能清单与问题描述对比，辅助分析原因

**文档路径映射规则**：把代码路径中的 `src` 换成 `docs`，其余部分保持不变。

| 场景 | 代码路径 | 文档路径 |
|------|---------|---------|
| 页面目录 | `packages/ibom/src/ebom/ecr/` | `packages/ibom/docs/ebom/ecr/` |
| 组件目录 | `packages/ibom/src/components/xxx/` | `packages/ibom/docs/components/xxx/main.md` |
| Hook 文件 | `packages/ibom/src/hooks/bom/useBomSearch.ts` | `packages/ibom/docs/hooks/bom/useBomSearch.md` |

### 2c: 分析逻辑

- 阅读代码文件 + 功能清单文档
- 理解数据流（API → Store → Component）
- 对比文档描述与代码实现，发现差异
- 初步判断原因 / 需求影响范围

**Step 2 完成检查点**：
- ✅ 已定位到相关模块和文件
- ✅ 已扫描所有涉及目录的文档状态，缺失文档已与用户确认处理方式
- ✅ 已理解代码逻辑和功能描述
- ✅ 已初步判断问题原因 / 需求影响范围
- ⏭️ **判断分支**：已明确原因 → Step 4；无法确定 → Step 3

---

## Step 3: 浏览器复现问题（条件执行）

**触发条件：仅当 Step 2 无法确定问题原因时执行此步骤。**

### 委托 gant-create-test

**调用 `gant-create-test` skill 的模式一（只测试）**，描述如下：

- 目标：在浏览器中复现问题
- 页面：从配置表获取的包名 + 从问题中提取的页面信息
- 操作步骤：从问题描述中提取的复现步骤
- 期望返回：问题现象截图、问题现象描述、是否成功复现

注意事项：
- 如本地服务未启动，先执行 `config/packages.json` 中对应包的 `startCommand` 启动
- gant-create-test 会自动处理菜单导航和登录态
- 返回复现结果后继续分析

---

## Step 4: 方案确认 ⏸️ (第一个确认点)

**必须等待用户确认方案和代码修改后才能继续！**

### 输出格式

```markdown
## 问题分析与修复方案

### 问题概述
- **来源**: 云效 #{id} / 用户描述
- **包名**: {pkg}
- **模块**: {module_path}
- **问题类型**: Bug / 需求修改 / 样式问题

### 根因分析 / 需求影响分析
{详细分析}

### 功能清单文档状态
- 文档路径: {docs_path}
- 文档状态: 已存在 ✅ / 需新建 ⚠️
- 受影响文档: {列出需要更新的 .md 文件}

### 修复思路
{用文字描述修复的方法和思路}

### 修改文件列表
| 文件 | 修改类型 | 说明 |
|-----|---------|------|
| `代码路径/file.tsx` | 修改 | {代码修改说明} |
| `文档路径/main.md` | 更新 | {文档更新说明} |

### 具体代码修改

**文件**: `path/to/file.tsx`
**位置**: 第 {line} 行

```diff
- 原代码
+ 新代码
```

### 文档修改计划
{说明哪些功能描述需要更新，如何更新}

### 影响范围
- 影响模块: {modules}
- 影响功能: {features}（参考功能清单文档）
- 风险等级: 低/中/高

---
请确认以上修复方案和代码修改是否正确？
```

### 使用 AskUserQuestion 确认

```typescript
AskUserQuestion({
  questions: [{
    question: "是否确认以上修复方案和代码修改？",
    header: "方案确认",
    options: [
      { label: "确认方案", description: "方案正确，执行修改并验证" },
      { label: "调整方案", description: "方案有问题，需要重新分析" },
      { label: "取消修复", description: "不执行任何修改" }
    ],
    multiSelect: false
  }]
})
```

---

## Step 5: 执行修改与验证 ⏸️ (第二个确认点)

**执行代码修改、质量检查、浏览器验证和文档同步，等待用户确认后自动提交！**

### 5a: 执行代码修改

使用 Edit 工具修改代码：

```bash
Edit(file_path, old_string, new_string)
```

### 5b: 代码质量检查

使用 `code-detection-toolbox` 对修改的文件进行代码质量检测：

```bash
# 代码质量检测（对每个修改的文件执行）
node .qoder/skills/code-detection-toolbox/index.js {modified_file_path} --profile=business
```

### 5c: 委托 gant-create-test 验证修复效果

**调用 `gant-create-test` skill 的模式一（只测试）**，描述如下：

- 目标：验证修复效果
- 页面：同 Step 3
- 操作步骤：原问题的复现步骤
- 期望返回：问题是否已修复、修复后截图、是否还有其他异常

### 5d: 调用 gant-feature-docs 同步更新文档

**调用 `gant-feature-docs` skill 的模式 C（更新文档）**，描述如下：

- 代码目录：修改涉及的代码目录
- 变更说明：本次修改了哪些功能

仅重写受影响的 `.md` 文件，不做整目录全量重写。

**跳过条件**：如果修改不涉及功能变更（纯性能优化、样式微调等不影响用户可见功能的修改），可跳过此步骤，并在验证报告中说明跳过原因。

### 输出验证结果

```markdown
## 修改验证结果

### 代码修改
| 文件 | 状态 |
|-----|------|
| `代码路径/file.tsx` | ✅ 已修改 |

### 代码检查
- TypeScript: ✅ 通过 / ❌ 有错误
- Lint: ✅ 通过 / ⚠️ 有警告
- 代码质量: {score} 分 ({grade})

### 功能验证（gant-create-test）
- 问题复现: ✅ 问题已修复 / ❌ 问题仍存在

### 文档同步
| 文档文件 | 状态 | 说明 |
|---------|------|------|
| `docs/xxx/main.md` | ✅ 已更新 | {更新内容} |
| 跳过 | - | 纯样式修改，不影响功能描述 |

---
请确认验证结果是否通过？确认后将自动提交代码。
```

### 使用 AskUserQuestion 确认验证结果

```typescript
AskUserQuestion({
  questions: [{
    question: "验证结果是否通过？确认后将自动提交代码。",
    header: "验证确认",
    options: [
      { label: "确认通过", description: "验证通过，自动提交代码" },
      { label: "需要调整", description: "验证不通过，需要重新修改" },
      { label: "取消修复", description: "回滚修改，不提交" }
    ],
    multiSelect: false
  }]
})
```

---

## Step 6: 提交与收尾 (自动执行)

**用户确认验证通过后，以下步骤自动执行，无需再次确认！**

### 6a: 提交代码变更

```bash
# 提交代码
git add .
git commit -m "fix: {问题简述}"

# 推送到远程分支
git push origin {当前分支名}
```

### 6b: 更新云效工作项（条件执行）

**仅当问题来源为云效时执行：**

```bash
# 更新工作项状态为"已修复"
mcp__yunxiao_2__update_work_item(organizationId, workItemId, { status: "已修复" })

# 添加解决说明（文字描述，不含代码）
mcp__yunxiao_2__create_work_item_comment(organizationId, workItemId, content)
```

云效解决说明模板：
```markdown
## 问题解决说明

### 问题原因
{问题根因的文字描述}

### 解决思路
{修复方法的文字描述，不包含具体代码}

### 修改范围
- 修改文件: {file_list}
- 影响模块: {modules}

### 文档同步
- 功能清单文档: ✅ 已同步更新 / ⚠️ 不涉及功能变更
```

### 输出完成报告

```markdown
## 修复完成报告

### 代码提交
- 提交信息: fix: {问题简述}
- 提交状态: ✅ 已提交

### 云效状态（如适用）
- 工作项状态: ✅ 已更新为"已修复"
- 解决说明: ✅ 已添加

### 文档同步
- 功能清单文档: ✅ 已同步更新
- 更新文件数: {count}
```

---

## MCP 工具清单

### 云效 MCP（可选，问题获取与状态更新）

| 工具 | 用途 |
|-----|------|
| `mcp__yunxiao_2__get_work_item` | 获取工作项详情 |
| `mcp__yunxiao_2__list_work_item_comments` | 获取工作项评论 |
| `mcp__yunxiao_2__search_workitems` | 搜索工作项 |
| `mcp__yunxiao_2__update_work_item` | 更新工作项状态 |
| `mcp__yunxiao_2__create_work_item_comment` | 添加修复备注 |

### 委托的 Skill

| Skill | 使用模式 | 调用时机 | 调用方式 |
|-------|---------|---------|---------|
| `gant-feature-docs` | 模式 B（读取） | Step 2b：查询功能清单文档 | 通过 Skill tool 调用，args 传入路径和模式 |
| `gant-feature-docs` | 模式 A（生成） | Step 2b：文档不存在时先创建 | 通过 Skill tool 调用，args 传入路径和模式 |
| `gant-feature-docs` | 模式 C（更新） | Step 5d：代码修改后同步更新文档 | 通过 Skill tool 调用，args 传入路径和变更说明 |
| `gant-create-test` | 模式一（只测试） | Step 3 / 5c：浏览器验证 | 通过 Skill tool 调用，args 传入测试目标和操作步骤 |
| `code-detection-toolbox` | 命令行调用 | Step 5b：代码质量检测 | 直接调用 Skill tool |

### 代码分析工具

| 工具 | 用途 |
|-----|------|
| `Glob` | 搜索文件 |
| `Grep` | 搜索代码内容 |
| `Read` | 读取文件 |
| `Edit` | 修改文件 |
| `Bash` | 执行命令 |

---

## 条件分支汇总

| 条件 | 分支 |
|------|------|
| Step 2 已明确定位原因 | 跳过 Step 3，直接进入 Step 4 |
| Step 2 无法定位原因 | 执行 Step 3 浏览器复现 |
| 功能清单文档已存在 | 直接读取（gant-feature-docs 模式 B） |
| 功能清单文档不存在 | 先创建（gant-feature-docs 模式 A），再继续分析 |
| 修改不涉及功能变更（纯性能/样式） | 跳过 5d 文档更新步骤，在验证报告中说明 |
| 问题来源非云效 | 跳过 6b 云效状态更新 |
| 修改涉及 procomponents 框架代码 | 提示用户确认是否继续（框架代码不在业务文档覆盖范围内） |

---

## 执行要求

### 必须行为

```
✅ 修改代码时必须同步更新功能清单文档（核心原则）
✅ 无功能清单文档时必须先调用 gant-feature-docs 创建，再继续修改
✅ Step 3 仅在 Step 2 无法确定原因时执行
✅ Step 3/5c 浏览器验证必须委托 gant-create-test，不自建浏览器流程
✅ 方案确认必须同时展示代码修改 + 文档修改计划
✅ 修改后必须使用 code-detection-toolbox 进行代码质量检查
✅ Step 6 用户确认验证通过后自动执行提交，无需再次确认
✅ 从 config/packages.json 配置表读取包信息，不硬编码端口和路径
✅ 代码修改遵守全局规则（tr 国际化、procomponents 交互方法、CSS-in-JS 样式规范）
✅ 云效解决说明必须是文字描述，不含代码
```

### 禁止行为

```
❌ 修改代码但不更新功能清单文档
❌ 功能清单文档不存在时跳过文档步骤
❌ 在方案确认前修改任何文件
❌ 跳过代码质量检查
❌ 验证通过后还请求确认才提交
❌ 编造问题分析结果
❌ 忽略用户的调整请求
❌ 在云效解决说明中包含代码
❌ Step 2 已分析出原因时仍强制执行 Step 3
```

---

## 错误处理

| 场景 | 处理方式 |
|-----|---------|
| 包名无法识别 | 提示用户从配置表中选择 |
| 云效工作项不存在 | 提示用户确认 ID 或改用问题描述 |
| 代码无法定位 | 请求用户提供更多信息或文件路径 |
| 功能清单文档不存在 | 自动调用 gant-feature-docs 模式 A 创建 |
| gant-create-test 本地服务未启动 | 从 packages.json 读取 startCommand 启动；启动命令执行后等待最长30秒确认服务就绪 |
| 代码质量检查失败 | 展示错误信息，进入调整循环 |
| 修复后测试仍失败 | 回到 Step 5a 重新修改，最多重试3轮；3轮后仍失败则提示用户人工介入 |
| 验证不通过需回滚代码 | 使用 `git checkout -- {modified_file}` 撤销单个文件修改，或 `git stash` 暂存所有修改后重新开始 |
| 文档更新失败 | 展示错误，允许用户手动更新 |
| Git 提交失败 | 提示用户检查 git 状态 |
| 云效状态更新失败 | 提示用户手动更新 |

---

## 进阶参考

- [config/packages.json](./config/packages.json) - 包配置表
- [references/common-bugs.md](./references/common-bugs.md) - 通用问题类型与定位策略
- [references/code-modification-rules.md](./references/code-modification-rules.md) - 代码修改规范摘要
- [templates/analysis-report.md](./templates/analysis-report.md) - 方案确认报告模板
- [templates/verification-report.md](./templates/verification-report.md) - 验证结果报告模板
- [templates/completion-report.md](./templates/completion-report.md) - 完成报告模板
