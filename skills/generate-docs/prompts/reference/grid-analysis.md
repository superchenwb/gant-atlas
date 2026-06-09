# Grid 深度分析

### Schema 结构

Grid schema 是一个**数组**（`ColumnDefs<any>[]`），每项是一个列定义：

```typescript
const gridSchema: ColumnDefs<any> = [
  // 模式 1：文本列（基础）
  {
    fieldName: 'materialNum',
    title: tr('物料编码'),
  },

  // 模式 2：链接列
  getLinkColumn(
    { fieldName: 'materialNum', title: tr('物料编码') },
    { onClick: (record) => navigate(`/bom/part/detail/${record.id}`) }
  ),

  // 模式 3：CodeList 列（状态/标签）
  getCodeListColumn(
    { fieldName: 'status', title: tr('状态') },
    'MATERIAL_STATUS'  // codeType
  ),

  // 模式 4：用户列
  getUserColumn(
    { fieldName: 'ownerName', title: tr('负责人') },
    { fieldName: 'ownerId' }  // 关联的 ID 字段
  ),

  // 模式 5：日期列
  getDateColumn(
    { fieldName: 'createDate', title: tr('创建日期') },
    'YYYY.MM.DD'  // 格式
  ),

  // 模式 6：数字列
  getNumberColumn(
    { fieldName: 'quantity', title: tr('数量') },
    { precision: 2 }
  ),

  // 模式 7：复选框列
  getCheckboxColumn({ fieldName: 'isActive', title: tr('启用') }),

  // 模式 8：标签列
  getTagColumn(
    { fieldName: 'type', title: tr('类型') },
    { colorMap: { 'A': 'blue', 'B': 'green' } }
  ),

  // 模式 9：层级列（树形指示器）
  getLevelColumn({ fieldName: 'level', title: tr('层级') }),

  // 模式 10：操作列（行操作）
  getOperationColumn({
    title: tr('操作'),
    render: (text, record) => (
      <>
        <EditButton onClick={() => handleEdit(record)} />
        <DeleteButton onConfirm={() => handleDelete(record)} />
      </>
    ),
  }),

  // 模式 11：可编辑列
  {
    fieldName: 'unitPrice',
    title: tr('单价'),
    editConfig: {
      componentType: 'InputNumber',
      rules: [{ required: true, message: tr('请输入单价') }],
      props: { precision: 2, min: 0 },
    },
  },

  // 模式 12：自定义渲染列
  {
    fieldName: 'customField',
    title: tr('自定义'),
    render: (text, record) => <CustomCell value={text} record={record} />,
  },
];
```

**procomponents 提供的列 helper 函数：**

| Helper | 用途 | 参数 |
|--------|------|------|
| `getLinkColumn` | 可点击链接 | `(columnDef, { onClick })` |
| `getCodeListColumn` | 码表状态/标签 | `(columnDef, codeType)` |
| `getUserColumn` | 用户显示（带头像） | `(columnDef, { fieldName: idField })` |
| `getDateColumn` | 格式化日期 | `(columnDef, format)` |
| `getNumberColumn` | 格式化数字 | `(columnDef, { precision })` |
| `getCheckboxColumn` | 布尔复选框 | `(columnDef)` |
| `getTagColumn` | 彩色标签 | `(columnDef, { colorMap })` |
| `getOperationColumn` | 行操作按钮 | `(columnDef)` |
| `getLevelColumn` | 树形/层级 | `(columnDef)` |

**每个列提取：**
- `fieldName`：数据字段键
- `title`：列标题（tr('xxx')）
- `type`：text / link / codeList / user / date / number / checkbox / tag / operation / level / custom
- `source`：framework（helper） / business-component（自定义 render）
- `editable`：true / false（`editConfig` 存在 **且** `editConfig.editable` 为 true / 函数）
- `editConfig.componentType`：编辑组件类型
- `editConfig.editable`：布尔值或回调函数 `(data, params) => boolean`，控制该列是否允许编辑
- `editConfig.rules`：校验规则
- `editConfig.props`：组件属性（可为对象或函数 `(record, params) => props`）
- `data_source`：CodeList / UserSelect / TreeSelect 的 API（业务组件）
- `formatter`：日期格式、数字精度等

**可编辑判断逻辑：**

Grid 列是否可编辑由**两层**决定：

1. **Grid 全局**：Grid 的 `editable` prop（或 `GridContext` 的 `globalEditable`）必须为 `true`，Grid 才进入编辑状态
2. **列级别**：该列的 `editConfig` 存在 **且** `editConfig.editable` 为 `true` 或返回 `true` 的回调函数

```typescript
// 该列可编辑（Grid 全局 editable=true 时生效）
{
  fieldName: 'unitPrice',
  title: tr('单价'),
  editConfig: {
    editable: true,                       // ← 列级别允许编辑
    componentType: 'InputNumber',
    rules: [{ required: true }],
  },
}

// 该列不可编辑（editConfig 存在但 editable 为 false）
{
  fieldName: 'totalPrice',
  title: tr('总价'),
  editConfig: {
    editable: false,                      // ← 列级别禁止编辑
    componentType: 'InputNumber',
  },
}

// 条件编辑：某些行可编辑，某些行不可编辑
{
  fieldName: 'status',
  title: tr('状态'),
  editConfig: {
    editable: (data, params) => data._rowType !== 'add',  // ← 新增行不可编辑状态
    componentType: 'Select',
  },
}
```

### EditConfig 深度分析

```typescript
// 模式 1：基础可编辑字段
{
  fieldName: 'ownerName',
  title: tr('负责人'),
  editConfig: {
    componentType: 'UserSelect',
    rules: [{ required: true }],
    props: { multiple: false },
  },
}

// 模式 2：动态属性的可编辑字段
{
  fieldName: 'deptId',
  title: tr('部门'),
  editConfig: {
    componentType: 'Select',
    // props 可以是函数，返回动态值
    props: (record) => ({
      disabled: !record.orgId,
      options: deptOptions[record.orgId] || [],
    }),
  },
}

// 模式 3：级联编辑（一个编辑触发另一个）
{
  fieldName: 'province',
  title: tr('省份'),
  editConfig: {
    componentType: 'Select',
    onChange: (value, record, api) => {
      // 省份变化时清空城市
      api.setCellValue(record, 'city', null);
    },
  },
}
```

### 单元格编辑数据转换（onCellEditChange / onCellEditingChange）

这两个钩子处理行内编辑期间的数据转换：

```typescript
// 模式 1：onCellEditingChange（编辑中，提交前）
// 用于：将复杂对象解包给编辑组件
const onCellEditingChange = (fieldName, newValue, data) => {
  // UserSelect：将用户对象解包到显示字段
  if (fieldName === 'ownerName') {
    data.ownerName = newValue?.userName || newValue;
    data.ownerId = newValue?.userId;
  }
  // CodeList：将选项解包为 label+value
  else if (fieldName === 'statusName') {
    data.statusName = newValue?.label || newValue;
    data.statusCode = newValue?.value;
  }
  // 嵌套路径：使用 lodash set
  else if (fieldName === 'config.value') {
    set(data, 'config.value', newValue);
  }
};

// 模式 2：onCellEditChange（编辑提交后）
// 用于：级联计算、校验、重新格式化
const onCellEditChange = (fieldName, newValue, data) => {
  // 级联计算：更新依赖字段
  if (fieldName === 'quantity' || fieldName === 'unitPrice') {
    data.totalPrice = (data.quantity || 0) * (data.unitPrice || 0);
  }
  // 校验：拒绝无效值
  if (fieldName === 'discount' && newValue > 1) {
    data.discount = 1;
    showMessage(tr('折扣不能大于1'), { type: 'warning' });
  }
  // 重新格式化：规范化空值
  if (newValue === '') {
    data[fieldName] = undefined;
  }
};
```

**每个可编辑字段的记录格式：**

| 字段 | 编辑组件 | edit_before（原始 -> 编辑） | edit_after（编辑 -> 原始） | 校验 |
|------|---------|----------------------------|---------------------------|------|
| ownerName | UserSelect | `{userId, userName}` -> 显示名 | 选中的用户对象 -> 拆分为 ownerName + ownerId | required |
| statusName | CodeList | `{value, label}` -> 显示标签 | 选中的选项 -> 拆分为 statusName + statusCode | required |
| quantity | InputNumber | number -> number | number -> number | min: 0 |
| totalPrice | - | 自动计算 | 自动计算 | readonly |

### 可编辑 Grid 工具栏（EditGroup）

`EditGroup` 不是页面顶部的功能按钮，而是**可编辑 Grid 的专用操作工具栏**，通常位于 Grid 内部或紧邻 Grid 上方。

```tsx
// EditGroup 是 Button 的静态属性
<Button.EditGroup
  onAdd={handleAddRow}
  onDelete={handleDeleteRows}
  onSave={handleSaveRows}
  onCancel={handleCancelEdit}
  addDisabled={!canEdit}
  deleteDisabled={selectedRows.length === 0}
/>
```

**识别特征：**
1. 组件名为 `Button.EditGroup` 或从业务包导入的 `EditGroup`
2. 位于 Grid 组件附近（上方、下方或 Grid 内部 toolbar 区域）
3. 回调函数名通常包含 Row/Rows（`handleAddRow`、`handleDeleteRows`）

**提取属性：**

```yaml
- component: EditGroup
  actions:
    - add: handleAddRow（新增行）
    - delete: handleDeleteRows（删除选中行）
    - save: handleSaveRows（保存编辑）
    - cancel: handleCancelEdit（取消编辑）
  disabled_conditions:
    addDisabled: !canEdit
    deleteDisabled: selectedRows.length === 0
  related_grid_edit_config: "见上方 EditConfig 配置"
```

**与 EditConfig 的关联：**
- EditGroup 提供**操作入口**（用户点击的按钮）
- EditConfig 提供**编辑行为配置**（哪些字段可编辑、用什么组件编辑）
- 两者通常在同一个页面同时出现

### Grid 操作列（行操作）

操作列通过 `getOperationColumn` 的 **`actions` 数组**配置，每个 action 定义一个操作按钮。

```typescript
getOperationColumn({
  actions: [
    {
      name: tr('编辑'),
      onClick: (params) => handleEdit(params.data),
    },
    {
      name: tr('删除'),
      onClick: (params) => handleDelete(params.data),
      disabled: (params) => params.data.status !== 'DRAFT',
    },
    {
      name: tr('查看'),
      onClick: (params) => handleView(params.data),
      hide: (params) => !params.context.canView,
    },
    {
      name: tr('上传'),
      type: 'upload',
      onUpload: (params, files) => handleUpload(params.data, files),
      uploadProps: { accept: '.pdf,.doc' },
    },
  ],
})
```

**`actions` 数组每项属性：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `name` | `string / ReactNode` | 按钮显示文本 |
| `onClick` | `(params) => void` | 点击回调 |
| `disabled` | `boolean / (params) => boolean` | 是否禁用 |
| `hide` | `boolean / (params) => boolean` | 是否隐藏（默认 false） |
| `type` | `'upload'` | 特殊类型：上传按钮 |
| `uploadProps` | `UploadCustomProps` | 上传组件属性（type='upload' 时） |
| `onUpload` | `(params, files) => void` | 上传完成回调（type='upload' 时） |
| `suppressEditableDisabled` | `boolean` | 是否关闭"编辑状态自动禁用操作"（默认 false） |

**`params` 对象结构：**

```typescript
{
  context: GridContext 值,      // GridContext.Provider 传入的所有值
  globalEditable: boolean,      // Grid 是否处于全局编辑状态
  data: any,                    // 当前行数据
  api: GridApi,                 // AG-Grid API
  column: ColDef,               // 当前列定义
  node: RowNode,                // 当前行节点
}
```

**提取要点：**
- 遍历 `actions` 数组，记录每个 action 的 `name`、`onClick` 目标函数
- `disabled` / `hide` 为函数时记录其条件逻辑
- `onClick` 中的回调通常来自 `GridContext`（`params.context.xxx`）或页面 Hook
- 操作列在 Grid 全局编辑状态下会自动禁用（除非设置 `suppressEditableDisabled: true`）

### 树形 Grid 配置

```typescript
<Grid
  schema={gridSchema}
  treeData={true}
  getDataPath={(data) => data.hierarchyPath}
  useGetDataPathById={true}
/>
```

**提取：** treeData 模式、getDataPath 函数、层级字段。

---


## 单元格编辑数据转换速查

**检测位置：** Grid 组件的 `onCellEditingChange` / `onCellEditChange` prop，或 `hooks/useXxxGridEdit.ts`（单元格编辑 Hook）。

| 模式 | 代码示例 | 输出文档 |
|------|---------|---------|
| UserSelect 解包 | `data.ownerName = newValue.userName; data.ownerId = newValue.userId` | 将用户对象解包为 displayName + id 字段 |
| CodeList 解包 | `data.statusName = newValue.label; data.statusCode = newValue.value` | 将 CodeList 选项拆分为 label + value 字段 |
| 嵌套设置 | `set(data, 'path.field', value)` | 使用 lodash set 设置嵌套路径 |
| 级联计算 | `updateParentTotals(data)` | 编辑后重新计算父行合计 |
| 校验拒绝 | `if (newValue < 0) return false` | 拒绝负值 |
| 空值规范化 | `data.field = newValue || undefined` | 将 falsy 值转为 undefined |

---

## 自定义扩展字段识别

### 识别 Grid 列中的扩展字段

Grid 列通过 `useExtensionFieldSearchAndGridSchema` 注入扩展字段列时，识别方法：

1. **搜索** `getExtensionFieldGridSchema` 或 `useExtensionFieldSearchAndGridSchema` 的返回值
2. 这些列在运行时动态合并到 Grid schema 中，不在静态 `gridSchema` 文件里

### 共享业务组件 Grid 分析策略

部分页面的 Grid schema 不在本地 `schema.ts` 中定义，而是从共享业务组件目录导入：

```typescript
// index.tsx - Grid 的 columns 来自共享业务组件
import { ConfigFeatureListGrid } from '@@ibom/components/configuration/featurelistgrid';

// 而非本地 schema.ts 中的静态导出
```

**分析策略：**

1. **优先在本目录查找** `schema.ts` 或 `schema/` 中的 Grid schema
2. **如本地无 Grid schema**，追溯导入路径到共享业务组件目录（如 `@ibom/src/components/configuration/`）
3. **继续读取共享组件的实际列、操作、编辑规则、弹窗入口**
4. **必须提取最终前端结果**：列标题、字段、可编辑规则、行操作、单元格点击、弹窗和保存逻辑
5. **共享组件路径只作为分析线索，不作为最终输出内容**

### 最终文档要求

- 最终文档中**不要**出现共享组件路径
- 最终文档中**不要**写“该表格来自共享组件”
- 如果共享组件内仍未定位到实际列定义，只能标记：

```text
[待确认] 未在当前可达代码中定位到该表格的实际列定义/操作定义
```

