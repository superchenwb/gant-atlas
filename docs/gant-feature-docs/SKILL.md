---
name: gant-feature-docs
description: 生成、读取和更新 Gant 项目功能文档。支持页面文档（主页面/详情页）、组件文档、方法文档（hooks/utils）三种类型。适用于：根据需求文档或 React 前端代码生成功能文档、按路径读取对应文档辅助页面开发或修复问题、在功能变更或 bug 修复后同步更新文档。触发词包括：生成功能文档、页面功能文档、组件文档、方法文档、hook文档、utils文档、提取页面功能、根据代码生成文档、根据需求生成文档、读取页面文档、参考页面文档、按页面路径读取文档、先读文档再开发、先读文档再修 bug、更新页面文档、同步页面文档、回写页面文档、修改页面文档、修 bug 后更新文档、功能变更后同步文档。
---

# Gant Feature Docs

负责 `packages/*/src/**` 下的业务页面、组件、Hooks 和工具函数对应的功能文档生成、读取和更新。

## 核心原则

1. 支持三种文档类型：页面文档（主页面/详情页）、组件文档、方法文档（hooks/utils）。
2. 文档路径必须和代码路径一一对应。
3. 文档只写功能事实，不写源码引用、Hook 名称、组件注册路径或"详见代码"。
4. 更新文档时只重写受影响文件，按完整文件内容重写，不输出补丁片段。
5. 页面上每一个可见功能都必须逐项描述完整，不能只写区域概述或功能汇总。
6. `main.md` 必须提供全功能索引，方便后续代码生成、修复定位和测试文档消费。
7. 复杂按钮功能优先使用 `button-{name}.md` 一体化描述按钮与其打开的弹窗内容。
8. 组件专属 Hook（位于组件 `hooks/` 子目录下）不独立建档，其功能在组件文档的按钮清单中描述。
9. 引用其他组件时只写文档路径，不描述被引用组件的内部组成。

## 包路径配置

文档统一存放在 `ai-harness-root/docs/` 下，按包名分子目录。代码路径与文档路径的映射规则为：

```
packages/<pkg>/src/xxx  →  ai-harness-root/docs/<pkg>/xxx
```

| 包名 | 代码根目录 | 文档根目录 |
|---|---|---|
| ibom | `packages/ibom/src` | `ai-harness-root/docs/ibom` |
| icost | `packages/icost/src` | `ai-harness-root/docs/icost` |
| procomponents | `packages/procomponents/src` | `ai-harness-root/docs/procomponents` |
| ip2system | `packages/ip2system/src` | `ai-harness-root/docs/ip2system` |
| usersystem | `packages/usersystem/src` | `ai-harness-root/docs/usersystem` |

**默认规则**：未在上表中列出的包，将代码路径中的 `packages/<pkg>/src` 替换为 `ai-harness-root/docs/<pkg>` 即得到文档路径。

> 如需新增或修改包的映射关系，直接编辑本表即可。

## 三模式

### 模式判定优先级

1. 用户意图包含 `更新文档`、`同步文档`、`回写文档`、`修改页面文档` 时，进入 **模式 C：更新文档**。
2. 用户意图包含 `读取文档`、`参考文档`、`先读文档`、`按页面路径读取文档` 时，进入 **模式 B：读取文档**。
3. 其余与功能说明相关的请求，进入 **模式 A：生成文档**。

### 模式 A：生成文档

**适用输入**：代码目录/文件、需求文档/描述文本

| Step | 操作 | 输入 | 输出 |
|------|------|------|------|
| A1 | 判定输入类型 | 用户提供的路径或描述 | `inputType`：代码 / 需求 |
| A2 | 归一到代码目录 | 代码文件→父目录；需求→搜索匹配代码目录 | `codeDir`：代码目录绝对路径 |
| A3 | 映射文档路径 | `codeDir` + 包路径配置表 + 路径规则 | `docsDir`：文档目录绝对路径 |
| A4 | 识别文档类型 | `codeDir` 下的路径特征和代码内容 | `docType`：主页面 / 详情页 / 组件 / Hook / 工具函数 |
| A5 | 读取参考和模板 | `docType` → 对应 reference/*.md + templates/*/ | 参考规范和模板内容 |
| A6 | 读取代码文件 | `codeDir` 下的 `.tsx`/`.ts` 文件 | 代码逻辑理解 |
| A7 | 生成文档 ⏸️ | 参考规范 + 模板 + 代码理解 | 完整文档文件（`.md`） |
| A8 | 自检 | 生成的文档 | 通过/不通过（见自检清单） |

**A2 定位失败时**：存在多个候选路径 → 用 `AskUserQuestion` 列出候选让用户选择；完全找不到 → 提示用户提供更具体的路径。

**A7 生成前确认**：首次为某个目录生成文档时，先告知用户将生成的文档类型和文件列表，确认后再生成。

### 模式 B：读取文档

**适用输入**：页面目录、组件目录、方法文件路径、可定位到唯一代码目录的功能需求

| Step | 操作 | 输入 | 输出 |
|------|------|------|------|
| B1 | 归一到代码目录 | 用户提供的路径或需求 | `codeDir`：代码目录绝对路径 |
| B2 | 映射文档路径 | `codeDir` + 包路径配置表 + 路径规则 | `docsDir`：文档目录绝对路径 |
| B3 | 读取文档 | `docsDir` 下所有 `.md` 文件 | 文档内容 |
| B4 | 输出功能事实摘要 | 文档内容 | 结构化功能事实（不发明文档外的新规则） |

**B3 文档不存在时**：明确说明缺失，建议先执行模式 A 生成，不自行生成。

### 模式 C：更新文档

**适用输入**：已修改代码后的文档同步、功能变更后的文档回写、bug 修复后的文档更新

| Step | 操作 | 输入 | 输出 |
|------|------|------|------|
| C1 | 归一到代码目录 | 变更涉及的代码路径 | `codeDir`：代码目录绝对路径 |
| C2 | 映射文档路径 | `codeDir` + 包路径配置表 + 路径规则 | `docsDir`：文档目录绝对路径 |
| C3 | 读取现有文档和当前代码 | `docsDir` 下的 `.md` + `codeDir` 下的代码 | 文档内容 + 代码当前状态 |
| C4 | 判断受影响文件 ⏸️ | 对比文档内容与代码变更 | 受影响文件列表 + 更新说明 |
| C5 | 重写受影响文件 | 受影响文件列表 + 更新说明 | 按**完整文件内容**重写，不输出补丁格式 |
| C6 | 自检 | 更新后的文档 | 通过/不通过（无遗漏、无代码引用） |

**C4 判断规则**：根据变更类型判断受影响范围——
- 新增/删除功能 → 对应功能描述所在 `.md` 文件
- 修改功能逻辑 → 对应功能描述所在 `.md` 文件
- 纯样式/性能修改 → 通常不影响文档，可跳过
- 修改影响多个区域 → 受影响的所有 `.md` 文件

**C5 重要约束**：只重写受影响的文件，不做整目录全量重写。每个文件按完整内容输出，不输出补丁片段。

## 自检清单

每次生成或更新文档后，必须逐项检查：

| 检查项 | 页面文档 | 组件文档 | 方法文档 |
|--------|---------|---------|---------|
| 文档路径 = ai-harness-root/docs/<pkg>/ + 代码相对路径 | ✅ | ✅ | ✅ |
| 路径层级与代码目录完全镜像 | ✅ | ✅ | ✅ |
| 无源码路径/导入路径/Hook名称/Store名 | ✅ | ✅ | ✅ |
| 无"详见源码""参见某文件" | ✅ | ✅ | ✅ |
| 每个可见功能有单独描述 | ✅ | ✅ | - |
| main.md 已列出全功能索引 | ✅ | ✅ | - |
| Props 接口完整 | - | ✅ | - |
| 复合组件已拆分子文档 | - | ✅ | - |
| 每种交互已描述 | - | ✅ | - |
| 数据流已说明 | - | ✅ | - |
| 参数和返回值完整 | - | - | ✅ |
| 核心功能按功能点分条 | - | - | ✅ |
| 组件专属 Hook 未独立建档 | - | ✅ | ✅ |
| 引用其他组件只写文档路径 | ✅ | ✅ | ✅ |
| 无法确认处标记 `[待确认]` | ✅ | ✅ | ✅ |

## 文档类型识别

根据代码路径特征和代码内容自动判断文档类型：

| 代码路径特征 | 代码内容特征 | 文档类型 |
|---|---|---|
| `hooks/**/*.ts(x)` | 导出以 `use` 开头的函数 | 方法文档（Hook） |
| `utils/**/*.ts(x)` | 导出工具函数 | 方法文档（utils） |
| `components/**/*.tsx` | 无 Grid/SearchForm/多按钮弹窗/编辑表单 | 简单组件文档 |
| `components/**/*.tsx` | 含 Grid 或 SearchForm 或多按钮弹窗或编辑表单 | 复合组件文档 |
| `*/src/**/*.tsx`（页面级） | 含 `SearchForm` + `Grid` | 主页面文档 |
| `*/src/**/*.tsx`（页面级） | 含 `ContextMenu` / `ContextDetailCard` | 详情页文档 |

**自动识别失败时**（路径不明确、代码特征不典型）：向用户询问文档类型，选项为：主页面 / 详情页 / 组件 / Hook / 工具函数。

**用户明确指定类型时**：直接使用用户指定的类型，跳过自动识别。

## 输入识别

### 代码输入

以下输入视为代码输入：

- `packages/*/src/**` 下的目录
- `packages/*/src/**` 下的 `.tsx`、`.ts`、`.jsx`、`.js` 文件
- 明确要求"根据代码生成文档""分析代码"的请求

### 需求输入

以下输入视为需求输入：

- 页面需求描述
- 原型说明
- Markdown、Word、文本类需求文档
- 明确要求"根据需求生成文档"的请求

当输入是需求时，先在 `packages/*/src/**` 下查找候选代码目录。优先依据：

1. 明确给出的包名
2. 明确给出的路径片段
3. 明确给出的模块名、页面名、业务对象
4. 邻近 `config.ts` 的路由描述

如果仍无法唯一定位，再要求用户澄清。

## 路径规则

**核心原则：文档目录结构与代码目录完全镜像。** 把代码路径中的 `packages/<pkg>/src` 替换为 `ai-harness-root/docs/<pkg>`，路径的其余部分保持不变，就是文档路径。反之亦然。

```
代码路径  packages/ibom/src/  bbom/bbommain/index.tsx
                         ↓ packages/ibom/src 替换为 ai-harness-root/docs/ibom
文档路径  ai-harness-root/docs/ibom/          bbom/bbommain/
```

### 代码 → 文档（创建/定位文档时用）

| 场景 | 代码路径 | 对应文档路径 |
|---|---|---|
| 页面目录 | `packages/ibom/src/bbom/bbommain/` | `ai-harness-root/docs/ibom/bbom/bbommain/` |
| 页面文件 | `packages/ibom/src/ebom/ecrmain/index.tsx` | `ai-harness-root/docs/ibom/ebom/ecrmain/` |
| 组件目录 | `packages/ibom/src/components/bomcombineselect/` | `ai-harness-root/docs/ibom/components/bomcombineselect/main.md` |
| Hook 文件 | `packages/ibom/src/hooks/bom/useBomSearch.ts` | `ai-harness-root/docs/ibom/hooks/bom/useBomSearch.md` |
| 工具函数 | `packages/ibom/src/utils/formatBomCode.ts` | `ai-harness-root/docs/ibom/utils/formatBomCode.md` |

### 文档 → 代码（读取文档后定位代码时用）

| 文档路径 | 对应代码路径 |
|---|---|
| `ai-harness-root/docs/ibom/bbom/bbommain/` | `packages/ibom/src/bbom/bbommain/` |
| `ai-harness-root/docs/ibom/components/bomcombineselect/main.md` | `packages/ibom/src/components/bomcombineselect/` |
| `ai-harness-root/docs/ibom/hooks/bom/useBomSearch.md` | `packages/ibom/src/hooks/bom/useBomSearch.ts` |

### 补充规则

- 输入为代码**文件**时，先归一到其所在目录（如 `index.tsx` → 父目录），再按上述规则映射。
- 组件文档统一输出为目录下的 `main.md`；Hook/工具函数文档输出为与源文件同名的 `.md`（去掉 `.ts`/`.tsx`）。
- procomponents 框架组件也适用本文档规范（路径：`packages/procomponents/src/business/**` → `ai-harness-root/docs/procomponents/business/**`）。
- 组件专属 Hook（位于组件 `hooks/` 子目录下）不独立建档，其功能在组件文档的按钮清单中描述。

## 文档硬性规则

### 页面文档

1. 禁止保留源码路径、导入路径、Hook 名称、Store 名称、组件注册名。
2. 禁止写"详见源码""共享组件内部定义""参见某文件"。
3. 页面事实必须完整覆盖用户可见区域：查询区、按钮区、表格区、页签、详情头部、弹窗/抽屉、其他独立可见模块。
4. 对页面上每一个具体功能都要逐项写清：功能名称/触发入口、显示位置/所属区域、显示/禁用/打开条件、用户操作、页面结果、联动/校验/状态变化/刷新结果。
5. 不能只写"支持新增""支持编辑"这类摘要，必须展开到每个按钮、行操作、单元格点击、弹窗入口。
6. 引用其他组件时只写文档路径，不描述被引用组件的内部组成。
7. 无法确认时写 `[待确认]`，不要伪造。

### 组件文档

1. 禁止写内部 Hook 名称、Store 变量名、实现细节。
2. 必须覆盖：组件概述、Props 接口表、交互行为（每种交互单独描述）、数据流与逻辑、使用场景。
3. 每种交互必须写清：触发方式、组件响应、回调触发。
4. 复合组件 `main.md` 必须包含功能索引与文档导航。
5. 组件专属 Hook 不独立建档，其功能在按钮清单中描述。
6. 引用其他组件时只写文档路径，不描述被引用组件的内部组成。
7. 无法确认时写 `[待确认]`，不要伪造。
8. 复合组件子文档类型按实际功能区域确定，不限于 grid/button/search/form；其他独立功能区域按 `{area-name}-area.md` 命名扩展。

### 方法文档（hooks/utils）

1. 禁止写内部 API 路径（除非是对外可配置参数）。
2. 禁止写实现算法细节，只描述行为和效果。
3. 必须覆盖：功能描述、参数表、返回值表、核心功能说明（按功能点分条）、使用场景。
4. 组件专属 Hook 不独立建档，只有模块级共享 Hook 才需要独立文档。
5. 引用其他组件/方法时只写文档路径，不描述被引用组件/方法的内部。
6. 无法确认时写 `[待确认]`，不要伪造。

## 参考文件

### 页面文档

- `reference/page-type-detection.md`：页面类型检测
- `reference/page-main-spec.md`：主页面文档内容边界
- `reference/page-detail-spec.md`：详情页文档内容边界
- `reference/output-generation.md`：路径映射、目录输出、读取与更新规则

### 组件文档

- `reference/component-spec.md`：组件文档内容边界和禁止事项

### 方法文档

- `reference/method-spec.md`：方法文档内容边界和禁止事项

### 代码分析方法（按需读取）

- `reference/index.md`：导航入口
- `reference/searchform-analysis.md`
- `reference/grid-analysis.md`
- `reference/schemaforms-analysis.md`
- `reference/button-area.md`
- `reference/file-structure.md`
- `reference/hooks-patterns.md`
- `reference/misc-detection.md`

## 输出模板

根据文档类型按需读取：

**页面文档：**

- `templates/page-main/`
- `templates/page-detail/`
- `templates/common/button-function.md`
- `templates/common/popup.md`

**组件文档：**

- `templates/component/main.md`
- `templates/component/grid-area.md`（复合组件：含 Grid 表格）
- `templates/component/button-area.md`（复合组件：含操作按钮）
- `templates/component/search-area.md`（复合组件：含搜索表单）
- `templates/component/form-area.md`（复合组件：含编辑/展示表单）
- `templates/common/button-function.md`（复杂按钮+弹窗一体化）
- `templates/common/popup.md`（复用型弹窗）
- 其他独立功能区域可按 `{area-name}-area.md` 命名扩展

**方法文档：**

- `templates/method/main.md`

## 错误处理

| 场景 | 处理方式 |
|-----|---------|
| 代码目录找不到（需求输入） | 依次按包名→路径片段→模块名→路由描述搜索；仍无法定位时列出 top-3 候选路径让用户选择 |
| 代码目录有多个候选 | 用 `AskUserQuestion` 列出候选路径，让用户选择 |
| 文档类型无法自动识别 | 用 `AskUserQuestion` 询问，选项：主页面 / 详情页 / 组件 / Hook / 工具函数 |
| 目标文档已存在（模式A） | 提示用户文档已存在，询问是覆盖还是切换到模式C更新 |
| 自检不通过 | 标记不通过项，重新生成受影响部分，最多重试2次 |
| 代码文件为空或无法解析 | 跳过该文件，在文档中对应位置标记 `[待确认]` |
| 模式C判断受影响范围不确定 | 宁可多包含一个文件，避免遗漏；多出的文件更新时保持原有内容不变的部分 |
