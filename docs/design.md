# Gant-Atlas 设计文档

## 1. 定位

**Gant-Atlas 是业务规格查询引擎。**

它将前端页面的结构化规格（feature-docs Markdown 表格）解析为可查询的关系数据，提供：
- **规格查询**：页面有哪些字段、按钮、接口？
- **影响面分析**：修改某个接口/字段会影响哪些页面？
- **一致性校验**：代码实现与规格文档是否一致？

**不是文档搜索引擎，不是语义记忆，是业务规格的查询引擎。**

---

## 2. 核心数据模型

### 2.1 实体（Nodes）

页面清单中的每一类业务元素都是一个实体：

| 实体 | 来源文件 | 示例 |
|------|---------|------|
| **Page** | main.md | 数据权限管理 |
| **Field** | search-area.md | 数据授权名称（查询条件） |
| **Column** | grid-area.md | 数据授权名称（表格列） |
| **Button** | button-area.md | 新增、删除 |
| **API** | 各文件的"接口链路" | dataAuthGroupFindListApi |
| **Modal** | main.md 的"弹窗/抽屉" | 编辑数据权限组抽屉 |

### 2.2 关系（Edges）

```
Page --HAS_FIELD--> Field
Page --HAS_COLUMN--> Column
Page --HAS_BUTTON--> Button
Page --CALLS_API--> API
Field --BINDS_TO_API--> API      (字段的参数名对应接口参数)
Button --TRIGGERS--> Modal
Button --CALLS_API--> API
```

**关系是核心价值所在。** 没有关系，就无法回答"影响面"问题。

---

## 3. 存储设计

使用 SQLite，足够轻量且支持复杂 JOIN。

### 3.1 表结构

```sql
-- 页面
CREATE TABLE pages (
  id TEXT PRIMARY KEY,           -- bombusiness/dataauthgroup
  module TEXT NOT NULL,
  page_name TEXT NOT NULL,
  title TEXT,
  page_type TEXT,
  route TEXT,
  page_function TEXT
);

-- 查询字段
CREATE TABLE fields (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  field_label TEXT NOT NULL,     -- "数据授权名称"
  field_name TEXT,               -- "dataAuthName"
  component_type TEXT,           -- "Input 输入框"
  required BOOLEAN,
  default_value TEXT
);

-- 表格列
CREATE TABLE columns (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  column_title TEXT NOT NULL,
  field_name TEXT,
  display_content TEXT,
  editable BOOLEAN
);

-- 按钮
CREATE TABLE buttons (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  button_name TEXT NOT NULL,
  scope TEXT,                    -- "页面级" / "行级"
  position TEXT,
  display_condition TEXT,
  disabled_condition TEXT,
  click_result TEXT,
  confirm_required BOOLEAN
);

-- 接口
CREATE TABLE apis (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,     -- "dataAuthGroupFindListApi"
  description TEXT
);

-- 关系：页面调用接口
CREATE TABLE page_apis (
  page_id TEXT,
  api_id TEXT,
  scene TEXT,                    -- "查询" / "新增" / "编辑"
  PRIMARY KEY (page_id, api_id, scene)
);

-- 关系：字段绑定接口参数
CREATE TABLE field_apis (
  field_id TEXT,
  api_id TEXT,
  param_name TEXT,               -- 字段在接口中的参数名
  PRIMARY KEY (field_id, api_id)
);

-- 关系：按钮触发弹窗
CREATE TABLE button_modals (
  button_id TEXT PRIMARY KEY,
  modal_name TEXT NOT NULL
);
```

### 3.2 为什么不用图数据库

业务关系是**树形/星形结构**（页面为中心，辐射字段、按钮、接口），不是复杂图（没有环、没有多跳路径）。

SQLite + JOIN 足够，且零部署成本。

---

## 4. 解析器设计

### 4.1 输入

Markdown 表格文件：
- `main.md` → 提取 Page + Modal + API
- `search-area.md` → 提取 Field + API
- `grid-area.md` → 提取 Column + API
- `button-area.md` → 提取 Button + Modal + API

### 4.2 解析策略

每种文件类型有固定的解析模板：

**main.md**
- "页面概述"表格 → Page（页面中文名、英文名、功能、类型、路由）
- "接口链路"表格 → API + Page-API 关系
- "弹窗/抽屉"列表 → Modal

**search-area.md**
- 每个字段的子标题下的 `| 属性 | 内容 |` 表格 → Field
- "接口链路"表格 → API + Field-API 关系（通过参数名匹配）

**grid-area.md**
- 每个列的子标题下的 `| 属性 | 内容 |` 表格 → Column
- "接口链路"表格 → API + Page-API 关系

**button-area.md**
- 每个按钮的子标题下的 `| 属性 | 内容 |` 表格 → Button
- 从 click_result 提取触发的 Modal 名称

### 4.3 API 名称归一化

同一个接口可能在不同文件中以不同形式出现：
- `dataAuthGroupFindListApi`
- `dataAuthGroupFindList`
- `分页查询数据权限组列表（dataAuthGroupFindListApi）`

解析器需要归一化为标准名称（提取括号内或驼峰命名）。

---

## 5. MCP Tool 设计

Tool 围绕"规格查询"场景设计，不是围绕"文档搜索"。

### 5.1 `get_page_spec`

获取页面的完整规格。

```typescript
// 输入
{ pageId: "bombusiness/dataauthgroup" }

// 输出
{
  page: { id, module, title, pageType, route, pageFunction },
  fields: [{ fieldLabel, fieldName, componentType, required }],
  columns: [{ columnTitle, fieldName, displayContent, editable }],
  buttons: [{ buttonName, scope, displayCondition, disabledCondition, clickResult }],
  apis: [{ name, description, scenes: ["查询", "新增"] }]
}
```

### 5.2 `search_pages`

按关键词搜索页面（精确匹配，非语义搜索）。

```typescript
// 输入
{ keyword: "数据权限" }

// 输出
{ results: [{ id, title, module, matchType: "title" | "api" | "field" }] }
```

### 5.3 `analyze_impact` ⭐

**核心价值 Tool。** 分析修改某个业务元素的影响面。

```typescript
// 输入（三种模式）
{ apiName: "dataAuthGroupFindListApi" }
// 或
{ fieldName: "dataAuthName" }
// 或
{ pageId: "bombusiness/dataauthgroup" }

// 输出
{
  target: "dataAuthGroupFindListApi",
  affectedPages: [
    { id: "bombusiness/dataauthgroup", title: "数据权限管理", relation: "直接调用" },
    { id: "bombusiness/businessfieldextension", title: "业务字段扩展", relation: "字段关联" }
  ],
  affectedFields: [
    { fieldLabel: "数据授权名称", fieldName: "dataAuthName", pageTitle: "数据权限管理" }
  ],
  affectedButtons: [
    { buttonName: "查询", pageTitle: "数据权限管理", reason: "触发接口调用" }
  ]
}
```

### 5.4 `check_consistency` ⭐

对比规格文档与代码实现的一致性。

```typescript
// 输入
{ pageId: "bombusiness/dataauthgroup" }

// 输出
{
  issues: [
    {
      type: "missing_in_doc",
      description: "代码中存在字段 'createTime'，但 feature-docs 未记录",
      location: "schema.ts:45"
    },
    {
      type: "missing_in_code",
      description: "feature-docs 记录了字段 'dataAuthLevel'，但代码中不存在",
      location: "search-area.md"
    },
    {
      type: "api_mismatch",
      description: "feature-docs 中的接口 'dataAuthGroupFindListApi' 在代码 service.ts 中不存在",
      location: "main.md:接口链路"
    }
  ]
}
```

**注意**：一致性检查需要读取代码。gant-atlas 不直接解析代码 AST，而是：
1. 通过 `gitnexus` 获取代码中的字段/接口定义（如果可用）
2. 或通过用户传入的代码片段进行对比
3. 或提供 CLI 工具 `atlas check --code-dir ./src` 扫描代码

---

## 6. CLI 设计

```bash
# 配置数据源路径
atlas config set docs.path /path/to/feature-docs

# 全量构建图谱
atlas ingest

# 增量更新（检测变更文件）
atlas sync

# 启动 MCP Server
atlas mcp serve

# 查询页面规格（人类用）
atlas query page bombusiness/dataauthgroup

# 影响面分析（人类用）
atlas impact --api dataAuthGroupFindListApi

# 一致性检查（人类用）
atlas check --page bombusiness/dataauthgroup --code-dir ./packages/ibom/src

# 查看状态
atlas status
```

---

## 7. 与周边系统的关系（最终版）

```
┌─────────────────────────────────────────────────────────────┐
│                        Claude Code                          │
├─────────────────────────────────────────────────────────────┤
│  Skill: feature-change / bug-fix                            │
│  ├─ "读取页面规格" → 调用 atlas.get_page_spec               │
│  ├─ "分析影响面" → 调用 atlas.analyze_impact                │
│  ├─ "检查一致性" → 调用 atlas.check_consistency             │
│  └─ "修改代码" → 基于规格执行修改                           │
├─────────────────────────────────────────────────────────────┤
│  MCP Server: atlas                                          │
│  ├─ get_page_spec                                           │
│  ├─ search_pages                                            │
│  ├─ analyze_impact                                          │
│  └─ check_consistency                                       │
├─────────────────────────────────────────────────────────────┤
│  SQLite: atlas.db                                           │
│  ├─ pages / fields / columns / buttons / apis               │
│  └─ page_apis / field_apis / button_modals                  │
├─────────────────────────────────────────────────────────────┤
│  解析器                                                     │
│  ├─ main.md → Page + API + Modal                            │
│  ├─ search-area.md → Field + API                            │
│  ├─ grid-area.md → Column + API                             │
│  └─ button-area.md → Button + Modal                         │
├─────────────────────────────────────────────────────────────┤
│  feature-docs/ (Markdown 表格)                              │
│  └─ 唯一的业务规格真相源                                     │
└─────────────────────────────────────────────────────────────┘
```

**边界：**
- 不替代 gitnexus（代码关系）
- 不替代 gbrain（语义记忆）
- 不替代 gant-agent（Skill 管理）
- 只替代"用 find + grep 查 feature-docs"的低效方式

---

## 8. 实现优先级

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | 解析器 | 从 Markdown 提取精确规格 |
| P0 | SQLite 存储 | 建表 + CRUD |
| P0 | MCP Server + get_page_spec | 最基本查询 |
| P1 | analyze_impact | 核心价值 |
| P1 | 增量同步 | 检测变更文件，只更新变化部分 |
| P2 | check_consistency | 需要代码侧数据 |
| P2 | CLI | 人类直接使用的命令 |

---

## 9. 开发约定

### 9.1 编码规范

- **文件编码**：所有 Markdown 源文件使用 UTF-8 without BOM。
  - BOM 会导致 `readFileSync` 在首行残留 `﻿`，破坏 frontmatter 和标题解析。
  - 解析器不做 BOM strip，靠规范保证输入干净。
- **表格格式**：单元格内使用 `\|` 转义竖线，反引号代码块需成对闭合。
- **降级策略**：解析器遇到格式错误时记录 `[gant-atlas] ...` 警告到 stderr，跳过当前元素，继续解析后续内容。永不因单文件格式错误导致整个构建失败。
