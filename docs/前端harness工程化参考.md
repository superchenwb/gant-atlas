该体系的核心目标是：

- **让 AI 开发有入口**：统一从 AGENTS 进入，不靠临场发挥。
- **让 AI 修改有依据**：先读文档，再读源码，再改代码。
- **让 AI 执行有流程**：通过 WF 工作流控制任务步骤。
- **让 AI 输出可追踪**：通过 Spec、Worktree、work-record、commit 形成闭环。
- **让 AI 行为可治理**：Rules 约束编码规范，Skills 约束执行方法。

---

## 一、整体架构

### 1. 核心文件分工

| 文件 / 目录 | 作用 |
| --- | --- |
| `AGENTS.md` | 项目 AI 协作入口，定义 WF 流程、协议、Rules/Skills 索引、Worktree、提交与验证规范 |
| `ai-harness-root/.harness/project-config.md` | 项目级参数来源，集中维护技术栈、包结构、路径、命令、Worktree 模板、MCP 配置等 |
| `ai-harness-root/.harness/mcp/` | 项目所用 MCP 服务器配置目录 |
| `ai-harness-root/.harness/rules/` | Rules 目录，定义编码、样式、组件、Schema、Store 等约束 |
| `ai-harness-root/.harness/skills/` | Skills 目录，定义功能文档、Bug 修复、页面开发、测试验证等执行方法 |
| `ai-harness-root/docs/` | 功能文档目录，与源码路径镜像映射 |
| `ai-harness-root/specs/` | Spec 计划目录，用于修改类任务的方案落地 |
| `ai-harness-root/work-records/` | 工作记录目录，记录每次任务的执行过程与验证结果 |

---

## 二、核心设计理念

### 1. AGENTS.md 是唯一事实来源

项目中与 AI 协作相关的主流程、协议、规则、Skill 调用方式、Worktree 规范、提交规范，都以 `AGENTS.md` 为准。

其他 harness 文件只承担辅助角色：

- **flows**：负责入口引导，不重复定义执行流程。
- **rules**：负责具体规则约束。
- **skills**：负责具体任务的执行方法。
- **project-config**：负责参数集中化管理。

### 2. 文档优先，而不是源码优先

项目要求 AI 在读取或修改 `packages/*/src/**` 源码前，必须先读取对应功能文档。

路径映射规则：

```plain
源码: packages/<pkg>/src/<module>/<submodule>/xxx.tsx
文档: ai-harness-root/docs/<pkg>/<module>/<submodule>/
```

示例：

```plain
packages/ibom/src/ebom/eco/index.tsx
→ ai-harness-root/docs/ibom/ebom/eco/
```

---

## 三、启动序列

每次用户发起任务后，AI 需要先进入标准启动流程。

```plain
1. 输出 “已启动 规范”
2. 分析任务类型
3. 匹配 WF 路由表
4. 确认或声明所选 WF
5. 创建 TodoWrite 步骤列表
6. 从 Step 1 开始执行
```

### WF 路由表

| WF | 名称 | 典型触发词 |
| --- | --- | --- |
| WF1 | 新增代码 | 新增页面、新建列表页、开发详情页、创建组件 |
| WF2 | 修改代码 | 修 bug、修复、改需求、报错、需要优化 |
| WF3 | 新增文档 | 生成文档、生成功能清单、提取文档 |
| WF4 | 修改文档 | 更新文档、同步文档、文档不对 |
| WF5 | 测试验证 | 测试一下、验证功能、看看能不能用 |
| WF6 | 提交代码 | 提交代码、commit、合并分支、push |

---

## 四、贯穿协议

### 协议 A：文档优先

任何涉及源码读取或修改的任务，都必须先读取对应功能文档。

如果文档缺失，需要进入文档缺失门控：

- 列出缺失文档路径。
- 询问用户是否补充文档。
- 用户确认后才允许继续。

### 协议 B：流程锚定

选择 WF 后，必须创建完整 TodoWrite 步骤列表，并按顺序推进。

禁止：

- 跳过步骤。
- 自由编造步骤。
- 只做代码不记录流程。

### 协议 C：Checkpoint 自检

每个 Step 开始前都要自检：

```plain
[Checkpoint] WF-StepN
├── WF选择: OK
├── 前一步完成: OK/否
├── 文档已读: OK/否
├── Worktree已创建: OK/否
├── Rules已读: OK/否
├── Skill SKILL.md已读: OK/否
├── 步骤未跳过: OK
└── TodoWrite: OK 当前步骤
```

### 协议 D：Rules / Skill 执行强制

匹配到的 Rules 和 Skills 不能只“识别”，必须读取并执行。

尤其是 `.harness/skills/` 下的 `prd-*` 和 `prj-*` 类 Skill，属于 harness Skill，不能直接用工具调用，而是需要手动执行：

```plain
1. Read SKILL.md
2. 读取 reference/
3. 读取 templates/
4. 按 SKILL.md 的工作流执行
```

### 协议 E：步骤完整性约束

WF1 / WF2 中的关键步骤不可由 AI 自行跳过：

- 功能文档生成或对齐。
- Worktree 初始化。
- work-record 生成。
- Worktree 清理与验证。

唯一例外：用户明确说“跳过某步骤”。

### 协议 F：Browser 代理降级

如果 Browser Agent 不可用，不阻断整个流程，而是降级为手动验证：

- 记录失败原因。
- 最多重试 2 次。
- 通知用户进行手动验证或基于代码分析继续。
- 禁止无限重试或静默跳过。

---

## 五、Rules 体系

Rules 用来约束 AI 写代码时必须遵守的规范。

### 1. 始终加载的 Rules

| Rule | 主要内容 |
| --- | --- |
| `prd-global.md` | 国际化 `tr()`、procomponents 交互方法、模块导入规范 |
| `prd-style.md` | CSS-in-JS、createStyles、Token / sizeToken 使用 |

### 2. 按需加载的 Rules

| Rule | 触发场景 |
| --- | --- |
| `prd-component-button.md` | 开发或封装按钮组件 |
| `prd-component-grid.md` | 开发 Grid / 表格页面 |
| `prd-component-input.md` | 封装输入组件 |
| `prd-component-searchform.md` | 开发搜索表单 |
| `prd-drawer-modal.md` | 开发 Drawer / Modal |
| `prd-hooks.md` | 开发自定义 Hook |
| `prd-interaction-protocol.md` | 涉及交互规范 |
| `prd-schema-grid.md` | 定义 Grid 列 |
| `prd-schema-schemaform.md` | 定义表单 Schema |
| `prd-schema-searchform.md` | 定义搜索 Schema |
| `prd-store.md` | 创建或修改 Zustand Store |
| `prd-tabs.md` | 使用 Tabs / DrawerTabs |

---

## 六、Skills 体系

Skills 用来约束 AI 如何完成具体任务。

- 工具类 Skills

| Skill | 用途 |
| --- | --- |
| `prd-gant-feature-docs` | 功能文档生成、读取、更新 |
| `prd-gant-issue-fixer` | Bug 修复、需求修改、问题分析 |
| `prd-gant-create-test` | lint 与浏览器验证 |
| `prd-code-detection-toolbox` | 代码质量检测与评分 |

- 通用业务 Skills

| Skill | 用途 |
| --- | --- |
| `prd-business-page-main` | 通用列表页 |
| `prd-business-page-detail` | 通用详情页 |
| `prd-business-component-button` | 操作按钮封装 |
| `prd-business-component-input` | 输入组件封装 |
| `prd-business-drawer-modal` | Drawer / Modal 弹窗 |

- ibom 专属 Skills

| Skill | 用途 |
| --- | --- |
| `prd-ibom-page-bom-main` | BOM 主页面 |
| `prd-ibom-page-bom-detail` | BOM 详情页 |
| `prd-ibom-change-page-main` | 变更单主页面 |
| `prd-ibom-change-page-detail` | 变更单详情页 |

---

## 七、WF1：新增代码流程

WF1 用于新增页面、组件、详情页、列表页等场景。

### WF1 步骤说明

| Step | 名称 | 关键动作 | 备注 |
| --- | --- | --- | --- |
| Step1 | 理解需求 | 读取需求、参考文档，提取功能点 | |
| Step2 | 确定模块 + 加载 Rules | 判断包、模块、页面类型，并读取匹配 Rules | |
| Step3 | 生成新功能文档 | 使用 `prd-gant-feature-docs` 模式 A 生成功能文档 | |
| Step4 | Worktree 初始化 | 创建隔离分支和工作区，安装依赖，启动服务，记录端口 | 命名规范：分支名 `{type}/{task-slug}-{YYYYMMDDHHmmss}`，目录名 `../wuling-ibom-ui-wt-{task-slug}-{yyyyMMddHHmmss}`；初始化流程：创建 worktree 分支 → 复制 pnpm-lock.yaml → `pnpm i --prefer-offline --frozen-lockfile` → 启动开发服务 → 记录真实端口号 → 写入 worktree-records |
| Step5 | 读取关键源码 | 只读取 Worktree 中与文档相关的关键源码 | |
| Step6 | 调用 Skill 开发 | 根据页面类型选择业务 Skill 并执行开发 | |
| Step7 | 验证 | lint、构建、浏览器验证，Browser 不可用则降级 | |
| Step8 | 生成 work-record | 记录任务信息、修改文件、验证结果、Rules 遵守情况 | |
| Step9 | 提交与合并 | 代码 commit 与文档 commit 分开，合并 Worktree | |
| Step10 | Worktree 清理 | 停服务、删 worktree、删分支、更新记录 | 清理流程：停止后台服务 → 强制删除 worktree 并验证目录不存在 → 删除本地分支并验证 → 删除远程分支 → 更新 worktree-records 状态 |

---

## 八、WF2：修改代码流程

WF2 用于 Bug 修复、需求修改、报错处理、功能优化等场景。

### WF2 步骤说明

| Step | 名称 | 关键动作 | 备注 |
| --- | --- | --- | --- |
| Step1 | fixer 分析问题 | 定位文件、扫描文档、分析根因、输出修改方案 | 注意：提示词修复云效类 bug，判断是否为新增页面类型，是新增页面类型则询问切换为 WF1 流程 |
| Step2 | 文档齐备对齐 | 检查涉及源码是否有对应文档，缺失则进入门控 | |
| Step3 | Worktree 初始化 | 创建隔离开发工作区并启动服务 | |
| Step4 | 生成 Spec 计划 | 基于分析结论生成可执行修改计划 | |
| Step5 | fixer 执行修改 | 按 Spec 在 Worktree 中修改代码 | |
| Step6 | 验证 | lint、构建、浏览器验证或手动验证 | |
| Step7 | 文档同步 + work-record | 修改后同步功能文档，并生成工作记录 | |
| Step8 | 提交与合并 | 代码和文档分开提交，合并回主工作区 | |
| Step9 | Worktree 清理 | 停服务、删除 worktree、删除分支、更新记录 | |

---

## 九、work-record 工作记录

每个 WF 执行完成后，都需要生成工作记录。

### 路径规范

```plain
ai-harness-root/work-records/{yyyyMMdd}-{task-slug}/work-record.md
```

### 记录内容

| 内容 | 说明 |
| --- | --- |
| 任务信息 | WF 类型、包名、模块名、分支、Worktree 路径 |
| 执行过程 | 文档检查、Rules 加载、Skill 执行、编码过程 |
| 修改文件 | 文件路径、变更类型、变更说明 |
| 验证结果 | 构建、lint、浏览器验证、手动验证 |
| 文档同步 | 功能文档是否新增或更新 |
| Rules 遵守 | 是否遵守 always-on Rules 和按需 Rules |

---

## 总结

`SGMW-ibom-ui` 当前的 AI 协作体系，本质上不是“让 AI 更自由”，而是**让 AI 在工程规范内稳定工作**。

它通过：

- `AGENTS.md` 统一入口；
- WF 控制任务流程；
- Rules 约束代码规范；
- Skills 约束执行方法；
- docs 沉淀业务事实；
- Worktree 隔离开发风险；
- work-record 保留过程证据；

形成了一套面向前端业务项目的 AI 工程化协作闭环。

## Harness 文件

[harness-v1.zip](https://gant.yuque.com/attachments/yuque/0/2026/zip/35021631/1781162204848-b83bdf4e-4453-4c25-b01e-247dd0003cee.zip)
