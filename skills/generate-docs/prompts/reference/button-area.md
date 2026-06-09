# 按钮区域分析

### 识别方法

按钮区域通常位于页面顶部（主页面）或详情页头部（extra），查找以下特征：

1. **按钮组容器**：包含多个按钮的容器（`<PageGridCard extraLeft/extra>`、`<ButtonBar>`、`<Space>`、`<div>`、`<Button.Group>` 等）
2. **按钮组件**：`AddButton` / `DeleteButton` / `ImportButton` / `ExportButton` / `SubmitButton` / `BaseButton` / `Button` / `Button.EditGroup` / `Button.TreeAdd` 等
3. **权限控制**：`permission` prop / `useAuth` hook / `<Permission>` 包装 / 条件渲染
4. **交互行为**：`onClick` / `onConfirm` / 打开弹出层 / 批量操作
5. **多 Tab 页面按钮**：搜索 `TabsButtonContext.useContainer()` 或 `registerExtraButton`，按钮按 Tab 分别注册，需遍历每个 Tab 的 `left` / `right` 按钮列表

> **关键约定：PageGridCard 的 extra / extraLeft（页面主列表最常用的容器）**
>
> 本项目中 **page-main 页面最常用**的按钮容器是 `PageGridCard`，它通过两个 prop 划分左右按钮区域：
> - **`extra`** = **右侧**按钮区域（通常放 `Button.EditGroup` + `GridConfigTool` 等工具按钮）
> - **`extraLeft`** = **左侧**按钮区域（通常放业务操作按钮，如增/删/状态管理等）
>
> ```tsx
> // PageGridCard 布局约定（项目中最常见的模式）
> <PageGridCard
>   extra={                       // ← 右侧按钮
>     <>
>       <Button.EditGroup {...editHandles} />
>       <GridConfigTool dataId={namespace} gridConfig={gridConfig} />
>     </>
>   }
>   extraLeft={                   // ← 左侧按钮
>     editable ? (
>       <> {/* 编辑模式下的左侧按钮 */} </>
>     ) : (
>       <> {/* 查看模式下的左侧按钮 */} </>
>     )
>   }>
>   <Grid ... />
> </PageGridCard>
> ```
>
> **分析时必须注意**：
> - `extra` 中的按钮放在文档的"右侧按钮组"
> - `extraLeft` 中的按钮放在文档的"左侧按钮组"
> - 不要把 `extra`（右侧）和 `extraLeft`（左侧）搞混

### 常见封装方式

项目中按钮区域的封装方式不统一，需按实际代码识别：

```tsx
// 方式 1：ButtonBar 组件（部分模块使用）
<ButtonBar>
  <AddButton onClick={handleAdd} permission="bom:ebom:add" />
  <DeleteButton onConfirm={handleDelete} batch />
  <ImportButton onImport={handleImport} />
  <ExportButton onExport={handleExport} />
</ButtonBar>

// 方式 2：Space 包裹
<Space>
  <Button type="primary" onClick={handleAdd}>新增</Button>
  <Button onClick={handleDelete}>删除</Button>
</Space>

// 方式 3：直接排列（JSX 中连续多个 Button）
<div className={styles.toolbar}>
  <AddButton />
  <DeleteButton />
  <Button icon={<SettingOutlined />} onClick={handleConfig} />
</div>

// 方式 4：自定义工具栏组件
<Toolbar>
  <AddButton />
  <DropdownButton menu={menuItems} />
</Toolbar>

// 方式 5：TabsButton 按 Tab 注册按钮（多 Tab 主页面专用）
import { TabsButtonContext } from 'procomponents';

const { registerExtraButton } = TabsButtonContext.useContainer();

// 注册到特定 Tab，每个 Tab 的按钮独立
registerExtraButton(ConfigTabsType.featureList, {
  left: [
    <LinkFeatureButton key="link" />,
    <CopyConfigurationButton key="copy" />,
  ],
  right: [
    <InitImportButton key="import" />,
    <ConfigVersionComparisonButton key="compare" />,
  ],
});
```

> **关键区别：** 方式 1-4 的按钮在页面级别渲染（SearchForm 和 Grid 之间或 Grid 上方），方式 5 的按钮通过 `TabsButtonContext` 注入到 **每个 Tab 内部**，切换 Tab 时按钮随之变化。

### 按钮属性提取

不管采用哪种封装方式，每个按钮都要提取：

```yaml
- name: 按钮文本 (tr('xxx') 或 JSX 中的文本)
  component: 使用的组件名（AddButton / DeleteButton / BaseButton / Button 等）
  type: primary / default / danger / dashed / link
  permission: 权限编码（如有）
  display_condition: 显示条件（如有）
  disabled_condition: 禁用条件（如有）
  behavior: open-popup（打开弹出层） / direct-action（直接操作） / navigate（跳转）
  confirm: true / false（是否需要二次确认）
  popup_type: DrawerForm / ModalForm / DrawerTabs / ModalTabs / DrawerSearchGrid（behavior=open-popup 时）
  api: METHOD URL（direct-action 时）
  batch: true / false（是否批量操作）
```

### 特殊按钮类型速查

| 组件名 | 用途 | 典型属性 |
|--------|------|---------|
| `AddButton` | 新增 | `onClick`, `permission` |
| `DeleteButton` | 删除 | `onConfirm`, `batch`, `permission` |
| `ImportButton` | 导入 | `onImport`, `permission` |
| `ExportButton` | 导出 | `onExport`, `permission` |
| `SubmitButton` | 提交 | `onClick` |
| `DropdownButton` | 下拉按钮 | `menu` |
| `Button`（基础） | 通用 | `onClick`, `icon`, `type` |

---

