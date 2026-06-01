# Runner API 详细参考

## createTest 函数

```typescript
import { createTest } from '@gantTest';

const test = createTest(name: string, meta: {
  tags: string[];           // 标签数组，如 ['自动生成', '工程变更']
  severity: string;         // blocker|critical|major|minor|trivial|normal
  namespace: string;        // 页面路由命名空间（自动推导路由）
  pageName: string;         // 页面中文名称
});
```

`createTest` 自动完成：
1. 创建 runner fixture
2. 设置 Allure 元数据
3. 按 namespace/pageName 自动解析路由并导航
4. 默认执行 `runner.aiWaitFor('等待页面加载完成')`

## test.run 回调参数

```typescript
test.run(async ({ page, runner, context, expect }) => {
  // page: Playwright Page 对象
  // runner: GantTest Runner（封装了所有操作方法）
  // context: Playwright BrowserContext
  // expect: Playwright expect 断言
});
```

## Runner 方法详细说明

### 元素操作方法

#### runner.click(locator, desc)
点击元素。`desc` 进入 Allure 报告 + AI 兜底提示词。

```typescript
await runner.click(
  page.getByRole('button', { name: '新增' }),
  '新增按钮，打开新增表单弹窗'
);
```

#### runner.fill(locator, value, desc)
填写输入框/文本域。会先清空已有内容。

```typescript
await runner.fill(
  nameField.locator('input:visible').first(),
  'AUTO-TEST-001',
  '名称输入框，输入自动测试名称 AUTO-TEST-001'
);
```

#### runner.hover(locator, desc)
悬停元素。用于触发 Tooltip、下拉菜单等。

```typescript
await runner.hover(
  row.locator('.action-column'),
  '操作列，悬停显示更多操作按钮'
);
```

#### runner.press(locator, key, desc)
在元素上按键。key 为 Playwright Keyboard key 名。

```typescript
await runner.press(
  searchInput,
  'Enter',
  '搜索输入框，按回车触发搜索'
);
```

#### runner.selectOption(locator, value, desc)
选择原生 select 的选项。**Antd Select 不用此方法**（见组件定位策略）。

```typescript
await runner.selectOption(
  nativeSelect,
  'option1',
  '原生下拉框选择选项1'
);
```

#### runner.check(locator, desc) / runner.uncheck(locator, desc)
勾选/取消勾选复选框。

```typescript
await runner.check(
  field.locator('.ant-checkbox-wrapper:visible').first(),
  '启用选项，勾选启用'
);
```

#### runner.dblclick(locator, desc)
双击元素。用于行双击打开详情等场景。

```typescript
await runner.dblclick(
  firstRow,
  '表格第一行，双击打开详情页'
);
```

#### runner.focus(locator, desc)
聚焦元素。用于触发失焦校验等。

```typescript
await runner.focus(
  nameInput,
  '名称输入框，聚焦触发校验'
);
```

### 等待方法

#### runner.waitForElement(locator, state, opts)
等待元素达到指定状态。

```typescript
// 等待可见
await runner.waitForElement(drawer, 'visible', { desc: '新增抽屉' });

// 等待隐藏
await runner.waitForElement(drawer, 'hidden', { desc: '新增抽屉关闭' });
```

#### runner.waitForNetworkIdle(opts)
等待网络空闲，默认超时 15s。

```typescript
await runner.waitForNetworkIdle({ timeout: 15000 });
```

#### runner.waitForResponse(urlPattern, opts)
等待特定 API 响应。

```typescript
await runner.waitForResponse('**/api/ecr/list**', { timeout: 15000 });
```

### AI 智能方法

#### runner.aiWaitFor(desc)
AI 等待条件满足。用于页面加载、异步操作等不确定时机的场景。

```typescript
await runner.aiWaitFor('等待页面加载完成');
await runner.aiWaitFor('等待表格数据渲染完成');
```

#### runner.aiAction(desc)
AI 执行复杂操作。用于滚动、复杂交互等无法精确定位的场景。

```typescript
await runner.aiAction('滚动到表格底部');
await runner.aiAction('在弹窗中找到并点击审批通过的按钮');
```

#### runner.aiAssert(desc)
AI 断言可观察结果。返回 `{ pass: boolean }`。

```typescript
const result = await runner.aiAssert('页面显示保存成功提示');
if (!result?.pass) {
  console.info('未观察到保存成功提示，继续检查');
}
```

**aiAssert 约束**：
- 只断言截图中可直接观察的内容
- 不可观察信息（推理、业务逻辑）用 `console.info()` 记录
- 返回值可判断，但不承载推理说明

## 禁止使用的方法

| 方法 | 原因 |
|------|------|
| `runner.navigateTo()` | createTest 已负责导航 |
| `runner.clickAndWait()` | 隐藏等待时机，易误等 network idle |
| `runner.fillAndWait()` | 同上 |
| `page.goto()` | 同 navigateTo |
| `page.keyboard.press()` | 用 runner.press 替代 |

## Playwright 原生 API 使用边界

### 允许使用（定位和查询）

```typescript
// 定位器
page.locator('.ant-table-wrapper')
locator.locator('.ant-select')
page.getByRole('button', { name: '新增' })
page.getByText('确定')

// 断言（只用于静态/确定性状态）
expect(locator).toBeVisible()
expect(locator).toBeHidden()
expect(locator).toBeEnabled()
expect(locator).toBeDisabled()

// 查询方法
locator.isVisible()
locator.isHidden()
locator.isEnabled()
locator.isDisabled()
locator.count()
locator.textContent()
locator.getAttribute('class')
locator.getAttribute('data-file-id')

// 文件上传（runner 无此封装）
input.setInputFiles('/path/to/file')
```

### 禁止使用（必须用 runner）

```typescript
locator.click()       → runner.click()
locator.fill()        → runner.fill()
locator.check()       → runner.check()
locator.uncheck()     → runner.uncheck()
locator.hover()       → runner.hover()
locator.press()       → runner.press()
locator.dblclick()    → runner.dblclick()
locator.focus()       → runner.focus()
locator.selectOption() → runner.selectOption()
```

## severity 取值

| 值 | 含义 | 使用场景 |
|----|------|---------|
| `blocker` | 致命 | 核心功能完全不可用 |
| `critical` | 严重 | 主要功能异常 |
| `major` | 主要 | 重要功能受限 |
| `normal` | 正常 | 常规功能测试（默认） |
| `minor` | 次要 | 边缘场景 |
| `trivial` | 微小 | UI 细节 |

## Blocker 记录标准

以下情况记录 blocker：
- 文档没有路由，无法推导 namespace
- 功能没有入口
- 字段没有参数名或 data-file-id
- 查询候选值全部无数据
- 真实写操作无安全数据或清理方式

Blocker 命名格式：`{区域}-{具体问题}`
```typescript
// ✅
'查询区-销售产品候选数据无结果'

// ❌
'表格无数据'
```
