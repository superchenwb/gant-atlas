# 代码修改规范摘要

修复 Bug 和修改需求时必须遵守的代码规范要点。完整规范见 `.qoder/rules/global.md` 和 `.qoder/rules/style.md`。

---

## 一、国际化函数 tr

`tr` 是全局国际化函数，已在 `procomponents/src/.gant/types.d.ts` 中声明，**无需导入**。

```typescript
// ✅ 正确 - 直接使用
const text = tr('配置名称');

// ❌ 错误 - 不需要导入
import { tr } from 'xxx';
```

---

## 二、交互方法（必须使用 procomponents 封装）

所有消息提示、通知、二次确认等交互方法**必须使用 procomponents 提供的封装版本**，禁止直接使用 antd 原生方法。

| 方法名 | 说明 | 导入方式 |
|--------|------|---------|
| `showMessage` | 轻提示（toast） | `import { showMessage } from 'procomponents'` |
| `showNotification` | 通知提示 | `import { showNotification } from 'procomponents'` |
| `showSuccessNotification` | 成功通知提示 | `import { showSuccessNotification } from 'procomponents'` |
| `showConfirmModal` | 二次确认弹窗 | `import { showConfirmModal } from 'procomponents'` |
| `showModal` | 信息提示弹窗 | `import { showModal } from 'procomponents'` |
| `showValidate` | Grid 数据校验提示 | `import { showValidate } from 'procomponents'` |

```typescript
// ✅ 正确
import { showMessage, showConfirmModal } from 'procomponents';
showMessage('操作成功', { type: 'success' });
showConfirmModal({ title: '确认删除', content: '删除后数据将无法恢复', onOk: () => handleDelete() });

// ❌ 禁止
import { message } from 'antd';
message.success('操作成功');
import { Modal } from 'antd';
Modal.confirm({ title: '确认' });
```

---

## 三、模块导入规范

### 业务包导入 procomponents

统一使用包名 `procomponents`：

```typescript
// ✅ 正确
import { Grid, Button, SchemaForm } from 'procomponents';
import { usePageSearch } from 'procomponents';

// ❌ 错误 - 不要使用相对路径
import { Grid } from '../../procomponents/src/components';
```

### procomponents 内部导入

- 相对路径层级 ≤ 3：使用相对路径
- 相对路径层级 > 3：使用别名 `procomponents/src/`

---

## 四、样式修改规范

### 必须使用 CSS-in-JS（createStyles）

```typescript
import { createStyles } from 'procomponents/src/css-in-js';
// 业务包中:
// import { createStyles } from '@gant/procomponents';

export const useStyles = createStyles(({ css, token, sizeToken }) => {
  const { controlHeight, borderRadius } = sizeToken;
  return {
    container: css`
      height: ${controlHeight}px;
      border-radius: ${borderRadius}px;
      background-color: var(--colorBgAlphaColorContainer);
    `,
  };
});
```

### 必须使用 Token / sizeToken，禁止硬编码

```typescript
// ✅ 正确
padding: ${sizeToken.paddingContentHorizontal}px;
color: ${token.colorText};

// ❌ 错误
padding: 12px;
color: '#000000d9';
```

例外：z-index 可直接使用数值。

### 必须兼容双模式（传统/毛玻璃）

优先使用 CSS Variables，自动适配两种模式：

```typescript
// ✅ 正确 - 使用模式感知 CSS 变量
background: var(--colorBgAlphaColorContainer);
border-radius: var(--borderRadiusCard);

// ❌ 错误 - 手动判断 glassEffect
background: ${glassEffect ? getAlphaColor(token.colorBgContainer, 0.4) : token.colorBgContainer};
```

### 常用模式感知 CSS 变量

| 变量 | 说明 |
|------|------|
| `var(--colorBgAlphaColorContainer)` | 容器背景色 |
| `var(--colorBgSecondAlphaColorContainer)` | 次要容器背景色 |
| `var(--borderRadiusCard)` | 卡片圆角 |
| `var(--glass-border)` | 玻璃边框 |
| `var(--glass-blur)` | 背景模糊 |
| `var(--linear-gradient-background)` | 主色渐变背景 |
