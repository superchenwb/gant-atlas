# gant-atlas

业务知识图谱引擎 — 将 Markdown 功能清单解析为可查询的业务关系图，提供 CLI 工具和 MCP Server 两种使用方式。

## 安装

```bash
pnpm install
pnpm run build
```

Node.js >= 22  required.

## 功能清单目录结构

功能清单以 Markdown 文件组织，按模块和页面分层：

```
feature-docs/
├── bombusiness/
│   ├── dataauthgroup/
│   │   ├── main.md          # 页面概述（页面类型、路径、功能）
│   │   ├── search-area.md   # 查询区域字段
│   │   ├── grid-area.md     # 表格列定义
│   │   └── button-area.md   # 按钮操作
│   └── ...
└── ...
```

每个页面目录必须包含 `main.md`。其他区域文件可选。支持两种表格格式：

- **Key-value 格式**：`| 属性 | 内容 |`，用于 `main.md`、`search-area.md`
- **Flat 格式**：标准表头行表格，用于 `grid-area.md`、`button-area.md`

页面也可以通过 `custom.yml` 覆盖默认配置（页面标题、路径、文件映射等）。

## CLI 使用

### 导入功能清单

```bash
# 首次导入
pnpm run dev ingest --docsPath ./feature-docs --db ./business-graph.db

# 增量更新（仅变更页面会重新解析）
pnpm run dev ingest --docsPath ./feature-docs --db ./business-graph.db

# 强制全量重建
pnpm run dev ingest --docsPath ./feature-docs --db ./business-graph.db --force
```

### 查询页面规格

```bash
pnpm run dev query page bombusiness/dataauthgroup --db ./business-graph.db
```

### 验证数据一致性

```bash
# 仅检查功能清单内部一致性
pnpm run dev validate --db ./business-graph.db

# 同时与代码目录做映射检查（Semantic Mapper）
pnpm run dev validate --db ./business-graph.db \
  --codeDir ./src/packages/ibom/src \
  --routesFile ./src/maps.ts
```

`validate` 在发现问题时以非零状态码退出，适合集成到 CI/CD。

### 代码映射（Semantic Mapper）

```bash
pnpm run dev map \
  --codeDir ./src/packages/ibom/src \
  --routesFile ./src/maps.ts \
  --db ./business-graph.db
```

扫描代码中的路由、schema、services，与功能清单建立映射关系，输出匹配情况和差异报告。

## MCP Server

### 启动

```bash
# 方式一：pnpm script（使用编译后的 dist/）
pnpm run mcp --config ./projects.json

# 方式二：直接运行
node dist/index.js mcp serve --config ./projects.json
```

`projects.json` 示例：

```json
[
  {
    "id": "yadea-wiki",
    "name": "Yadea Wiki",
    "docsPath": "./feature-docs"
  }
]
```

每个项目会自动在 `docsPath` 同级目录下创建 `.gant/business-graph.db`。也可以通过 `dbPath` 字段显式指定。

### 可用工具

| 工具 | 功能 |
|------|------|
| `get_page_spec` | 获取指定页面的完整规格（字段、表格列、按钮、API） |
| `search_pages` | 按关键词搜索页面 |
| `analyze_impact` | 分析修改某个接口/字段会影响哪些页面 |
| `check_consistency` | 检查数据一致性问题（空字段、孤儿 API、字段/API 不匹配等） |
| `list_projects` | 列出所有已配置的项目 |

## 开发

```bash
# 运行测试
pnpm run test

# 运行单个测试文件
pnpm exec vitest run tests/graph/builder.test.ts

# 开发模式运行 CLI
pnpm run dev <command> [options]
```

## 许可证

MIT
