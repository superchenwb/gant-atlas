# 通用问题类型与定位策略

## 一、数据加载问题

### 症状
- 页面打开后表格无数据
- 下拉选择器/放大镜选择器无候选值
- 详情页信息加载为空

### 定位步骤

1. 找到页面的数据加载 Hook（通常为 `useSearch` / `useRequest` / `usePageSearch`）
2. 检查 API 调用参数是否正确
3. 检查响应数据转换逻辑（`afterSearch` / `transformResponse`）
4. 检查 Grid 的 `dataSource` 绑定

### 常见原因

| 原因 | 排查方法 |
|------|---------|
| API 参数缺失或格式错误 | 检查 `searchParams` / `requestData` 构造 |
| 数据转换逻辑丢失 | 检查 `afterSearch` 回调是否被覆盖 |
| Grid 未绑定 dataSource | 检查 `gridManagerRef` 的 `setDataSource` 调用 |
| 分页参数不匹配 | 检查 `pagination` 配置与后端分页参数映射 |

---

## 二、表单提交问题

### 症状
- 表单提交后无反应
- 提交后数据未保存
- 表单校验不通过但无提示

### 定位步骤

1. 找到表单的 `onSubmit` / `handleSubmit` 回调
2. 检查 SchemaForm 的 `schema` 定义（字段类型、校验规则）
3. 检查提交数据的格式转换（`beforeSubmit` / `onValuesChange`）
4. 检查 API 调用是否正确触发

### 常见原因

| 原因 | 排查方法 |
|------|---------|
| schema 字段 componentType 不匹配 | 检查 `componentType` 与实际组件类型 |
| 必填字段校验未配置 | 检查 `required` 和 `rules` 配置 |
| 数据格式转换错误 | 检查 `beforeSubmit` 中字段转换 |
| API 调用未触发 | 检查 `onFinish` / `onSubmit` 回调绑定 |

---

## 三、表格操作问题

### 症状
- 行操作按钮不显示或不可用
- 表格编辑后数据未保存
- 行选择/勾选不生效
- 排序/筛选异常

### 定位步骤

1. 找到 Grid 的 `gridSchema` 定义
2. 检查列定义（`columns`）中的 `cellRenderer` / `valueFormatter`
3. 检查行操作配置（`contextMenuItems` / `rowSelection`）
4. 检查可编辑 Grid 的 `onCellValueChanged` 回调

### 常见原因

| 原因 | 排查方法 |
|------|---------|
| cellRenderer 组件未正确渲染 | 检查 renderer 组件的 props 传递 |
| 行操作权限未配置 | 检查 `contextMenuItems` 的 `visible` / `disabled` 条件 |
| 可编辑 Grid 值变更未处理 | 检查 `onCellValueChanged` 回调 |
| Grid Ref 未正确绑定 | 检查 `gridManagerRef` 的赋值 |

---

## 四、详情页签问题

### 症状
- 详情页子页签不显示
- 子页签内容加载为空
- 页签切换后数据丢失

### 定位步骤

1. 找到详情页的 `detailsMap` 注册
2. 检查 `ContextMenu` 的 `customMenu` 配置
3. 检查 `dynamicCmpProps` 传递的属性
4. 检查子页签组件的懒加载逻辑

### 常见原因

| 原因 | 排查方法 |
|------|---------|
| detailsMap 未注册或 key 错误 | 检查 `detailsMap` 的 key 与菜单配置是否一致 |
| dynamicCmpProps 未正确传递 | 检查父组件的 `dynamicCmpProps` 构造 |
| 子页签组件未导出 | 检查组件的 `export` 和懒加载 `import()` |
| ContextMenu 配置缺失 | 检查 `customMenu` 的子菜单组定义 |

---

## 五、样式/布局问题

### 症状
- 页面布局错位或溢出
- 弹窗/抽屉高度不正确
- 组件间距不一致
- 毛玻璃模式下样式异常

### 定位步骤

1. 检查容器的高度 Hook 选择是否正确
2. 检查 CSS-in-JS 样式定义（`createStyles`）
3. 检查是否使用了硬编码的尺寸/颜色值
4. 检查是否正确使用了 CSS Variables 和 sizeToken

### 常见原因

| 原因 | 排查方法 |
|------|---------|
| 高度 Hook 选择错误 | 检查是否使用了正确的高度 Hook（参考 business/component-grid.md） |
| 硬编码尺寸 | 搜索 `px` 值，确认是否使用了 `sizeToken` |
| 毛玻璃模式未适配 | 检查是否使用了 `var(--colorBgAlphaColorContainer)` 等 CSS 变量 |
| 未使用 createStyles | 确认框架组件是否使用了 CSS-in-JS |

---

## 通用定位流程

```
1. 确定问题类型（从上述五大类中选择）
2. 根据类型找到对应的定位步骤
3. 在代码中搜索相关文件和配置
4. 对比功能清单文档，确认预期行为
5. 定位到具体代码位置和原因
```
