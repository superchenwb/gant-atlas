# SearchForm 深度分析

### Schema 结构

SearchForm schema 是一个**对象**（不是数组），键为字段名：

```typescript
const searchSchema: SearchFormSchema = {
  // 模式 1：基础字段
  materialNum: {
    title: tr('物料编码'),
    componentType: 'Input',
  },

  // 模式 2：带操作符的字段（isOperator 模式）
  materialName: {
    title: tr('物料名称'),
    componentType: 'Input',
    operator: 'LIKE',  // EQ / LIKE / GT / LT / GTE / LTE / IN / 等
  },

  // 模式 3：选择器 / CodeList 字段
  status: {
    title: tr('状态'),
    componentType: 'CodeList',
    options: {
      codeType: 'MATERIAL_STATUS',
    },
  },

  // 模式 4：日期范围字段
  createDate: {
    title: tr('创建日期'),
    componentType: 'RangePicker',
    options: {
      // 日期范围联动：disabledDate 控制可选范围
      disabledDate: (current) => current && current > moment().endOf('day'),
    },
  },

  // 模式 5：业务组件字段
  owner: {
    title: tr('负责人'),
    componentType: 'UserSelect',
  },

  // 模式 6：带 wrapperTitle（分组）
  '': {
    wrapperTitle: tr('高级查询'),
    productType: {
      title: tr('产品类型'),
      componentType: 'Select',
    },
  },
};
```

**每个字段提取：**
- `key`：对象键名
- `title`：显示标签（tr('xxx')）
- `componentType`：Input / Select / CodeList / UserSelect / DatePicker / RangePicker / TreeSelect / AutoComplete / 等
- `operator`：EQ / LIKE / GT / LT / GTE / LTE / IN / 等（isOperator 模式）
- `required`：true / false
- `defaultValue`：初始值
- `placeholder`：占位文本
- `options.props`：传递给组件的额外属性
- `options.codeType`：CodeList 字段的码表类型
- `options.disabledDate` / `options.disabledDateTime`：日期限制

### 查询字段控件类型命名

查询区域文档中的“控件类型”必须按源码组件类型准确命名，不能把所有可选字段笼统写成“选择器”。

| 源码识别 | 文档控件类型固定写法 | 交互说明 |
|----------|----------------------|----------|
| `componentType: 'Select'` | 下拉选择器 | 用户通过下拉列表选择值；如有 `mode: 'multiple'`、`options.multiple` 或多选配置，补充说明支持多选 |
| `componentType: 'LoupeSelect'` 且 `hasOpen: true` 或 `options.hasOpen: true` | 放大镜选择器（支持下拉选择和放大镜弹窗选择） | 用户可以直接展开下拉选择，也可以点击放大镜打开弹窗/抽屉选择 |
| `componentType: 'LoupeSelect'` 且未配置 `hasOpen: true` | 放大镜选择器（仅支持放大镜弹窗选择） | 下拉列表不展开，用户需要点击放大镜打开弹窗/抽屉选择 |
| 自定义业务组件内部渲染 `LoupeSelect` | 放大镜选择器（按实际 `hasOpen` 能力注明） | 继续读取该业务组件实现；确认是否支持下拉展开和弹窗选择 |

**LoupeSelect 判定规则：**

- `LoupeSelect` 的默认能力是 `hasOpen = false`，文档必须写为“放大镜选择器（仅支持放大镜弹窗选择）”。
- 只有源码明确传入 `hasOpen: true`（包括 schema 的 `options.hasOpen`、组件 props 的 `hasOpen`）时，才写为“放大镜选择器（支持下拉选择和放大镜弹窗选择）”。
- 若查询 schema 只出现自定义组件名（如 `XxxLoupeSelect`），必须继续查该组件实现；无法确认 `hasOpen` 时写“放大镜选择器（下拉能力待确认，支持放大镜弹窗选择）”。
- 输出“说明”列时要补充弹窗/抽屉的选择结果如何回填当前查询字段；如果源码有 `labelInValue`、多选或对象值回填，也要写清楚值形态。

### advance 模式与快捷搜索

`SearchForm` 可能同时配置 `mode="advance"` 和 `inputSearchProps`：

```tsx
<SearchForm
  mode="advance"
  schema={searchSchema}
  inputSearchProps={{ placeholder: '请输入编码或名称进行搜索' }}
/>
```

提取时必须区分三类字段：

| 类型 | 识别方式 | 输出规则 |
|------|----------|----------|
| 快捷搜索字段 | `inputSearchProps` / `inputSearchProps.placeholder` | 单独描述为"快捷查询字段"或放在查询概述中；如果源码没有 key，不要猜测接口字段名 |
| 普通 schema 字段 | `schema` 顶层字段，且没有 wrapper/group/动态扩展标记 | 只列在普通查询字段中 |
| 高级/扩展字段 | `wrapperTitle` 分组、空 key 嵌套字段、`useExtensionFieldSearchAndGridSchema` 等动态注入 | 只列在高级查询字段中 |

**去重规则：**

- 同一个字段 key 不允许同时出现在"普通查询字段"和"高级查询字段"。
- 如果 `mode="advance"` 但源码没有显式分组，不能把全部 schema 字段复制一份到高级查询字段；应列一次，并在高级查询字段处写"无显式高级字段"或仅描述动态扩展字段。
- `inputSearchProps` 只表示查询框能力，不等于 `searchSchema` 中的字段；除非源码明确提供字段名，否则不要把它映射为具体 API 参数。

### Normal 模式 vs isOperator 模式

| 特性 | Normal 模式 | isOperator 模式 |
|------|-------------|-----------------|
| 用法 | `<SearchForm schema={searchSchema} />` | `<SearchForm schema={searchSchema} isOperator />` |
| 字段命名 | `fieldName` | `fieldName`（自动）或 `fieldName_operator` |
| operator 属性 | 不使用 | 每个字段显式声明：`operator: 'LIKE'` |
| 日期范围 | RangePicker 作为单个字段 | 拆分为 `startDate` + `endDate` 并带操作符 |
| 值格式 | 直接值 | `{ fieldName, value, operator }` 数组 |

### 字段依赖检测

在 SearchForm schema 或父组件中查找依赖联动：

```typescript
// 模式 1：suppressDependencieChangeData（阻止自动清空）
const searchSchema = {
  orgId: {
    title: tr('组织'),
    componentType: 'TreeSelect',
    options: {
      // 为 true 时，变更此字段不会自动清空依赖字段
      suppressDependencieChangeData: true,
    },
  },
  deptId: {
    title: tr('部门'),
    componentType: 'Select',
    options: {
      // 选项基于 orgId 动态加载
      params: { orgId: '${orgId}' },  // 模板引用另一个字段
    },
  },
};

// 模式 2：Schema 中的自定义 onChange 处理器（SearchForm 中较少见）
// 通常在 usePageSearch 转换中处理

// 模式 3：URL 参数初始化
const initSearchParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    materialNum: params.get('materialNum') || undefined,
  };
};
```

**需要记录的依赖类型：**
- `cascade-clear`：字段 A 变化时清空字段 B
- `cascade-load`：字段 A 变化时重新加载字段 B 的选项
- `cascade-disable`：字段 B 根据字段 A 启用/禁用
- `cascade-assign`：字段 B 从字段 A 自动计算值
- `url-init`：从 URL 参数初始化字段

### 字段变更数据转换（onChange / onFormValueChange）

SearchForm 字段值变化时（非提交时），也可能存在数据转换逻辑。检测以下位置：

```typescript
// 模式 1：SearchForm 组件级别的 onChange / onFormValueChange
<SearchForm
  schema={searchSchema}
  onChange={(key, value, allValues) => {
    // 字段值变化时的实时转换
    if (key === 'orgId') {
      // 例如：组织变化时，对部门字段进行转换
      return { ...allValues, deptId: undefined, orgName: value?.name };
    }
  }}
  onFormValueChange={(changedValues, allValues) => {
    // 类似 onChange，但接收的是变化的对象
    const { materialType } = changedValues;
    if (materialType) {
      // 根据物料类型转换其他字段的默认值或选项
      return { ...allValues, categoryCode: materialType === 'A' ? 'DEFAULT_A' : undefined };
    }
  }}
/>

// 模式 2：Schema 字段级别的 options.onChange（较少见）
const searchSchema = {
  status: {
    title: tr('状态'),
    componentType: 'Select',
    options: {
      onChange: (value, form) => {
        // 状态变化时联动转换
        form.setFieldsValue({ subStatus: value === 'ACTIVE' ? 'NORMAL' : undefined });
      },
    },
  },
};

// 模式 3：父组件通过 ref 或 state 监听并转换
const [searchParams, setSearchParams] = useState({});
const handleSearchChange = (values) => {
  // 实时转换搜索参数
  const transformed = {
    ...values,
    keyword: values.keyword?.trim().toUpperCase(),
  };
  setSearchParams(transformed);
};
```

**字段变更转换与查询提交转换的区别：**

| 维度 | 字段变更转换（onChange） | 查询提交转换（onSearch） |
|------|------------------------|------------------------|
| 触发时机 | 单个字段值变化时实时触发 | 点击查询按钮或触发搜索时 |
| 检测位置 | SearchForm 的 `onChange` / `onFormValueChange` prop | `usePageSearch` 回调、`onSearch` prop |
| 影响范围 | 通常只影响当前表单值 | 影响最终 API 请求参数 |
| 典型用途 | 字段联动清空、实时格式化、联动赋值 | 参数组装、嵌套提取、格式转换 |

**需要记录的字段变更转换：**
- `trim` / `toUpperCase` / `toLowerCase` — 实时文本格式化
- 字段 A 变化时清空/重置字段 B — 联动清空
- 字段 A 变化时给字段 B 赋计算值 — 联动赋值
- 字段值变化时动态修改其他字段的 options — 联动选项

---

### 查询提交数据转换

在 `usePageSearch` 回调中查找所有转换逻辑：

```typescript
const { onSearch } = usePageSearch(async (filterInfo, pageInfo) => {
  // 1. 字段替换
  const { productNodeId, ...rest } = filterInfo;
  const productNodeCode = productNodeId?.nodeCode;

  // 2. 日期范围拆分
  const { dateRange, ...others } = rest;
  const [startDate, endDate] = dateRange || [];

  // 3. 嵌套提取
  const categoryCode = filterInfo?.category?.code;

  // 4. WhereList 转换（后端需要数组格式时）
  const whereList = Object.entries(filterInfo)
    .filter(([_, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ({ fieldName: k, value: v, operator: 'EQ' }));

  // 5. 空值处理
  const cleaned = Object.fromEntries(
    Object.entries(filterInfo).map(([k, v]) => [k, v === '' ? undefined : v])
  );

  const params = {
    ...cleaned,
    productNodeCode,
    productNodeId: undefined,
    startDate,
    endDate,
    dateRange: undefined,
  };

  return await api.search(params);
});
```

**每一步转换都要记录：**

| 步骤 | 转换前 | 转换后 | 说明 |
|------|--------|--------|------|
| 1 | `filterInfo.productNodeId` | `productNodeCode` | 从嵌套对象中提取 nodeCode |
| 2 | `filterInfo.dateRange` | `startDate`, `endDate` | 拆分日期范围数组 |
| 3 | `filterInfo.category` | `categoryCode` | 从嵌套对象中提取 code |
| 4 | 普通对象 | `whereList` 数组 | 转换为后端查询格式 |
| 5 | `''` | `undefined` | 清理空字符串 |

---


## 查询数据转换速查

**检测位置：** `hooks/useXxxSearch.ts`（`usePageSearch` 回调函数内）、`index.tsx`（`onSearch` 或 `handleSearch` 函数）、SearchForm 的 `onSearch` prop。

| 模式 | 代码示例 | 输出文档 |
|------|---------|---------|
| WhereList 转换 | `Object.entries(filterInfo).map(([k,v]) => ({fieldName:k, value:v, operator:'EQ'}))` | 将 filterInfo 转为 whereList 数组格式 |
| 嵌套提取 | `filterInfo?.productNodeId?.nodeCode` | 从嵌套的 productNodeId 对象中提取 nodeCode |
| 字段替换 | `{ ...filterInfo, productNodeCode, productNodeId: undefined }` | 用 productNodeCode 替换 productNodeId，移除原字段 |
| 日期范围拆分 | `const [startDate, endDate] = filterInfo.dateRange` | 将 dateRange 拆分为 startDate/endDate |
| 数组转字符串 | `tags.join(',')` | 将 tags 数组转为逗号分隔字符串 |
| 空值转 undefined | `value === '' ? undefined : value` | 将空字符串转为 undefined |
| URL 参数初始化 | `urlSearchParams.get('materialNum')` | 从 URL 查询参数初始化 |

---

## 自定义扩展字段识别

部分页面的 SearchForm schema 会通过 Hook 动态注入业务自定义扩展字段，而非完全静态定义。

### 识别特征

在页面入口文件（`index.tsx`）中查找：

```typescript
// 特征 1：导入 useExtensionFieldSearchAndGridSchema
import { useExtensionFieldSearchAndGridSchema } from '@@ibom/hooks/extensionfields';

// 特征 2：调用 Hook 获取合并了扩展字段的 schema
const { extensionFieldSearchSchema, getExtensionFieldSearchParams } = useExtensionFieldSearchAndGridSchema(
  businessCode,        // 业务编码
  { record, searchSchema }  // 基础 schema + 扩展字段筛选条件
);

// 特征 3：SearchForm 传入的是 extensionFieldSearchSchema 而非原始 searchSchema
<SearchForm schema={extensionFieldSearchSchema} ... />

// 特征 4：搜索提交时使用 getExtensionFieldSearchParams 分离参数
const { filterInfo, whereList } = getExtensionFieldSearchParams(params);
```

### 分析策略

1. **识别基础字段**：读取 `schema.ts` 中定义的 `searchSchema`，这些是页面静态定义的字段
2. **识别扩展字段**：`extensionFieldSearchSchema` 在运行时合并了扩展字段，需标注"含扩展字段"
3. **参数分离**：`getExtensionFieldSearchParams` 将搜索参数分离为基础字段（`filterInfo`）和扩展字段（`whereList`），记录分离逻辑
4. **记录 businessCode**：用于查找对应的扩展字段配置

### 输出格式

在 search_area 的 YAML 输出中补充：

```yaml
extension_fields:
  enabled: true
  business_code: FeatureTable
  filter_record: { featureType: 'E' }
  param_splitter: getExtensionFieldSearchParams  # 参数分离函数
```
