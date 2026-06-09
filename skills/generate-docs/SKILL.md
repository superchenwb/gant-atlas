---
name: gant-atlas-generate
description: 从源代码生成完整的 feature-doc Markdown 文件，严格遵循内置 prompts/ 规范
argument-hint: ["[project-id] [--module <module>] [--page <pageId>] [--full]"]
---

# /gant-atlas-generate

从源代码语义扫描生成完整的 feature-doc Markdown 文件。

本技能结合确定性代码扫描（路由、schema、API、按钮、Hook）与子 Agent 写作，产出严格遵循内置 `prompts/` 规范的 `feature-docs/<module>/<page>/*.md`。

## 选项

`$ARGUMENTS` 可包含：

- `project-id` — 全局 `projects.json` 中配置的项目标识
- `--module <module>` — 只生成该模块下的页面
- `--page <pageId>` — 只生成单个页面（格式：`module/pageName`）
- `--full` — 强制全量重建，忽略增量哈希

## 进度报告

每个阶段报告进度：

> `[阶段 0/7] 解析项目配置与规范...`
> `[阶段 1/7] 从路由扫描页面...`
> `[阶段 1.5/7] 过滤未变更页面...`
> `[阶段 2/7] 提取页面上下文（第 N/M 页）...`
> `[阶段 3/7] 通过子 Agent 写入 Markdown（第 N/B 批）...`
> `[阶段 4/7] 合并生成的文档...`
> `[阶段 5/7] 审阅输出...`
> `[阶段 6/7] 保存元数据与报告...`

---

## 阶段 0 — 预检

### 0.1 解析插件根目录

技能文件位于 gant-atlas 仓库内。依次尝试以下候选：

```bash
PLUGIN_ROOT=""
for candidate in \
  "${GANT_ATLAS_PLUGIN_ROOT}" \
  "$HOME/gant-atlas" \
  "$HOME/.gant-atlas/plugin" \
  "$(dirname $(realpath ~/.claude/skills/gant-atlas-generate 2>/dev/null))/../../..";
do
  if [ -n "$candidate" ] && [ -f "$candidate/package.json" ] && [ -d "$candidate/skills/generate-docs" ]; then
    PLUGIN_ROOT="$candidate"
    break
  fi
done
```

### 0.2 确保编译产物存在

```bash
if [ ! -f "$PLUGIN_ROOT/dist/code-scanner.js" ] || [ ! -f "$PLUGIN_ROOT/dist/generator/context.js" ]; then
  cd "$PLUGIN_ROOT" && pnpm install --frozen-lockfile && pnpm run build
fi
```

### 0.3 解析项目配置

读取 `~/.gant-atlas/projects.json`，匹配第一个非 flag 参数。
必填字段：`id`、`docsPath`。可选：`codeDir`、`routesFile`。

如未提供 project id，报错："请提供 project id。"

### 0.4 确定规范根目录

规范目录位于技能内部的 `prompts/` 下（自包含，不依赖外部 docs）：

```bash
SPEC_ROOT="$PLUGIN_ROOT/skills/generate-docs/prompts"
```

关键文件路径（后续各阶段引用）：
- 页面类型检测：`$SPEC_ROOT/reference/page-type-detection.md`
- 主页面规范：`$SPEC_ROOT/reference/page-main-spec.md`
- 详情页规范：`$SPEC_ROOT/reference/page-detail-spec.md`
- 输出生成规范：`$SPEC_ROOT/reference/output-generation.md`
- 主页面模板：`$SPEC_ROOT/templates/page-main/`
- 详情页模板：`$SPEC_ROOT/templates/page-detail/`
- 通用模板：`$SPEC_ROOT/templates/common/`

### 0.5 创建中间目录

```bash
PROJECT_ROOT=$(dirname "$docsPath")
mkdir -p "$PROJECT_ROOT/.gant-atlas/intermediate/generate"
mkdir -p "$PROJECT_ROOT/.gant-atlas/tmp"
```

存储路径：
- `$INTERMEDIATE = $PROJECT_ROOT/.gant-atlas/intermediate/generate`
- `$TMP = $PROJECT_ROOT/.gant-atlas/tmp`
- `$META = $PROJECT_ROOT/.gant-atlas/generate-meta.json`（持久化，跨运行保留）

---

## 阶段 1 — 扫描页面

报告：`[阶段 1/7] 从路由扫描页面...`

运行打包的扫描器：

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/scan-pages.mjs" \
  "$codeDir" \
  "$routesFile" \
  "$INTERMEDIATE/pages.json"
```

读取 `$INTERMEDIATE/pages.json`。

如指定了 `--module`，过滤到该模块。
如指定了 `--page`，只保留该页面。
如无剩余页面，报错并停止。

存储过滤后的列表为 `$PAGES`。

---

## 阶段 1.5 — 增量过滤

报告：`[阶段 1.5/7] 过滤未变更页面...`

本阶段通过比较源码哈希与上次生成元数据，确定哪些页面真正需要重新生成。

**如 `$ARGUMENTS` 包含 `--full`**：跳过本阶段，所有页面进入阶段 2。
报告：`全量重建已请求 — 所有页面将重新生成。`

**否则**：

运行增量过滤器：

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/incremental-filter.mjs" \
  "$INTERMEDIATE/pages.json" \
  "$META" \
  "$INTERMEDIATE/filtered-pages.json" \
  "$INTERMEDIATE/generate-meta-staging.json"
```

该脚本：
1. 读取 `pages.json`（所有发现页面）
2. 读取 `generate-meta.json`（上次生成哈希，可能不存在）
3. 对每个页面，计算 pageDir 下所有 `.ts/.tsx/.js/.jsx` 文件的 SHA-256
4. 比较当前哈希与上次哈希
5. 写入 `filtered-pages.json`（仅变更/新增页面）
6. 写入 `generate-meta-staging.json`（更新后的哈希）

脚本完成后：
- 读取 `$INTERMEDIATE/filtered-pages.json`
- 向用户报告：`N 个页面已变更，M 个页面未变更（已跳过）。`
- 如 0 个页面变更：报告"所有页面已是最新。使用 --full 强制重新生成。"并停止。
- 用过滤后的页面列表替换 `$PAGES`
- 存储 `$META_STAGING = $INTERMEDIATE/generate-meta-staging.json`

---

## 阶段 2 — 提取上下文 + 页面类型检测

报告：`[阶段 2/7] 提取页面上下文...`

对每个页面运行：

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/extract-page-context.mjs" \
  "$codeDir" \
  "$routesFile" \
  "$pageId" \
  "$INTERMEDIATE/context-$pageId.json"
```

**页面类型检测**：`extract-page-context.mjs` 已内置检测逻辑，输出 JSON 中自动包含 `pageType` 字段（`page-main` 或 `page-detail`）。

进度报告：`已提取第 M/N 页上下文：module/pageName (类型: pageType)`

所有上下文提取完成后，构建批次计划。

默认批次大小：**每子 Agent 5 个页面**。
总页面数 ≤ 5 时，单批次处理。

写入 `$INTERMEDIATE/batches.json`：

```json
{
  "schemaVersion": 1,
  "totalPages": 12,
  "batchSize": 5,
  "batches": [
    { "batchIndex": 1, "pageIds": ["ibom/pageA", "ibom/pageB", ...] }
  ]
}
```

---

## 阶段 3 — 写入 Markdown（子 Agent 调度）

报告：`[阶段 3/7] 通过子 Agent 写入 Markdown...`

加载 `$INTERMEDIATE/batches.json`，遍历批次。

每个批次最多 **3 个子 Agent 并发**（保守策略，避免 token 激增）。

### 子 Agent 调度模板

对每个批次，使用 `agents/page-writer.md` 调度子 Agent。

调度 Prompt 模板：

```
为以下页面生成 feature-doc Markdown 文件。

项目根目录：$PROJECT_ROOT
文档输出路径：$docsPath
规范根目录：$SPEC_ROOT

页面列表（含完整上下文）：

{for each page in batch}
---
页面 #{index}: {pageId}
页面类型：{pageType}  ← page-main 或 page-detail
上下文文件：$INTERMEDIATE/context-{pageId}.json

模板文件（根据 pageType）：
- page-main:
  - 主文档模板：$SPEC_ROOT/templates/page-main/main.md
  - 查询区模板：$SPEC_ROOT/templates/page-main/search-area.md
  - 按钮区模板：$SPEC_ROOT/templates/page-main/button-area.md
  - 表格区模板：$SPEC_ROOT/templates/page-main/grid-area.md
  - 其他功能模板：$SPEC_ROOT/templates/page-main/other-features.md
- page-detail:
  - 主文档模板：$SPEC_ROOT/templates/page-detail/main.md
  - 头部按钮模板：$SPEC_ROOT/templates/page-detail/header-buttons.md
  - 基本信息页签模板：$SPEC_ROOT/templates/page-detail/base-info-tab.md
  - 子页签模板：$SPEC_ROOT/templates/page-detail/sub-tab.md
- 通用模板（如需要）：
  - 弹窗模板：$SPEC_ROOT/templates/common/popup.md
  - 复杂按钮模板：$SPEC_ROOT/templates/common/button-function.md

规范文件：
- 页面规范：$SPEC_ROOT/reference/{pageType === 'page-main' ? 'page-main-spec.md' : 'page-detail-spec.md'}
- 输出生成规范：$SPEC_ROOT/reference/output-generation.md

要求：
1. 读取该页面的上下文 JSON 文件。
2. 根据 pageType 读取对应的模板文件。
3. 读取对应的规范文件（page-main-spec.md 或 page-detail-spec.md）和 output-generation.md。
4. 严格遵循模板格式和规范要求生成 Markdown。
5. 为每个页面在 $docsPath/<module>/<pageName>/ 下写入（按 pageType）：
   - page-main: main.md（必须）、search-area.md（如有搜索字段）、grid-area.md（如有表格列）、button-area.md（如有按钮）、api-area.md（如有 API）
   - page-detail: main.md（必须）、header-buttons.md（如有按钮）、base-info-tab.md（如有基本信息）、sub-tab-{name}.md（如有子页签）、api-area.md（如有 API）
6. 不编造上下文中不存在的字段或 API。
7. 不确定时写 [待确认]。
8. 返回 JSON 摘要：pagesWritten 和 warnings。
{end for}
```

等待所有子 Agent 完成。收集其 JSON 摘要。

如子 Agent 失败，用相同上下文重试一次。如再次失败，记录警告并继续；部分输出优于无输出。

---

## 阶段 4 — 合并文档

报告：`[阶段 4/7] 合并生成的文档...`

运行合并脚本：

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/merge-docs.mjs" \
  "$INTERMEDIATE/docs" \
  "$docsPath"
```

将中间 Markdown 文件复制到最终的 `feature-docs/` 目录树。

---

## 阶段 5 — 审阅

报告：`[阶段 5/7] 审阅输出...`

使用 `agents/reviewer.md` 调度子 Agent。

传递：
- `projectRoot`
- `docsPath`
- `pageIds` = `$PAGES` 中的所有页面
- `specRoot` = `$SPEC_ROOT`

审阅者读取生成的 Markdown，对照 `$SPEC_ROOT/reference/` 下的规范文件检查：
1. 是否遵循了对应模板格式
2. 是否有遗漏的章节（如页面结构图、全页面功能索引、状态差异矩阵）
3. 表格列数是否符合规范要求
4. 是否有 `[待确认]` 内容需要关注

将审阅结果存储到 `$INTERMEDIATE/review.json`。

---

## 阶段 6 — 保存与报告

报告：`[阶段 6/7] 保存元数据与报告...`

### 6.1 更新生成元数据

将暂存元数据提升为持久位置：

```bash
if [ -f "$META_STAGING" ]; then
  cp "$META_STAGING" "$META"
fi
```

标记所有成功生成的页面：

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/update-generate-meta.mjs" \
  "$META" \
  successfulPageId1 successfulPageId2 ...
```

### 6.2 写入生成报告

写入摘要到 `$INTERMEDIATE/generation-report.json`：

```json
{
  "generatedAt": "2026-06-09T...",
  "totalPagesScanned": 50,
  "pagesChanged": 12,
  "pagesSkipped": 38,
  "successfulPages": ["..."],
  "failedPages": ["..."],
  "warnings": ["..."],
  "docsPath": "..."
}
```

### 6.3 向用户输出最终摘要

- 扫描页面总数 vs 变更数 vs 跳过数
- 成功数 vs 失败数
- `feature-docs/` 路径
- 审阅报告路径
- 审阅者发现的任何警告

### 6.4 可选：同步知识图谱

如项目配置包含 `dbPath`，可运行：

```bash
pnpm exec gant-atlas ingest --docsPath "$docsPath" --db "$dbPath"
```

保持 SQLite 知识图谱与新文档同步。

---

## 错误处理

- `scan-pages.mjs` 非零退出 → 报告 stderr 并停止。
- `incremental-filter.mjs` 非零退出 → 视为全量重建（防御性回退）。
- `extract-page-context.mjs` 某个页面失败 → 跳过该页面并记录警告。
- `page-writer` 子 Agent 连续两次失败 → 跳过该批次并记录警告。
- **绝不静默丢弃错误**。每个警告都出现在最终报告中。
- **始终保存部分结果**。部分生成优于无生成。
- **始终更新成功页面的元数据**，即使部分页面失败。

---

## 示例调用

```
/gant-atlas-generate demo
/gant-atlas-generate demo --module ibom
/gant-atlas-generate demo --page ibom/dataAuthGroup
/gant-atlas-generate demo --full
```
