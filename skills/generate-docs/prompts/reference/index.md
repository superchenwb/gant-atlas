# 参考索引

本文档是 `gant-atlas-generate` skill 的参考入口。[SKILL.md](../SKILL.md) 负责三模式流程编排，`reference/` 下的文件分为两类：

- 分析规格文件：定义页面文档写什么、如何拆分、如何映射路径
- 代码识别方法文件：定义如何从现有代码中识别字段、按钮、表格、弹窗和联动

## 先看什么

### 1. 判定模式

先回到 [SKILL.md](../SKILL.md) 按用户意图判定：

- 模式 A：生成页面功能文档
- 模式 B：读取页面功能文档
- 模式 C：更新页面功能文档

### 2. 判定页面类型

需要判断页面是主页面还是详情页时，读取：

- [page-type-detection.md](./page-type-detection.md)

### 3. 确认文档路径和输出规则

需要确认页面目录和文档目录映射、读取文档规则、更新文档规则时，读取：

- [output-generation.md](./output-generation.md)

### 4. 生成页面文档内容

主页面使用：

- [page-main-spec.md](./page-main-spec.md)

详情页使用：

- [page-detail-spec.md](./page-detail-spec.md)

## 代码识别参考

当需要从代码中提取页面事实时，按区域读取以下文件：

| 场景 | 参考文件 |
|------|---------|
| 查询区域 | [searchform-analysis.md](./searchform-analysis.md) |
| 表格区域 | [grid-analysis.md](./grid-analysis.md) |
| 表单 / 详情字段 | [schemaforms-analysis.md](./schemaforms-analysis.md) |
| 按钮区域 | [button-area.md](./button-area.md) |
| 页面结构 | [file-structure.md](./file-structure.md) |
| Hooks 与数据流 | [hooks-patterns.md](./hooks-patterns.md) |
| 业务组件 / API / 权限 | [misc-detection.md](./misc-detection.md) |

## 模板入口

主页面模板：

- `templates/page-main/main.md`
- `templates/page-main/search-area.md`
- `templates/page-main/button-area.md`
- `templates/page-main/grid-area.md`
- `templates/page-main/other-features.md`

详情页模板：

- `templates/page-detail/main.md`
- `templates/page-detail/base-info-tab.md`
- `templates/page-detail/header-buttons.md`
- `templates/page-detail/sub-tab.md`

复杂按钮模板：

- `templates/common/button-function.md`

通用弹窗模板：

- `templates/common/popup.md`

## 当前 skill 约束

1. 文档路径固定映射到 `ai-harness-root/docs/<package>/<src-relative-path>/`
2. 不依赖历史菜单映射文件
3. 不输出自动化协议
4. 更新文档时按受影响文件整篇重写
