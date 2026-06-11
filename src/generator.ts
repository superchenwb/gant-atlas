import type { PageCodeInfo, RouteMapping, SchemaField, SchemaColumn } from './code-scanner.js';
import type { ButtonCandidate } from './scanner/button-scanner.js';

export interface GeneratedSkeleton {
  mainMd: string;
  searchAreaMd: string;
  gridAreaMd: string;
  buttonAreaMd: string;
}

function escapeMdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatComponentType(field: SchemaField | SchemaColumn): string {
  if (field.componentType) return field.componentType;
  return 'Input';
}

export function generatePageSkeleton(
  info: PageCodeInfo,
  routeMapping?: RouteMapping
): GeneratedSkeleton {
  const pageTitle = routeMapping?.title ?? info.pageName;

  return {
    mainMd: generateMainMd(pageTitle, info, routeMapping),
    searchAreaMd: generateSearchAreaMd(info.fields),
    gridAreaMd: generateGridAreaMd(info.columns),
    buttonAreaMd: generateButtonAreaMd(info.buttons ?? []),
  };
}

function generateMainMd(pageTitle: string, info: PageCodeInfo, routeMapping?: RouteMapping): string {
  const lines: string[] = [`# ${escapeMdCell(pageTitle)}`, ''];
  lines.push('## 概述');
  lines.push('');
  lines.push('| 属性 | 内容 |');
  lines.push('|------|------|');
  lines.push(`| 页面类型 | ${escapeMdCell('')} |`);
  lines.push(`| 路径 | ${escapeMdCell(routeMapping?.path ?? '')} |`);
  lines.push(`| 页面功能 | ${escapeMdCell('')} |`);
  lines.push('');

  if (info.apis.length > 0) {
    lines.push('## 接口列表');
    lines.push('');
    for (const api of info.apis) {
      lines.push(`- ${api}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateSearchAreaMd(fields: SchemaField[]): string {
  if (fields.length === 0) return '';

  const lines: string[] = ['## 查询条件', ''];
  lines.push('| 字段标签 | 参数名 | 控件类型 | 必填 | 默认值 |');
  lines.push('|----------|--------|----------|------|--------|');

  for (const field of fields) {
    const label = escapeMdCell(field.title ?? '');
    const name = escapeMdCell(field.name);
    const type = escapeMdCell(formatComponentType(field));
    lines.push(`| ${label} | ${name} | ${type} | | |`);
  }

  lines.push('');
  return lines.join('\n');
}

function generateGridAreaMd(columns: SchemaColumn[]): string {
  if (columns.length === 0) return '';

  const lines: string[] = ['## 表格列', ''];
  lines.push('| 列名 | 字段名 | 显示内容 | 可编辑 | 宽度 | 排序 | 数据类型 | 对齐 |');
  lines.push('|------|--------|----------|--------|------|------|----------|------|');

  for (const col of columns) {
    const title = escapeMdCell(col.title ?? '');
    const fieldName = escapeMdCell(col.fieldName);
    const display = escapeMdCell(col.title ?? '');
    lines.push(`| ${title} | ${fieldName} | ${display} | | | | | |`);
  }

  lines.push('');
  return lines.join('\n');
}

function generateButtonAreaMd(buttons: ButtonCandidate[]): string {
  const lines: string[] = ['## 按钮区域', ''];
  lines.push('| 按钮名称 | 作用域 | 位置 | 显示条件 | 禁用条件 | 点击结果 | 确认弹窗 |');
  lines.push('|----------|--------|------|----------|----------|----------|----------|');

  for (const btn of buttons) {
    const name = escapeMdCell(btn.name ?? btn.element ?? '');
    const scope = escapeMdCell(inferButtonScope(btn));
    const position = escapeMdCell(inferButtonPosition(btn));
    const display = escapeMdCell(btn.displayCondition ?? '');
    const disabled = escapeMdCell(btn.disabled ?? '');
    const onClick = escapeMdCell(btn.onClick ?? '');
    const confirm = escapeMdCell(btn.confirm ? '是' : '');
    lines.push(`| ${name} | ${scope} | ${position} | ${display} | ${disabled} | ${onClick} | ${confirm} |`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Infer button scope from the component name or props.
 * Custom components like AddButton/RemoveButton are typically toolbar-level;
 * components with "Row" / "row" in name are row-level.
 */
function inferButtonScope(btn: ButtonCandidate): string {
  const name = (btn.name ?? btn.element ?? '').toLowerCase();
  if (name.includes('row') || name.includes('行')) return '行级';
  if (name.includes('toolbar') || name.includes('工具栏')) return '页面';
  // Most custom button components (AddButton, RemoveButton, etc.) are toolbar-level
  if (/[Bb]utton/.test(btn.element) && !BUTTON_ELEMENT_NAMES.has(btn.element)) return '页面';
  return '';
}

/**
 * Infer button position (toolbar / grid / header).
 */
function inferButtonPosition(btn: ButtonCandidate): string {
  if (btn.element === 'ToolbarButton') return 'toolbar';
  // Standard Button in JSX is typically toolbar-level
  if (btn.element === 'Button' || btn.element === 'ActionButton') return 'toolbar';
  return '';
}

const BUTTON_ELEMENT_NAMES = new Set([
  'Button',
  'ActionButton',
  'ToolbarButton',
  'IconButton',
  'ButtonGroup',
  'a',
  'Link',
]);
