# 输出与路径规则

## 一、输出目标

`gant-feature-docs` 只处理页面功能文档。

支持三类工作：

| 模式 | 目标 |
|------|------|
| 生成文档 | 根据需求或代码生成页面功能文档 |
| 读取文档 | 根据页面路径找到对应文档并读取 |
| 更新文档 | 根据页面变更回写受影响文档 |

最终文档只承担页面功能说明职责。

## 二、完整性要求

文档不能只描述区域存在与否，必须把页面上每一个具体功能点逐项写清。

至少要覆盖的功能粒度：

- 每一个查询字段
- 每一个页面按钮
- 每一个 Tab 按钮或局部按钮
- 每一个表格列
- 每一个行操作按钮
- 每一个单元格点击行为
- 每一个弹窗 / 抽屉入口
- 每一个独立可见模块
- 每一个明显的联动、校验、状态切换、局部刷新行为

全局拆分原则：

- 只要页面或子区域同时存在按钮区和表格 / 主内容区，就必须分开描述。
- 不只是 Tab，页面主区域、子页签区域、弹窗内复合区域也适用。
- 按钮功能主描述放在 `button-area.md` 或专属按钮文档。
- 表格和主内容区主描述放在 `grid-area.md` 或等价区域文档。
- 不允许把按钮详细功能混写进表格文档，也不允许把表格列和行操作主描述混写进按钮文档。
- 如果按钮点击后打开弹窗，而该整套“按钮 + 弹窗”功能复杂，优先合并到同一个 `button-{name}.md` 文档中完整描述。
- 这种一体化按钮功能文档必须覆盖：按钮入口、显示条件、弹窗字段、联动、校验、提交、关闭、刷新结果。

禁止的写法：

- 只写“有按钮区”
- 只写“支持增删改查”
- 只写“表格支持行操作”
- 只写“存在弹窗”
- 只写“有其他模块”

必须改成逐项写法，例如：

- 哪个按钮
- 在哪里
- 什么条件下可见或可用
- 点击后发生什么
- 是否打开弹窗
- 是否刷新页面、当前区域或当前行

同时要求：

- `main.md` 必须提供“全页面功能索引”
- 复杂按钮必须使用专属按钮功能文档，优先一体化描述按钮与弹窗
- 关键状态差异必须落成状态矩阵，而不是散落在说明句子里
## 三、页面路径与文档路径映射

### 2.1 基本规则

页面代码目录：

```text
packages/<package>/src/<page-path>
```

文档目录：

```text
ai-harness-root/docs/<package>/<page-path>
```

### 2.2 示例

```text
packages/ibom/src/masterdata/product/producttype
-> ai-harness-root/docs/ibom/masterdata/product/producttype
```

### 2.3 文件输入归一规则

如果输入是页面内部文件，例如：

```text
packages/ibom/src/masterdata/product/producttype/schema.ts
```

先归一到页面目录：

```text
packages/ibom/src/masterdata/product/producttype
```

再映射到文档目录：

```text
ai-harness-root/docs/ibom/masterdata/product/producttype
```

### 2.4 适用范围

对 `packages/*/src/**` 下的业务页面目录和组件目录建立映射。

procomponents 框架组件也适用本文档规范：

```text
packages/procomponents/src/business/<component-path>
-> docs/procomponents/business/<component-path>

packages/procomponents/src/hooks/<path>/useXxx.ts
-> docs/procomponents/hooks/<path>/useXxx.md
```

以下内容不建立独立文档映射：

- 纯工具函数目录（按 method-spec 规范处理）
- 通用 hooks 目录（按 method-spec 规范处理）

## 四、生成文档模式

### 3.1 代码输入

1. 定位页面目录
2. 判断页面类型
3. 读取所需代码和参考规范
4. 生成目标文档目录及其 `.md` 文件

### 3.2 需求输入

1. 先根据需求自动定位候选页面目录
2. 定位规则优先级：
   - 明确给出的包名
   - 明确给出的页面路径片段
   - 业务对象名或页面名
   - 页面附近或模块级 `config.ts`
3. 如果定位唯一，直接映射到目标文档目录
4. 如果定位失败或存在多个候选，再要求用户澄清

### 3.3 目录创建

目标 docs 目录不存在时，按需创建。

## 五、读取文档模式

1. 先把输入归一到页面目录
2. 映射到 docs 目录
3. 读取该目录下现有文档
4. 如果目录不存在或文档缺失，明确说明当前没有对应页面文档

读取时优先顺序：

1. `main.md`
2. 该页面目录下其他区域文档
3. 子目录中的 Tab / 子页签文档

## 六、更新文档模式

1. 先把输入归一到页面目录
2. 映射到 docs 目录
3. 读取当前文档和最新页面代码
4. 判断哪些 `.md` 文件受影响
5. 仅重写受影响文件

更新约束：

- 不做整目录全量重写
- 不输出 patch / diff
- 每个受影响文件按完整内容重写

## 七、文档目录结构

### 6.1 主页面

```text
ai-harness-root/docs/<package>/<page-path>/
├── main.md
├── search-area.md
├── button-area.md
├── grid-area.md
├── other-features.md
├── button-{name}.md
└── popup-{name}.md
```

强制拆分要求：

- 只要主页面存在按钮区和表格 / 主内容区，就必须同时生成 `button-area.md` 和 `grid-area.md`。
- 如果某个按钮功能很大、流程长、入口多、状态规则复杂，必须单独生成 `button-{name}.md`。
- 如果按钮点击后打开弹窗，且按钮与弹窗组成一个复杂完整功能，优先把它们合并写进同一个 `button-{name}.md`。
- `button-area.md` 中保留按钮总清单，并把复杂按钮链接到对应 `button-{name}.md`。
- `popup-{name}.md` 仅在弹窗需要跨多个按钮复用，或必须单独表达时再使用。
- `main.md` 中必须列出页面全部功能索引，并把复杂按钮指向对应 `button-{name}.md`。

### 6.2 多 Tab / 多区域主页面

```text
ai-harness-root/docs/<package>/<page-path>/
├── main.md
├── search-area.md
├── tab-{name-1}/
│   ├── main.md
│   ├── button-area.md
│   ├── button-{name}.md
│   ├── grid-area.md
│   └── popup-{name}.md
└── tab-{name-2}/
    ├── main.md
    ├── button-area.md
    ├── button-{name}.md
    ├── grid-area.md
    └── popup-{name}.md
```

强制拆分要求：

- 每一个 Tab 目录下，按钮区和表格区必须分开写。
- 不允许只保留 `tab-{name}/main.md` 而不拆 `button-area.md`、`grid-area.md`。
- 如果 Tab 内存在按钮，必须生成 `tab-{name}/button-area.md`。
- 如果 Tab 内存在表格或主内容区，必须生成 `tab-{name}/grid-area.md` 或等价区域文档。
- 如果某个按钮功能复杂，必须单独生成 `tab-{name}/button-{name}.md` 或等价按钮专属文档。
- 如果某个按钮打开弹窗，且按钮与弹窗组成一个复杂功能，必须优先合并写进 `tab-{name}/button-{name}.md`。
- 如果弹窗很轻，也要在按钮文档中完整展开该弹窗的字段、规则和结果；不能只写“打开新增弹窗”。
- 只有当弹窗本身跨多个入口复用，或确实需要独立表达时，才单独生成 `popup-{name}.md`。
- `tab-{name}/main.md` 中必须列出该 Tab 下全部功能索引。

### 6.3 详情页

```text
ai-harness-root/docs/<package>/<page-path>/
├── main.md
├── header-buttons.md
├── button-{name}.md
├── base-info-tab.md
├── sub-tab-{name}.md
└── popup-{name}.md
```

补充要求：

- 详情页头部按钮如果存在复杂功能，也允许拆成 `button-{name}.md`。
- 如果头部按钮点击后打开复杂弹窗，优先把按钮与弹窗合并写进同一个 `button-{name}.md`。
- 子页签内如果同时有按钮区和表格区，也要按主页面同样的分离规则处理。
- 详情页 `main.md` 中必须列出全页面功能索引，包含头部按钮、基本信息、子页签功能和复杂按钮文档链接。

## 八、跨组件引用规则

任何文档类型（页面、组件、方法）引用另一个组件时：

- **只在功能清单中写被引用组件的文档路径**
- **不描述被引用组件的内部组成、Props、交互行为等**
- 示例：在按钮清单中引用 ApprovalProcessGrid 组件 → 只写 `→ [审批流程表格文档](../../workflowapproval/approvalprocessgrid/main.md)`

此规则同样适用于：
- 页面文档中引用业务组件
- 组件文档中引用其他组件
- 方法文档中引用相关组件或方法

## 九、复合组件文档结构

### 9.1 复合组件

```text
ai-harness-root/docs/<package>/<component-path>/
├── main.md                    # 组件概述 + Props + 功能索引 + 文档导航
├── search-area.md             # 搜索表单字段（如组件含 SearchForm）
├── grid-area.md               # Grid 列清单 + 行操作 + 单元格点击
├── button-area.md             # 按钮清单 + 行为说明
├── form-area.md               # 编辑/展示表单字段（如组件含 SchemaForm）
├── button-{name}.md           # 复杂按钮 + 弹窗一体化文档
├── popup-{name}.md            # 复用型独立弹窗
└── {area-name}-area.md        # 其他独立功能区域（按需扩展）
```

强制拆分要求：

- 复合组件的 `main.md` 必须包含功能索引与文档导航
- 只要组件内同时存在按钮区和表格/主内容区，就必须分开描述
- 复杂按钮 + 弹窗优先合并到 `button-{name}.md`
- 只有复用型弹窗才单独生成 `popup-{name}.md`
- 组件专属 Hook（位于组件 `hooks/` 子目录下）不独立建档，其功能在按钮清单中描述
- 模块级共享 Hook（位于 `src/hooks/` 下）独立建档
- 子文档类型按组件实际包含的功能区域确定，不限于上表列举：
  - 含表格 → `grid-area.md`
  - 含按钮 → `button-area.md`（复杂按钮拆为 `button-{name}.md`）
  - 含搜索表单 → `search-area.md`
  - 含编辑/展示表单 → `form-area.md`
  - 其他独立功能区域 → `{area-name}-area.md`（如 `tree-area.md`、`statistics-area.md` 等）
- 拆分判断标准：该区域有独立的字段/交互/逻辑需要逐项描述，且内容量足以独立成文

### 9.2 简单组件

```text
ai-harness-root/docs/<package>/<component-path>/
└── main.md
```

无拆分要求，所有内容在 `main.md` 中完整描述。

## 十、路由信息来源

路由获取顺序：

1. 页面附近的 `config.ts`
2. 模块级 `config.ts`
3. 详情页注册或页面容器中的路由线索
4. 无法确认时写 `[待确认]`

## 十一、质量检查

输出或更新后检查：

- [ ] 文档目录路径与代码目录一一对应
- [ ] 页面文件输入已正确归一到页面目录
- [ ] 文档中没有源码路径、Hook 名称、导入路径
- [ ] 文档中没有历史协议文案
- [ ] 只写功能事实
- [ ] 页面/组件上每一个可见功能都有逐项描述，不是只有区域总览
- [ ] 每个按钮、行操作、单元格点击、弹窗入口、独立模块都单独落文档
- [ ] `main.md` 中已列出全功能索引
- [ ] 多 Tab、多 Grid、大弹窗已正确拆文档
- [ ] 只要同时存在按钮区和表格 / 主内容区，就已分开描述
- [ ] 每个 Tab 目录下按钮区和表格区已拆开，按钮功能没有混写进 Grid 描述
- [ ] 复杂按钮已单独成文档，按钮总清单中有对应链接
- [ ] 按钮触发弹窗的复杂功能，已优先合并到对应 `button-{name}.md`
- [ ] 轻量弹窗已在按钮文档中完整展开字段与规则
- [ ] 只有复用型或必须独立表达的弹窗才单独成文档
- [ ] 按钮、表格、其他模块中的关键状态差异已落成矩阵或等价清单
- [ ] 复合组件 `main.md` 已包含功能索引与文档导航
- [ ] 复合组件的 Grid 区域已拆分为 `grid-area.md`，每列单独一行
- [ ] 复合组件的按钮区域已拆分为 `button-area.md`，每按钮单独一行
- [ ] 复合组件的搜索区域已拆分为 `search-area.md`（如含搜索表单）
- [ ] 复合组件的表单区域已拆分为 `form-area.md`（如含编辑/展示表单）
- [ ] 复合组件的其他独立功能区域已拆分为对应的 `{area-name}-area.md`
- [ ] Hook 文档文件名与代码文件名一致（非 kebab-case）
- [ ] 组件专属 Hook 未独立建档
- [ ] 引用其他组件时只写了文档路径，未描述被引用组件的内部组成
