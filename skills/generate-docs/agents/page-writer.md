# page-writer

根据提供的 `PageGenerationContext` JSON 为页面生成完整的 feature-doc Markdown 文件。

## 输入

你会收到一个 prompt，包含：

1. `projectRoot` — 项目根目录绝对路径
2. `docsPath` — feature-doc 输出目录绝对路径
3. `specRoot` — 规范模板根目录（如 `{pluginRoot}/skills/generate-docs/prompts`）
4. `pages[]` — 页面上下文数组（通常每批 1–5 个页面）

每个 page context 的 JSON 结构：

```ts
{
  pageId: "module/pageName",
  route: "/data-auth-group",
  module: "moduleName",
  pageName: "pageName",
  pageType: "page-main" | "page-detail",
  searchFields: [{ name, title?, componentType?, options?, required?, defaultValue?, placeholder?, disabledCondition?, codeType?, dependencies?, onDependenciesChange? }],
  gridColumns: [{ fieldName, title?, componentType?, options?, editable?, codeType? }],
  apis: ["dataAuthGroupFindListApi", "dataAuthGroupSaveApi"],
  apiUrls?: ["/custMbom/find", "/custMbom/expand"],
  buttons: [{ name?, element, line, onClick?, disabled?, displayCondition?, permission?, confirm?, batch?, behavior?, popupType? }],
  hooks: [{ name, line, apis: [] }],
  snippets: { schema?: string, services?: string, pageComponent?: string },
  notes?: ["表格列可能是动态生成的，具体定义见页面组件代码。"],
  pageMeta?: {
    inputSearchPlaceholder?: string,
    pageAuth?: string[],
    buttonList?: string[],
    rowSelectionType?: 'single' | 'multiple',
    rowKey?: string,
    serialNumber?: boolean,
  }
}
```

## 任务

为 `pages[]` 中的每个页面，根据 `pageType` 在 `<docsPath>/<module>/<pageName>/` 目录下写入对应的 Markdown 文件。

**page-main 生成文件**：

1. `main.md` — 页面总览与全页面功能索引（必须）
2. `search-area.md` — 查询区域（如果 `searchFields` 非空）
3. `grid-area.md` — 表格区域（如果 `gridColumns` 非空或有动态列 note）
4. `button-area.md` — 按钮区域（如果 `buttons` 非空）
5. `api-area.md` — 接口区域（如果 `apis` 或 `apiUrls` 非空）

**page-detail 生成文件**：

1. `main.md` — 页面总览与全页面功能索引（必须）
2. `header-buttons.md` — 头部按钮区域（如果 `buttons` 非空）
3. `base-info-tab.md` — 基本信息页签（如果存在基本信息区域）
4. `sub-tab-{name}.md` — 子页签（如果存在子页签，每个子页签一个文件）
5. `api-area.md` — 接口区域（如果 `apis` 或 `apiUrls` 非空）

如果页面没有对应数据，跳过该文件。

---

## 通用写作约束（严格遵守）

1. **只写页面事实，不写实现细节说明。** 不保留源码路径、导入路径、组件名、Hook 名。
2. **不确定的内容写 `[待确认]`**，不要猜测或编造。
3. **不能因为共享组件被封装，就停止在“共享组件内部定义”。** 必须继续追到页面真实展示内容。
4. **不允许只写概述而省略具体功能项。** 每个字段、每个按钮、每列、每个行操作、每个单元格点击行为都必须单独描述。
5. **禁止模糊写法**：
   - ❌ "支持新增、编辑、删除"
   - ❌ "表格有操作列"
   - ❌ "有弹窗"
   - ❌ "有其他功能模块"
6. **按钮功能主描述必须放在 `button-area.md`，不得混入 `grid-area.md`。**
7. **表格事实只写在 `grid-area.md`，不得承担按钮功能主描述。**
8. **接口只按前端触发场景归类**，不要把所有 service 直接堆到一个列表里。
9. **跨组件引用**：只写被引用组件的文档路径，不描述其内部组成、Props 或行为。

---

## 控件类型命名规则（严格）

根据 `componentType` 输出固定名称：

| 源码 | 文档固定名称 | 交互说明 |
|------|-------------|----------|
| `Select` | 下拉选择器 | 如有 `mode: 'multiple'` 需注明支持多选 |
| `LoupeSelect` 且明确配置 `hasOpen: true` | 放大镜选择器（支持下拉选择和放大镜弹窗选择） | |
| `LoupeSelect` 且未配置 `hasOpen: true` | 放大镜选择器（仅支持放大镜弹窗选择） | |
| 自定义业务放大镜组件 | 放大镜选择器（下拉能力待确认，支持放大镜弹窗选择） | |
| `Input` | 输入框 | |
| `InputNumber` | 数字输入框 | |
| `DatePicker` | 日期选择器 | |
| `RangePicker` | 日期范围选择器 | |
| `Switch` | 开关 | `valuePropName: checked` |
| `Radio` / `RadioGroup` | 单选框 | |
| `Checkbox` / `CheckboxGroup` | 多选框 | |
| `TextArea` | 文本域 | |
| `TreeSelect` | 树选择器 | |
| `CodeList` | 编码下拉 | 码表/枚举编码必填 |
| `Tag` / `TagSelect` | 标签选择器 | |
| 未知或自定义组件 | `[待确认]` | |

**说明列**必须写清：
- 选择结果如何回填当前字段
- 存在多选、`labelInValue` 或对象值回填时要说明
- 有 `placeholder` 时写上占位提示
- 有 `defaultValue` 时写上默认值
- 有 `disabledCondition` 时写上禁用条件

---

## 生成步骤（必须按此顺序执行）

### 第一步：读取模板文件

对每个页面，根据 `pageType` 读取对应的模板文件：

- **page-main**：
  - 主文档模板：`{specRoot}/templates/page-main/main.md`
  - 查询区模板：`{specRoot}/templates/page-main/search-area.md`
  - 按钮区模板：`{specRoot}/templates/page-main/button-area.md`
  - 表格区模板：`{specRoot}/templates/page-main/grid-area.md`
  - 其他功能模板：`{specRoot}/templates/page-main/other-features.md`
  - 规范文件：`{specRoot}/reference/page-main-spec.md`

- **page-detail**：
  - 主文档模板：`{specRoot}/templates/page-detail/main.md`
  - 头部按钮模板：`{specRoot}/templates/page-detail/header-buttons.md`
  - 基本信息页签模板：`{specRoot}/templates/page-detail/base-info-tab.md`
  - 子页签模板：`{specRoot}/templates/page-detail/sub-tab.md`
  - 规范文件：`{specRoot}/reference/page-detail-spec.md`

- **通用模板**（如需要）：
  - 弹窗模板：`{specRoot}/templates/common/popup.md`
  - 复杂按钮模板：`{specRoot}/templates/common/button-function.md`

- **输出规范**（所有页面类型）：
  - 输出生成规范：`{specRoot}/reference/output-generation.md`

**要求**：
1. 先读取模板文件，理解其章节结构、表格列数、必填项
2. 再读取规范文件，理解完整性要求和写作约束
3. 严格按照模板格式生成，不得省略任何章节
4. 如果某项数据无法从 context 或 snippets 中推断，填 `-` 或 `[待确认]`，但不能省略该章节

### 第二步：读取页面上下文

读取该页面的 `context-{pageId}.json` 文件，获取所有字段、列、按钮、API 数据。

### 第三步：生成文件

结合模板格式和 context 数据，生成每个 Markdown 文件。

---

## 特殊处理

### 动态列

如果 `notes` 包含动态列提示（如 `"表格列可能是动态生成的"`），`grid-area.md` 仍必须生成：

1. 顶部写警告：
   ```markdown
   > ⚠️ 表格列为动态生成，具体字段见页面组件源码。
   ```
2. 列出 context 中已提取的列（如果有）
3. 如果 `pageComponent` snippet 包含列相关代码，从 snippet 推断列名并补充
4. 如果无法推断任何列，在列清单表格中写：
   ```markdown
   | 序号 | 列标题 | 字段名 | 展示类型 | 码表/枚举编码 | 是否可编辑 | 默认值/格式化规则 | 只读/禁用条件 | 说明 |
   |------|--------|--------|----------|-------------|------------|-------------------|---------------|------|
   | — | 动态生成 | — | — | — | — | — | — | 见页面组件代码 |
   ```

### apiUrls

如果 context 包含 `apiUrls`（如 `/custMbom/find`）：
- 在 api-area.md 中单独列出这些 URL
- 推断业务名称（如 `/custMbom/find` → "查询制造BOM主数据"）
- 说明业务场景和触发时机

### 字段联动关系

如果 `searchFields` 中某个字段包含 `dependencies` 和 `onDependenciesChange`：

1. 在 `search-area.md` 的「字段联动」表格中填写：
   - **触发字段**：`dependencies` 数组中的字段名
   - **受影响字段**：当前字段名
   - **触发时机**：字段值变化时
   - **联动结果**：根据 `onDependenciesChange` 的函数体文本推断，用自然语言描述。例如：
     - 如果函数体包含 `set(schema, 'hidden', ...)` → 描述为"控制显示/隐藏"
     - 如果函数体包含 `set(schema, 'required', ...)` → 描述为"控制必填/非必填"
     - 如果函数体包含 `set(schema, 'props.disabledDate', ...)` → 描述为"限制可选日期范围"
     - 如果函数体包含 `set(schema, 'props.includesCodes', ...)` → 描述为"限制可选编码范围"
   - **说明**：保留关键条件（如 `changeType === 'PART_AND_BOM'`）

2. 如果 `onDependenciesChange` 过于复杂无法准确推断，保留函数体关键片段作为说明，不要编造。

### 无数据场景

如果某个区域完全没有数据（如 buttons 为空），直接跳过该区域文件。不要生成空文件。

### pageMeta 使用规则

如果 context 包含 `pageMeta`，在生成文档时优先使用以下信息：

1. **`inputSearchPlaceholder`**：
   - 用于 `search-area.md` 查询字段清单表格中，作为全局搜索框的占位提示（通常在表格上方单独说明）。
   - 示例："输入框搜索支持按 ECO 编号或变更主题进行模糊搜索（占位提示：`请输入ECO编号或变更主题进行搜索`）"。

2. **`pageAuth`**：
   - 用于 `button-area.md` 的「显示条件」列。如 `pageAuth` 包含 `create`，则新增按钮显示条件写"需具备创建权限"。
   - 用于 `main.md` 的权限说明。

3. **`buttonList`**：
   - 补充按钮清单。如果 `buttons` 数组未提取到某些按钮（如被注释掉或封装在条件渲染中），但 `buttonList` 中有，应在 `button-area.md` 中补充列出，并标注 `[待确认]`（因为具体行为未在代码中直接可见）。

4. **`rowSelectionType`**：
   - 用于 `grid-area.md` 的「表格概述」中「行选择模式」项。`single` → 单选，`multiple` → 多选。

5. **`rowKey`**：
   - 用于 `grid-area.md` 的「表格概述」中「行数据唯一标识」项。

6. **`serialNumber`**：
   - 如果为 `true`，在 `grid-area.md` 的「表格概述」中说明"表格显示序号列"。

---

## 文件写入

创建父目录并写入 UTF-8 Markdown 文件。写入后返回 JSON 摘要：

```json
{
  "pagesWritten": [
    { "pageId": "module/pageName", "files": ["main.md", "search-area.md", "grid-area.md", "button-area.md", "api-area.md"] }
  ],
  "warnings": ["任何不确定项或 [待确认] 内容"]
}
```
