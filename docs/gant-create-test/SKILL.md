---
name: gant-create-test
description: 对指定目标进行交互式测试，产出测试报告、E2E 测试脚本和脚本文档。利用长期登录态和菜单导航到达目标页面，在浏览器中实际操作验证功能；测试过程同步生成结构化报告；可将验证通过的操作转化为可执行 TypeScript 脚本并生成对应文档。触发词：生成测试脚本、创建测试、gant-create-test、测试脚本、E2E测试、功能测试脚本、交互式测试、测试功能、测试报告。
---

# Gant Create Test

**三大产物**：
1. **测试报告** — 每次测试必产出，测试过程中实时记录，测试结束后输出
2. **测试脚本** — 根据功能复杂度生成 1 个或多个 `.ts` 文件
3. **脚本文档** — 每个脚本文件对应一个 `.md` 说明文档

产物 1 始终产出；产物 2 和 3 在脚本模式下产出（三者同时产出）。

## 使用模式

### 模式一：测试 + 报告

用户验证功能，产出测试报告。如"测试 ECR 查询功能"。

| Step | 操作 | 输出 |
|------|------|------|
| T1 | 确定目标 | 目标页面 path 标识 + 功能清单（如有） |
| T2 | 加载登录态 | storage-state 恢复登录，验证登录有效性 |
| T3 | 菜单导航 | 导航到目标页面（API + 本地路由匹配） |
| T4 | 交互验证 ⏸️ | 逐项执行操作并验证结果，**实时记录到报告** |
| T5 | 输出报告 | `ai-harness-root/test/reports/{page-slug}-{timestamp}.md` |

**T4 实时记录**：每步操作后立即将结果（通过/失败/跳过 + 截图路径）追加到报告数据结构，测试结束即可输出完整报告。

**T4 重试规则**：单步操作失败后修正定位/操作重试，最多 **3次**。3次仍失败则标记该步为"失败"并继续下一步，不阻塞整体流程。

**T4 检查点**：涉及写操作（新增/编辑/删除）前，告知用户将执行的操作和预期影响，确认后执行。

### 模式二：测试 + 报告 + 脚本 + 文档（完整产出）

用户需要生成测试脚本。测试过程同步产出全部 3 个产物。

| Step | 操作 | 输出 |
|------|------|------|
| G1 | 确定目标 | 同模式一 T1 |
| G2 | 加载登录态 + 菜单导航 | 同模式一 T2-T3 |
| G3 | 分析范围 ⏸️ | 脚本拆分方案（文件列表） |
| G4 | 交互验证循环 | 验证通过的操作 → runner 代码，**实时记录报告** |
| G5 | 输出脚本文件 | `ai-harness-root/test/e2e-scripts/{page-slug}/` 下的 `.ts` 文件 |
| G6 | 输出脚本文档 | 每个 `.ts` 对应的 `.md` 说明文档 |
| G7 | 输出测试报告 | `ai-harness-root/test/reports/{page-slug}-{timestamp}.md` |

**G3 脚本拆分标准**：

| 功能复杂度 | 判断依据 | 拆分方式 | 示例 |
|-----------|---------|---------|------|
| 简单 | 仅查询+表格查看 | 1个脚本 | `ecr-search-query.ts` |
| 中等 | 查询 + 1-2种写操作 | 2-3个脚本，按操作类型拆分 | `ecr-search-query.ts` + `ecr-grid-actions.ts` |
| 复杂 | 查询 + 多种写操作 + 弹窗 | 按功能区域拆分，每个脚本聚焦一个区域 | `ecr-search-query.ts` + `ecr-grid-actions.ts` + `ecr-modal-edit.ts` |

**G3 检查点**：展示拆分方案（文件名+覆盖范围），用户确认后再进入验证循环。

**G4 重试规则**：同模式一 T4（单步最多3次重试）。

---

## 核心一：测试

### 目标来源

| 来源 | 说明 | 优先级 |
|------|------|--------|
| 功能清单文档 | 调用 `gant-feature-docs` skill 读取 | 最高 |
| 菜单路径 | 动态 API + 本地路由自动解析 | - |
| 用户描述 | 如"测试 ECR 新增流程" | - |

### 菜单导航（动态）

导航不再依赖静态配置文件，而是通过 API + 本地路由文件动态解析：

**三步导航流程**：

```
Step 1: 解析目标 → 确定目标页面的 path 标识（如 "ecr"、"eco"）
Step 2: 获取菜单树 → 调用 /security/findUserAggregateInfo → startMenus
Step 3: 构建导航链 → 在 startMenus 中找到目标 → 递归 parentResourceId 构建完整路径 → 按 name 依次点击
```

**Step 1：确定目标 path**

用户可能给出：
- 菜单中文名（如"工程变更申请"）→ 在 startMenus 中按 `name` 查找 → 取其 `path`
- 英文标识（如"ecr"）→ 直接用作 `path` 匹配
- 路由路径（如"/ecr/detail"）→ 截取第一段作为 `path`

**Step 2：获取 startMenus**

调用 API `GET /security/findUserAggregateInfo`，响应中 `startMenus` 为扁平数组，每个元素：

| 字段 | 说明 | 示例 |
|------|------|------|
| `id` | 唯一标识 | `"1779422395544_71"` |
| `parentResourceId` | 父菜单 ID，顶级为 `"ROOT"` | `"1779422395544_70"` |
| `path` | 路由段标识 | `"ecr"` |
| `name` | 中文显示名 | `"工程变更申请"` |
| `type` | REACTMENU_CATEGORY=目录, REACTMENU_CATEGORY_ITEM=页面 | - |
| `seqNum` | 排序号 | - |
| `leaf` | 是否叶子节点 | - |

**Step 3：构建导航链并点击**

1. 按 `path` 在 startMenus 中找到目标菜单项
2. 通过 `parentResourceId` 递归向上查找，构建完整导航链：`[ROOT → 一级目录 → 二级目录 → ... → 目标页面]`
3. 按层级顺序，依次在浏览器侧边栏中点击每层的 `name` 文本

**示例**：导航到"工程变更申请"(path=ecr)
```
startMenus 找到 ecr → parentResourceId 指向 "变更管理" → parentResourceId 指向 "产品工程" → parentResourceId 为 ROOT
导航链: ["产品工程", "变更管理", "工程变更申请"]
依次点击侧边栏: 产品工程 → 变更管理 → 工程变更申请
```

**注意**：
- 详情页不在 startMenus 中（它们是列表页的子路由），导航到列表页后点击行即可进入详情
- 如果用户指定的目标含"详情"二字，先导航到对应列表页，再点击首行进入

### 本地路由匹配

导航完成后需要获取 `namespace`、`codePath`、`docPath` 等信息时，读取本地路由文件：

**路由文件位置**：`packages/{project}/src/.gant/routes/maps.ts`

**匹配方式**：按 `path` 字段匹配（使用 `/**/` 通配符前缀），如 `path: '/**/ecr'` 匹配 path 标识 `ecr`

**关键字段提取**：

| maps.ts 字段 | 用途 | 示例 |
|-------------|------|------|
| `component` | 推导 codePath：`@moduleName/pageName` → `packages/{project}/src/pages/{pageName}/` | `@ebom/ecr` → `packages/ibom/src/pages/ecr/` |
| `parentId` | 判断页面层级关系（详情页的 parentId 指向列表页） | - |
| `title` / `name` | 页面中文名 | - |

**候选数据**：从 [config/candidates.json](config/candidates.json) 获取，按业务模块组织的稳定数据，详见下方"稳定数据"章节。

### 稳定数据

选择器中存在大量无效/过期数据，直接选择可能查无结果。[config/candidates.json](config/candidates.json) 按业务模块维护经过验证的稳定数据，测试时优先使用。

**结构**：`{ 模块名: { 数据类型: [{code, name}, ...] } }`

| 模块 | 数据类型 | 说明 |
|------|---------|------|
| ibom | 产品、产品大类、工厂、零件、人员 | 变更/BOM 核心筛选维度 |
| icost | 产品、工厂、零件、供应商、人员 | 成本管理核心筛选维度 |

**用法**：选择器操作时从 `candidates[当前模块][对应类型]` 取值，顺序尝试至有效数据。

### 交互验证

每步在浏览器中实际执行并验证，失败则修正重试：

- `browser_snapshot` → 查看页面状态
- `browser_click` / `browser_type` → 执行操作
- `browser_snapshot` / `aiAssert` → 确认结果
- 失败 → 修正定位/操作 → 重新尝试

---

## 产物一：测试报告

> 两种模式都产出，是测试的必产出物。

### 产出时机

测试过程中**实时记录**每步结果，测试结束后一次性输出报告文件。

### 报告路径

```
ai-harness-root/test/reports/{page-slug}-{YYYYMMDD-HHmmss}.md
```

### 报告结构

参考 [templates/report-template.md](templates/report-template.md)，核心包含：

| 章节 | 内容 |
|------|------|
| 概要 | 页面名称、测试时间、总用例数、通过/失败/跳过数、通过率 |
| 环境信息 | 环境地址、浏览器版本、登录用户 |
| 测试明细 | 每个步骤的：序号、描述、操作、预期结果、实际结果、状态(✅/❌/⏭️)、截图、耗时 |
| Blocker 清单 | 测试中发现的所有阻塞项（数据缺失、功能不可用等） |
| 失败分析 | 失败步骤的根因分析和修复建议 |

### 实时记录规则

测试执行时，在内存中维护一个报告数据结构，每步操作后立即追加：

```
步骤执行 → 记录 { 序号, 描述, 状态, 截图路径, 耗时, 备注 }
  ↓
全部完成 → 汇总统计 → 输出 .md 报告文件
```

---

## 产物二：测试脚本

> 仅模式二产出。

### 脚本目录结构

```
ai-harness-root/test/e2e-scripts/
└── {page-slug}/
    ├── {page-slug}.spec.ts          # 入口（仅 import）
    ├── {page-slug}-search-query.ts  # 查询相关脚本
    ├── {page-slug}-grid-actions.ts  # 表格操作脚本
    └── {page-slug}-modal-edit.ts    # 弹窗操作脚本
```

### 脚本模板

[templates/test-template.ts](templates/test-template.ts)，核心：

```typescript
import { createTest } from '@gantTest';
const test = createTest('场景描述', {
  tags: ['录制回放', '标签'],
  severity: 'normal',
  namespace: 'namespace',
  pageName: '页面名称',
});
test.run(async ({ page, runner, context, expect }) => {
  // 验证通过的步骤代码
});
```

### 必用模式

**查询前置** — 确保后续操作有数据（从 candidates.json[当前模块] 取稳定数据填入选择器；无数据则 `console.info` 只覆盖空态）

**浮层操作** — 打开浮层 → 浮层内定位（限定范围）→ 操作 → 关闭浮层

**写操作安全** — 新增后删除 > 编辑后恢复 > 关联后取消 > 确认前取消；禁止全选删除/批量删除

**动态状态** — 不硬断言，用条件分支 + `console.info`；`aiAssert` 只断言可观察内容

---

## 产物三：脚本文档

> 仅模式二产出，每个脚本文件对应一个 `.md` 文档。

### 文档路径

```
ai-harness-root/test/e2e-scripts/{page-slug}/
├── {page-slug}-search-query.ts   # 脚本
├── {page-slug}-search-query.md   # 对应文档
├── {page-slug}-grid-actions.ts
└── {page-slug}-grid-actions.md
```

### 文档结构

参考 [templates/script-doc-template.md](templates/script-doc-template.md)，核心包含：

| 章节 | 内容 |
|------|------|
| 概述 | 脚本名称、文件路径、覆盖功能区域、严重程度 |
| 前置条件 | 登录态要求、数据依赖、页面状态要求 |
| 测试步骤 | 逐步描述：步骤序号、操作描述、预期结果、涉及字段/组件 |
| 稳定数据 | 使用的 candidates.json 数据清单 |
| 注意事项 | 特殊处理逻辑、已知限制、环境差异说明 |

### 文档生成时机

在 G5 脚本文件写入后，**立即**为每个脚本生成对应 `.md` 文档（G6），不延后。

---

## 辅助参考

> 测试和生成脚本时必须遵守的规范，详细内容见参考文件。

### Runner 使用规范

所有操作通过 `runner` 执行，`desc` 同时作为 Allure 步骤描述和 AI 兜底提示词。元素操作方法内置等待，无需手动调用等待方法。

**`aiWaitFor` 谨慎使用**：耗时操作（最多 15s），仅用于非网络驱动的异步场景（如轮询结果），大多数场景无需使用。

**禁止使用**：`navigateTo`、`clickAndWait`、`fillAndWait`、`page.goto`

- **详细 API**：[references/runner-api.md](references/runner-api.md)

### 定位规范

- **data-file-id 优先**：`searchForm.locator('[data-file-id="fieldName"]')`，不用文本标签
- **desc 写法**：必须写成可执行的人类动作描述（如 `'销售产品下拉选择器，从推荐文本 S50、四方桌 中选择'`，不能是 `'点击'`）
- **Playwright 边界**：允许定位查询（`page.locator`、`expect().toBeVisible`）和等待方法（`page.waitForSelector`、`page.waitForLoadState`、`page.waitForResponse`、`locator.waitFor`），禁止操作（`locator.click()` → 用 `runner.click()`）

- **组件定位速查**：[references/component-locators.md](references/component-locators.md)

### 配置文件

- **认证**：[config/auth.json](config/auth.json) — 长期 storage-state 路径 + 多环境 + 登录凭据
- **稳定数据**：[config/candidates.json](config/candidates.json) — 按业务模块组织（ibom/icost/...），每类维护 [{code, name}] 候选值

## 错误处理

| 场景 | 处理方式 |
|-----|--------|
| 登录态过期/无效 | 重新加载 storage-state；仍失败则标记为 Blocker 写入报告，提示用户检查 auth.json |
| 菜单导航失败 | 用本地路由 maps.ts 兜底：直接通过 URL 路径导航；兜底失败标记 Blocker |
| API 请求失败 | 检查本地服务是否启动；未启动则先启动；仍失败标记 Blocker |
| 选择器数据无效 | 顺序尝试下一个候选值；全部失败则标记 ⏭️ 跳过 + Blocker，不阻塞 |
| 单步操作3次重试仍失败 | 标记 ❌ 失败，继续下一步；在报告中汇总所有失败项 |
| 页面加载超时 | 等待最长10秒；超时刷新重试1次；仍失败标记 ❌ |
| 目标页面无数据 | 执行查询前置，仍无数据标记 ⏭️ 空态 + Blocker |
| 文件写入失败 | 检查目录权限重试1次；仍失败将内容输出到终端 |
