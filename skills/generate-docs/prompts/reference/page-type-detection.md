# 页面类型检测

## 从代码判断

| 组件模式 | 页面类型 |
|----------|---------|
| `SearchForm` + `Grid` + `ButtonBar` | `page-main`（主页面/列表页） |
| `SearchForm` + `Tabs` / `TabsButton`（多 Tab 切换不同数据视图） | `page-main`（主页面/Tabs 多页签） |
| `ContextMenu` / `ContextDetailCard` / `SchemaForms`（详情） | `page-detail` |
| `DrawerForm` / `ModalForm` 为主 | popup（不覆盖） |
| `DrawerTabs` / `ModalTabs` | popup-tabs（不覆盖） |

> **说明：** `TabsButton` 是 Tabs 在主页面中的一种表现形式（配合 `PageTabsCard` 使用），与 `Tabs` 组件一样用于多 Tab 切换。多 Tab 主页面每个 Tab 下通常有自己的 Grid + 按钮区域，数据通过 `useConfigTabsSearch` 等 Hook 并行加载。

## 从需求判断

| 关键词 | 页面类型 |
|--------|---------|
| "列表"、"查询"、"表格"、"分页"、"search"、"list"、"grid"、"table" | `page-main` |
| "详情"、"detail"、"基本信息"、"页签"、"审批"、"tabs" | `page-detail` |
