/**
 * Schema 实体类型定义
 *
 * 供 code-scanner 与 scanner 子模块共享，避免循环依赖。
 */

export interface SchemaField {
  /** 字段名（search form / detail form 的 key） */
  name: string;
  /** 字段标题 */
  title?: string;
  /** 控件类型，如 Input、Select、DatePicker */
  componentType?: string;
  /** 额外选项，如下拉数据源 */
  options?: Record<string, unknown>;
  /** 是否必填 */
  required?: boolean | string;
  /** 占位提示 */
  placeholder?: string;
  /** 默认值 */
  defaultValue?: unknown;
  /** 校验规则表达式文本 */
  rules?: unknown;
  /** 依赖字段名列表 */
  dependencies?: string[];
  /** 依赖变化处理函数的原始源码 */
  onDependenciesChange?: string;
  /** 字段所属分组（如 baseInfo / vppsInfo），由 LLM fallback 补充 */
  group?: string;
}

export interface SchemaColumn {
  /** 列字段名 */
  fieldName: string;
  /** 列标题 */
  title?: string;
  /** 列控件类型 */
  componentType?: string;
  /** 额外选项 */
  options?: Record<string, unknown>;
  /** 列宽 */
  width?: number | string;
  /** 最小列宽 */
  minWidth?: number | string;
  /** 最大列宽 */
  maxWidth?: number | string;
  /** 固定列配置 */
  fixed?: string | boolean;
  /** 对齐方式 */
  align?: string;
  /** 是否可编辑 */
  editable?: boolean | string;
  /** 列所属分组（复杂表格的分组），由 LLM fallback 补充 */
  group?: string;
}
