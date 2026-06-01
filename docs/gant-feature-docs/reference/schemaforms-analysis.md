# SchemaForms（表单）深度分析

### 表单 Schema 结构

表单 schema 是一个**对象**（与 SearchForm 相同，但用于数据录入）：

```typescript
const formSchema: FormSchema = {
  // 模式 1：基础字段
  materialNum: {
    title: tr('物料编码'),
    componentType: 'Input',
    required: true,
  },

  // 模式 2：带校验规则的字段
  email: {
    title: tr('邮箱'),
    componentType: 'Input',
    options: {
      rules: [
        { required: true, message: tr('请输入邮箱') },
        { type: 'email', message: tr('邮箱格式不正确') },
      ],
    },
  },

  // 模式 3：带依赖的字段（级联）
  orgId: {
    title: tr('组织'),
    componentType: 'TreeSelect',
    options: {
      // 此字段变更时触发依赖逻辑
      onChange: (value, form) => {
        form.setFieldsValue({ deptId: null });
      },
    },
  },
  deptId: {
    title: tr('部门'),
    componentType: 'Select',
    options: {
      // 基于 orgId 动态加载选项
      loadOptions: (form) => fetchDepts(form.getFieldValue('orgId')),
    },
  },

  // 模式 4：只读 / 禁用条件
  status: {
    title: tr('状态'),
    componentType: 'CodeList',
    options: {
      props: (form) => ({
        disabled: form.getFieldValue('isLocked'),
      }),
    },
  },

  // 模式 5：隐藏字段
  id: {
    componentType: 'Input',
    options: {
      props: { type: 'hidden' },
    },
  },
};
```

### onFormValueChange 深度分析

```typescript
const onFormValueChange = (changedValues, allValues, form) => {
  // 模式 1：联动清空
  if ('orgId' in changedValues) {
    form.setFieldsValue({ deptId: null, teamId: null });
  }

  // 模式 2：联动加载（重新加载选项）
  if ('type' in changedValues) {
    const type = changedValues.type;
    // 基于 type 重新加载分类选项
    reloadCategoryOptions(type);
  }

  // 模式 3：联动赋值
  if ('firstName' in changedValues || 'lastName' in changedValues) {
    const { firstName, lastName } = allValues;
    form.setFieldsValue({
      fullName: `${firstName || ''} ${lastName || ''}`.trim(),
    });
  }

  // 模式 4：条件禁用/启用
  if ('hasSubItems' in changedValues) {
    form.setFieldDisabled('subItemCount', !changedValues.hasSubItems);
  }

  // 模式 5：条件显示/隐藏（通过 schema 变更）
  if ('category' in changedValues) {
    const category = changedValues.category;
    // 动态更新 schema 以显示/隐藏字段
    setDynamicSchema(getSchemaByCategory(category));
  }

  // 模式 6：校验触发
  if ('password' in changedValues || 'confirmPassword' in changedValues) {
    form.validateFields(['confirmPassword']);
  }
};
```

**每条联动都要记录：**

| 触发字段 | 受影响字段 | 类型 | 逻辑 |
|---------|-----------|------|------|
| orgId | deptId, teamId | cascade-clear | org 变化时清空依赖字段 |
| type | category options | cascade-load | 基于 type 重新加载分类选项 |
| firstName, lastName | fullName | computed-assign | 拼接为全名 |
| hasSubItems | subItemCount | conditional-disable | 仅当有子项时启用计数 |
| category | 动态字段 | conditional-show | 根据分类显示不同字段 |

### dependencies 字段联动（Schema 级别）

部分表单使用 `dependencies` 属性进行声明式联动：

```typescript
const formSchema = {
  paymentType: {
    title: tr('付款方式'),
    componentType: 'Select',
  },
  creditCardNo: {
    title: tr('信用卡号'),
    componentType: 'Input',
    // 仅在 paymentType === 'CREDIT_CARD' 时显示
    dependencies: ['paymentType'],
    options: {
      props: (form) => ({
        style: {
          display: form.getFieldValue('paymentType') === 'CREDIT_CARD' ? 'block' : 'none',
        },
      }),
    },
  },
};
```

---


## 表单值变更数据转换速查

**检测位置：** `base/schema.ts` 或 `schema.ts` 中的 `onFormValueChange`、`index.tsx` 中的 `form` 操作逻辑、`hooks/useXxxForm.ts`（表单逻辑 Hook）。

| 模式 | 代码示例 | 输出文档 |
|------|---------|---------|
| 联动清空 | `if (changedValues.orgId) form.setFieldsValue({ deptId: null })` | orgId 变化时清空 deptId |
| 动态加载 | `if (changedValues.type) reloadOptions(changedValues.type)` | 基于 type 重新加载依赖选项 |
| 联动赋值 | `form.setFieldsValue({ fullName: first + ' ' + last })` | 从 first+last 自动计算 fullName |
| 条件禁用 | `setFieldDisabled('fieldB', !changedValues.fieldA)` | 仅当 fieldA 有值时启用 fieldB |
| 条件显示 | `setDynamicSchema(getSchemaByCategory(category))` | 根据分类显示不同字段 |
| 校验触发 | `form.validateFields(['confirmPassword'])` | 重新校验依赖字段 |

---

## 自定义扩展字段识别

### 表单中的扩展字段

SchemaForms 中使用扩展字段的模式通常通过 `useExtensionFieldSearchAndGridSchema` 或其变体注入：

1. **搜索** 页面中使用 `extensionFieldFormSchema` 或类似的变量名
2. **表单 schema** 中通过 `...baseSchema` + `...extensionFields` 合并的动态字段
3. **识别策略**：与 SearchForm 扩展字段类似，标注哪些字段来自基础 schema，哪些来自扩展配置

### 输出格式

在表单 schema 分析中补充：

```yaml
extension_fields:
  enabled: true / false
  hook: useExtensionFieldSearchAndGridSchema  # 注入 Hook
  business_code: FeatureTable
```

---


