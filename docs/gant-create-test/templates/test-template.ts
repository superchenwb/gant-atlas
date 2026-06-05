import { createTest } from '@gantTest';

/**
 * 测试脚本模板
 *
 * 使用说明：
 * 1. 替换 {pageName} 为页面中文名称
 * 2. 替换 {area} 为功能区域（search/grid/modal/drawer 等）
 * 3. 替换 {scenario} 为具体场景描述
 * 4. 替换 {namespace} 为页面路由命名空间（从本地路由 maps.ts 获取）
 * 5. 按照 runner API 编写测试步骤
 * 6. 每个操作必须有 desc 参数（Allure 步骤 + AI 兜底提示词）
 * 7. 元素操作方法内置等待，无需手动 waitFor
 */
const test = createTest('{pageName}-{area}-{scenario}', {
  // 标签 - 包含生成方式和业务模块
  tags: ['交互生成', '{pageName}', '{area}'],
  // 严重程度 - blocker|critical|major|minor|trivial|normal
  severity: 'normal',
  // 命名空间（页面唯一值，从本地路由 maps.ts 获取）
  namespace: '{namespace}',
  // 页面名称（页面唯一值）
  pageName: '{pageName}',
});

/**
 * 测试用例
 * @param page 当前测试页面
 * @param runner 测试运行器（所有元素操作必须通过 runner，内置等待无需手动调用）
 * @param context 测试浏览器上下文
 * @param expect 测试期望值
 */
test.run(async ({ page, runner, context, expect }) => {

  // ==================== 查询前置 ====================
  // 非自动查询页面必须建立查询前置
  // createTest 已自动等待页面加载完成

  // 定位查询字段 - 使用 data-file-id
  // const searchForm = page.locator('form:visible, .ant-form:visible').first();
  // const field = searchForm.locator('[data-file-id="fieldName"]').first();
  // await runner.fill(field.locator('input:visible').first(), 'candidateValue', '字段描述，输入候选值 candidateValue');

  // 点击查询
  // const queryButton = page.getByRole('button', { name: /^查\s*询|搜\s*索$/ }).first();
  // await runner.click(queryButton, '查询按钮');

  // 判断查询结果
  // const grid = page.locator('.ant-table-wrapper:visible, .ag-root-wrapper:visible').first();
  // const firstRow = grid.locator('tbody tr:visible, .ag-row:visible').filter({ hasNotText: /^$/ }).first();
  // if (await firstRow.isVisible()) {
  //   // 有数据 - 继续后续操作
  // } else {
  //   console.info('查询无数据，后续只覆盖空态');
  // }

  // ==================== 功能测试 ====================

  // 示例：Antd Select 操作
  // const select = field.locator('.ant-select:visible').first();
  // await runner.click(select, '下拉选择器描述，从推荐文本 candidate1、candidate2 中选择');
  // const dropdown = page.locator('.ant-select-dropdown:visible').last();
  // const enabledOptions = dropdown.locator('[role="option"]:visible:not([aria-disabled="true"])');
  // if ((await enabledOptions.count()) > 0) {
  //   await runner.click(enabledOptions.first(), '选择第一个可用选项');
  // } else {
  //   console.info('下拉无可用选项');
  //   await runner.click(page.locator('body'), '关闭下拉');
  // }

  // 示例：打开弹窗
  // const addButton = page.getByRole('button', { name: '新增' }).first();
  // await runner.click(addButton, '新增按钮，打开新增表单弹窗');
  // const drawer = page.locator('.ant-drawer:visible').filter({ hasText: '新增' }).last();

  // 弹窗内操作...

  // 关闭弹窗
  // await runner.click(
  //   drawer.getByRole('button', { name: /^取\s*消|关\s*闭$/ }).first(),
  //   '取消并关闭抽屉'
  // );

  // 示例：AI 断言验证
  // const result = await runner.aiAssert('页面是否显示保存成功提示');
  // if (!result?.pass) {
  //   console.info('未观察到保存成功提示');
  // }

});
