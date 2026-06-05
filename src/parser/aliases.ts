/**
 * 字段名 / 实体类型别名规范化
 *
 * 借鉴 Understand-Anything 的别名策略：
 * Markdown 中同一个概念可能用不同中文/英文表达，
 * 扫描时统一映射到规范名。
 */

// ─────────────────────────────────────────
// 字段标签别名
// ─────────────────────────────────────────

export const FIELD_LABEL_ALIASES = [
  '字段标签',
  '列名',
  'label',
  'Label',
  '标题',
  '显示名',
];

export const FIELD_NAME_ALIASES = [
  '参数名',
  '字段名',
  'fieldName',
  'name',
  'key',
  '字段标识',
];

export const COMPONENT_TYPE_ALIASES = [
  '控件类型',
  '组件类型',
  'type',
  'inputType',
  'input',
];

export const REQUIRED_ALIASES = ['必填', 'required', '是否必填', '必须'];
export const DEFAULT_VALUE_ALIASES = ['默认值', 'default', 'defaultValue'];

// ─────────────────────────────────────────
// Grid 列别名
// ─────────────────────────────────────────

export const COLUMN_TITLE_ALIASES = ['列标题', '列名', '标题', 'header'];
export const DISPLAY_CONTENT_ALIASES = ['展示内容', '显示内容', '内容', 'display'];
export const EDITABLE_ALIASES = ['是否可编辑', '可编辑', 'editable'];
export const WIDTH_ALIASES = ['宽度', '列宽', 'width'];
export const SORTABLE_ALIASES = ['排序', '可排序', 'sortable'];
export const DATA_TYPE_ALIASES = ['数据类型', '类型', 'dataType'];
export const ALIGN_ALIASES = ['对齐', 'align', 'alignment'];

// ─────────────────────────────────────────
// 按钮别名
// ─────────────────────────────────────────

export const BUTTON_NAME_ALIASES = ['按钮名称', '操作名称', '名称', 'name'];
export const SCOPE_ALIASES = ['作用域', '操作类型', 'scope', 'type'];
export const POSITION_ALIASES = ['位置', 'position', 'placement'];
export const DISPLAY_CONDITION_ALIASES = ['显示条件', 'visible', 'condition'];
export const DISABLED_CONDITION_ALIASES = ['禁用条件', 'disabled', 'disableCondition'];
export const CLICK_RESULT_ALIASES = ['点击结果', '关联操作', 'action', 'result'];
export const CONFIRM_REQUIRED_ALIASES = ['确认弹窗', 'confirm', '需要确认'];

// ─────────────────────────────────────────
// 页面别名
// ─────────────────────────────────────────

export const PAGE_TYPE_ALIASES = ['页面类型', '类型', 'pageType'];
export const ROUTE_ALIASES = ['路径', '路由', 'route', 'path', 'url'];
export const PAGE_FUNCTION_ALIASES = ['页面功能', '功能', 'function', 'purpose'];

// ─────────────────────────────────────────
// 解析辅助函数
// ─────────────────────────────────────────

/**
 * 在 key-value 对象中查找第一个匹配别名的值
 *
 * @example
 *   resolveValue({ '字段标签': '产品名称', 'Label': 'Product' }, FIELD_LABEL_ALIASES)
 *   // => '产品名称'
 */
export function resolveValue(
  kv: Record<string, string>,
  aliases: string[]
): string | undefined {
  for (const alias of aliases) {
    const normalized = alias.toLowerCase();
    for (const [key, value] of Object.entries(kv)) {
      if (key.trim().toLowerCase() === normalized) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * 判断一个 key 是否匹配任意别名
 */
export function matchesAlias(key: string, aliases: string[]): boolean {
  const normalized = key.trim().toLowerCase();
  return aliases.some((a) => a.toLowerCase() === normalized);
}

/**
 * 从一个 key-value 表中提取所有匹配别名的字段
 *
 * @example
 *   extractAliasedFields({ '字段标签': '名称', 'Label': 'Name' }, FIELD_LABEL_ALIASES)
 *   // => ['名称', 'Name']
 */
export function extractAliasedFields(
  kv: Record<string, string>,
  aliases: string[]
): string[] {
  const results: string[] = [];
  for (const alias of aliases) {
    const normalized = alias.toLowerCase();
    for (const [key, value] of Object.entries(kv)) {
      if (key.trim().toLowerCase() === normalized && value) {
        results.push(value);
      }
    }
  }
  return results;
}
