# 组件定位策略知识库

本文件维护各组件的精确定位策略。**持续补充更新**，每个新发现的组件交互模式都应添加到此处。

## 通用原则

1. **data-file-id 优先**：所有 SearchForm / SchemaForm 字段都通过 `[data-file-id="fieldName"]` 定位字段容器
2. **容器限定范围**：先定位容器（searchForm / drawer / modal），再在容器内找字段
3. **:visible 过滤**：多实例时用 `:visible` 伪类 + `.first()` 或 `.last()` 缩窄
4. **desc 描述精确**：desc 包含候选数据和操作意图，便于 AI 兜底

## SearchForm 查询表单

### 基本定位

```typescript
// 定位查询表单容器
const searchForm = page.locator('form:visible, .ant-form:visible').first();

// 定位查询按钮和重置按钮
const queryButton = page.getByRole('button', { name: /^查\s*询|搜\s*索$/ }).first();
const resetButton = page.getByRole('button', { name: /重\s*置/ }).first();
```

### 字段容器定位模式

```typescript
// 所有字段都先定位 data-file-id 容器
const field = searchForm.locator('[data-file-id="fieldName"]').first();
// fieldName 来自功能文档参数表，不是 label 文本

// ❌ 禁止通过文本标签定位
const field = searchForm.getByText('产品');  // 国际化变化会失效
```

---

## Input / TextArea

```typescript
const field = form.locator('[data-file-id="name"]').first();

// Input
await runner.fill(
  field.locator('input:visible').first(),
  'AUTO-TEST-001',
  '名称输入框，输入测试值 AUTO-TEST-001'
);

// TextArea
await runner.fill(
  field.locator('textarea:visible').first(),
  '自动测试备注内容',
  '备注文本域，输入测试备注'
);

// InputNumber - 同 Input
await runner.fill(
  field.locator('input:visible').first(),
  '100',
  '数量输入框，输入 100'
);

// 清空再输入
await runner.fill(
  field.locator('input:visible').first(),
  '',
  '清空输入框'
);
```

---

## Antd Select

Select 是最常见的复杂组件，需要多步操作：

```typescript
const field = form.locator('[data-file-id="productNode"]').first();
const select = field.locator('.ant-select:visible').first();

// 1. 点击 Select 打开下拉
await runner.click(select, '产品下拉选择器，从推荐文本 S50、四方桌 中选择最可能有数据的产品');

// 2. 等待下拉面板出现
const dropdown = page.locator('.ant-select-dropdown:visible').last();

// 3. 判断有无数据
const empty = dropdown.getByText(/无数据|暂无数据|No Data/i).first();
const enabledOptions = dropdown.locator(
  '[role="option"]:visible:not([aria-disabled="true"]), .ant-select-item-option:visible:not(.ant-select-item-option-disabled)'
);

if (await empty.isVisible()) {
  console.info('产品下拉无数据，记录 blocker');
  await runner.click(page.locator('body'), '关闭下拉');  // 点击空白关闭
} else if ((await enabledOptions.count()) > 0) {
  await runner.click(enabledOptions.first(), '选择第一个可用选项');
  // 选择后下拉自动关闭，等待确认
  await expect(dropdown).toBeHidden({ timeout: 5000 });
} else {
  console.info('下拉未显示可用选项，记录渲染 blocker');
  await runner.click(page.locator('body'), '关闭下拉');
}
```

### SearchSelect（可搜索的 Select）

```typescript
// 先在搜索框输入关键字，再从下拉中选择
await runner.click(select, '点击产品搜索选择器');
const searchInput = field.locator('.ant-select-selection-search-input:visible').first();
await runner.fill(searchInput, 'S50', '产品搜索框输入 S50');
await runner.waitForNetworkIdle({ timeout: 5000 });

// 然后选择下拉中的选项（同上）
```

### 多选 Select

```typescript
await runner.click(select, '多选下拉，打开选项列表');
const dropdown = page.locator('.ant-select-dropdown:visible').last();
const options = dropdown.locator(
  '[role="option"]:visible:not([aria-disabled="true"])'
);

if ((await options.count()) >= 2) {
  await runner.click(options.first(), '选择第一个选项');
  await runner.click(options.nth(1), '选择第二个选项');
}

// 关闭多选下拉 - 点击外部或按 Escape
await runner.press(select, 'Escape', '关闭多选下拉');
```

---

## TreeSelect

```typescript
const field = form.locator('[data-file-id="orgId"]').first();
const treeSelect = field.locator('.ant-select:visible').first();

await runner.click(treeSelect, '组织树选择器，打开树形下拉');
const dropdown = page.locator('.ant-select-dropdown:visible').last();

// 展开节点
const expandIcon = dropdown.locator('.ant-select-tree-treenode-switcher_open, .ant-select-tree-switcher_open').first();
// 或点击展开箭头
const switcher = dropdown.locator('.ant-select-tree-switcher:visible').first();
await runner.click(switcher, '展开第一级树节点');

// 选择叶子节点
const treeNode = dropdown.locator('.ant-select-tree-treenode:visible').first();
await runner.click(treeNode, '选择第一个树节点');
```

---

## LoupeSelect（放大镜弹窗选择器）

LoupeSelect 是项目特有的弹窗选择组件，点击后打开一个搜索弹窗：

```typescript
const field = form.locator('[data-file-id="materialId"]').first();

// 1. 找到放大镜按钮
const loupeButton = field.locator('button:visible, .ant-btn:visible').first();

// 2. 点击打开搜索弹窗
await runner.click(loupeButton, '物料放大镜按钮，打开物料搜索弹窗');

// 3. 定位搜索弹窗
const searchModal = page.locator('.ant-modal:visible, .ant-drawer:visible').last();
await runner.waitForElement(searchModal, 'visible', { desc: '物料搜索弹窗' });

// 4. 在弹窗内搜索
const modalSearchForm = searchModal.locator('form:visible').first();
const modalSearchInput = modalSearchForm.locator('input:visible').first();
await runner.fill(modalSearchInput, '螺栓', '弹窗搜索框输入螺栓');

// 5. 点击弹窗内查询
const modalQueryBtn = searchModal.getByRole('button', { name: /^查\s*询|搜\s*索$/ }).first();
await runner.click(modalQueryBtn, '弹窗内查询按钮');
await runner.waitForNetworkIdle({ timeout: 10000 });

// 6. 选择搜索结果（通常是 Grid 行选择）
const modalGrid = searchModal.locator('.ant-table-wrapper:visible, .ag-root-wrapper:visible').first();
const modalFirstRow = modalGrid.locator('tbody tr:visible, .ag-row:visible').first();

if (await modalFirstRow.isVisible()) {
  // 可能需要行选择 checkbox
  const checkbox = modalFirstRow.locator('.ant-checkbox:visible, input[type="checkbox"]:visible').first();
  if (await checkbox.isVisible()) {
    await runner.click(checkbox, '选择弹窗结果第一行的复选框');
  } else {
    await runner.click(modalFirstRow, '点击弹窗结果第一行');
  }

  // 7. 确认选择
  const confirmBtn = searchModal.getByRole('button', { name: /确\s*定|选\s*择/ }).first();
  await runner.click(confirmBtn, '确认选择按钮');
} else {
  console.info('弹窗搜索无结果，记录 blocker');
}

// 8. 等待弹窗关闭
await runner.waitForElement(searchModal, 'hidden', { desc: '物料搜索弹窗关闭' });
```

---

## DatePicker / RangePicker

```typescript
const field = form.locator('[data-file-id="dateRange"]').first();
const picker = field.locator('.ant-picker:visible').first();

// DatePicker - 点击打开
await runner.click(picker, '日期选择器，打开日期面板');

// 选择今天
const todayCell = page.locator('.ant-picker-cell-today:visible').first();
if (await todayCell.isVisible()) {
  await runner.click(todayCell, '选择今天日期');
}

// RangePicker - 点击开始和结束
await runner.click(picker, '日期范围选择器');
const startCell = page.locator('.ant-picker-cell:visible').nth(0);
await runner.click(startCell, '选择开始日期');
const endCell = page.locator('.ant-picker-cell:visible').nth(10);
await runner.click(endCell, '选择结束日期');
```

---

## Switch

```typescript
const field = form.locator('[data-file-id="enabled"]').first();
const switchEl = field.locator('.ant-switch:visible').first();
await runner.click(switchEl, '启用开关，切换启用状态');
```

---

## Radio / RadioGroup

```typescript
const field = form.locator('[data-file-id="type"]').first();

// 选择特定选项
const targetRadio = field.locator('.ant-radio-wrapper:visible').filter({ hasText: '类型A' }).first();
await runner.click(targetRadio, '类型单选组，选择类型A');
```

---

## Checkbox / CheckboxGroup

```typescript
const field = form.locator('[data-file-id="features"]').first();
const checkbox = field.locator('.ant-checkbox-wrapper:visible').filter({ hasText: '特性1' }).first();
await runner.check(checkbox, '特性复选框，勾选特性1');
```

---

## Grid 表格

### 基本定位

```typescript
// 表格容器
const grid = page.locator('.ant-table-wrapper:visible, .ag-root-wrapper:visible, [role="grid"]:visible').first();

// 数据行
const rows = grid.locator('tbody tr:visible, .ag-row:visible, [role="row"]:visible');
const firstRow = rows.filter({ hasNotText: /^$/ }).first();

// 空态判断
const empty = grid.locator('.ant-table-placeholder:visible, .ant-empty:visible, .ag-no-rows-show:visible').first();
```

### 行操作

```typescript
// 行选择 checkbox
const rowCheckbox = firstRow.locator('.ant-checkbox:visible, input[type="checkbox"]:visible').first();
await runner.click(rowCheckbox, '第一行复选框，选中该行');

// 操作列按钮
const actionBtn = firstRow.locator('button, a, [role="button"]').filter({ hasText: /编辑|修改/ }).first();
await runner.click(actionBtn, '第一行编辑按钮');

// 行双击
await runner.dblclick(firstRow, '第一行双击打开详情');
```

---

## Drawer 抽屉

```typescript
// 打开抽屉后定位
const drawer = page.locator('.ant-drawer:visible').filter({ hasText: '新增' }).last();
await runner.waitForElement(drawer, 'visible', { desc: '新增抽屉' });

// 抽屉内字段 - 限定在 drawer 范围
const nameField = drawer.locator('[data-file-id="name"]').first();

// 关闭抽屉
const closeBtn = drawer.getByRole('button', { name: /^取\s*消|关\s*闭$/ }).first();
await runner.click(closeBtn, '取消并关闭抽屉');
await runner.waitForElement(drawer, 'hidden', { desc: '抽屉关闭' });
```

---

## Modal 弹窗

```typescript
const modal = page.locator('.ant-modal:visible').filter({ hasText: '确认删除' }).last();
await runner.waitForElement(modal, 'visible', { desc: '确认删除弹窗' });

// 确认操作
const okBtn = modal.getByRole('button', { name: /^确\s*定|确\s*认/ }).first();
await runner.click(okBtn, '确认删除');

// 取消操作
const cancelBtn = modal.getByRole('button', { name: /^取\s*消/ }).first();
await runner.click(cancelBtn, '取消删除');
await runner.waitForElement(modal, 'hidden', { desc: '确认删除弹窗关闭' });
```

---

## 二次确认弹窗（showConfirmModal）

procomponents 封装的确认弹窗，使用 antd Modal.confirm 但有自定义样式：

```typescript
// 定位确认弹窗
const confirmModal = page.locator('.ant-modal-confirm:visible, .ant-modal:visible').filter({ hasText: /确认/ }).last();

// 确认
await runner.click(
  confirmModal.getByRole('button', { name: /^确\s*定|确\s*认/ }).first(),
  '确认弹窗中的确认按钮'
);

// 取消
await runner.click(
  confirmModal.getByRole('button', { name: /^取\s*消/ }).first(),
  '确认弹窗中的取消按钮'
);
```

---

## 消息提示（showMessage / showNotification）

```typescript
// 成功提示 - 使用 AI 断言验证
const result = await runner.aiAssert('页面显示保存成功提示');
if (!result?.pass) {
  console.info('未观察到保存成功提示');
}

// 错误提示
const errorResult = await runner.aiAssert('页面显示错误提示信息');
```

---

## Tabs 页签

```typescript
// 主页面 Tabs
const tabs = page.locator('.ant-tabs:visible').first();
const tabItem = tabs.locator('.ant-tabs-tab:visible').filter({ hasText: '变更内容' }).first();
await runner.click(tabItem, '切换到变更内容页签');

// DrawerTabs / ModalTabs 中的 Tabs - 先定位父容器
const drawerTabs = drawer.locator('.ant-tabs:visible').first();
const drawerTabItem = drawerTabs.locator('.ant-tabs-tab:visible').filter({ hasText: '基础信息' }).first();
await runner.click(drawerTabItem, '抽屉中切换到基础信息页签');
```

---

## 新增组件模式补充模板

当发现新的组件交互模式时，按以下格式添加：

```markdown
## [组件名称]

### 特征
- 组件类型描述
- DOM 结构特征
- 特殊交互行为

### 定位策略
```typescript
// 定位代码
```

### 注意事项
- 特殊注意点
```
