# Runner API 详细参考

## createTest 函数

```typescript
import { createTest } from '@gantTest';

const test = createTest(name: string, meta: {
  tags: string[];           // 标签数组，如 ['交互生成', '工程变更']
  severity: string;         // blocker|critical|major|minor|trivial|normal
  namespace: string;        // 页面路由命名空间（从本地路由 maps.ts 获取）
  pageName: string;         // 页面中文名称
});
```

`createTest` 自动完成：
1. 创建 runner fixture
2. 设置 Allure 元数据
3. 按 namespace/pageName 自动解析路由并导航
4. 自动等待页面加载完成（内置 waitFor，无需手动调用）

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

所有元素操作均采用 **Playwright 定位器优先 → AI 识别降级** 的两层策略，每个操作自动记录 Allure 步骤。

#### runner.click(locator, desc)
点击元素。

```typescript
await runner.click(page.getByRole('button', { name: '新增' }), '页面右上角的新增按钮');
await runner.click(page.getByText('基础规范库'), '顶部导航栏的基础规范库');
await runner.click(page.locator('.ant-drawer-mask'), '右侧抽屉的遮罩层');
```

#### runner.fill(locator, value, desc)
填写输入框/文本域。会先清空已有内容。

```typescript
await runner.fill(page.getByLabel('属性名称:'), '11111', '属性名称输入框');
```

#### runner.hover(locator, desc)
悬停元素。用于触发 Tooltip、下拉菜单等。

```typescript
await runner.hover(page.getByRole('menuitem', { name: '更多操作' }), '更多操作菜单');
```

#### runner.press(locator, key, desc)
在元素上按键。key 为 Playwright Keyboard key 名，如 `Enter`、`Tab`、`Escape`。

```typescript
await runner.press(page.getByLabel('搜索'), 'Enter', '搜索输入框按回车');
```

#### runner.selectOption(locator, value, desc)
选择下拉选项。

```typescript
await runner.selectOption(page.getByLabel('类型:'), 'normal', '类型下拉框');
```

#### runner.check(locator, desc) / runner.uncheck(locator, desc)
勾选/取消勾选复选框。

```typescript
await runner.check(page.getByLabel('启用'), '启用复选框');
await runner.uncheck(page.getByLabel('只读'), '只读复选框');
```

#### runner.dblclick(locator, desc)
双击元素。

#### runner.focus(locator, desc)
聚焦元素。

### AI 专属方法

#### runner.aiAssert(assertionDesc)
AI 语义断言，对当前页面进行语义判断。

```typescript
const result = await runner.aiAssert('页面是否显示保存成功提示');
// result: { pass: boolean; thought: string | undefined; message: string | undefined } | undefined
if (result?.pass) { /* 断言通过 */ }
```

#### runner.aiWaitFor(conditionDesc)
AI 条件等待，超时 15 秒，检查间隔 3 秒。不抛异常，返回 `true/false`。

```typescript
const ready = await runner.aiWaitFor('等待页面加载完成');
const visible = await runner.aiWaitFor('弹窗是否已出现');
```

> **谨慎使用**：`aiWaitFor` 是耗时操作（最多 15 秒），仅用于非网络驱动的异步场景，如：等待轮询结果、等待非接口驱动的 UI 变化。大多数场景下元素操作方法已内置等待，无需手动等待。

#### runner.aiAction(actionDesc)
执行任意 AI 描述操作，用于无法通过 Playwright 定位器描述的复杂交互。

```typescript
await runner.aiAction('点击页面右上角关闭弹窗的 X 按钮');
await runner.aiAction('滚动到页面底部');
```

## 禁止使用的方法

| 方法 | 原因 |
|------|------|
| `runner.navigateTo()` | createTest 已负责导航 |
| `runner.clickAndWait()` | 隐藏等待时机，易误等 network idle |
| `runner.fillAndWait()` | 同上 |
| `page.goto()` | 同 navigateTo |

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

// 等待方法（Playwright 原生等待允许使用）
page.waitForSelector('.ant-modal')
page.waitForLoadState('networkidle')
page.waitForResponse('**/api/endpoint')
locator.waitFor()

// 文件上传（runner 无此封装）
input.setInputFiles('/path/to/file')
```

### 禁止使用（必须用 runner）

```typescript
locator.click()        → runner.click()
locator.fill()         → runner.fill()
locator.check()        → runner.check()
locator.uncheck()      → runner.uncheck()
locator.hover()        → runner.hover()
locator.press()        → runner.press()
locator.dblclick()     → runner.dblclick()
locator.focus()        → runner.focus()
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
