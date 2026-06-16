import type { PageCodeInfo, RouteMapping, SchemaField, SchemaColumn } from './code-scanner.js';
import type { ButtonCandidate } from './scanner/button-scanner.js';

export interface GeneratedSkeleton {
  mainMd: string;
  searchAreaMd: string;
  gridAreaMd: string;
  buttonAreaMd: string;
  apiAreaMd: string;
}

function escapeMdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatComponentType(field: SchemaField | SchemaColumn): string {
  if (field.componentType) return field.componentType;
  return 'Input';
}

function generateApiAreaMd(info: PageCodeInfo): string {
  if (info.apis.length === 0 && info.buttons.length === 0) return '';

  const lines: string[] = ['# 接口区域', ''];

  if (info.apis.length > 0) {
    lines.push('## 一、接口清单');
    lines.push('');
    lines.push('| 接口名称 | 场景分类 | 说明 |');
    lines.push('|----------|----------|------|');

    for (const api of info.apis) {
      const scenario = inferApiScenario(api);
      lines.push(`| ${escapeMdCell(api)} | ${escapeMdCell(scenario ?? '其他')} | |`);
    }
    lines.push('');
  }

  const buttonsWithApis = (info.buttons ?? []).filter((b) => b.apiCalls && b.apiCalls.length > 0);
  if (buttonsWithApis.length > 0) {
    lines.push('## 二、接口与按钮关联');
    lines.push('');
    lines.push('| 按钮名称 | 调用的接口 | 说明 |');
    lines.push('|----------|-----------|------|');
    for (const btn of buttonsWithApis) {
      const name = escapeMdCell(btn.name ?? btn.element ?? '');
      const apis = escapeMdCell(btn.apiCalls!.join(', '));
      lines.push(`| ${name} | ${apis} | |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function inferApiScenario(apiName: string): string | undefined {
  const lower = apiName.toLowerCase();
  if (/find|list|query|search|get/.test(lower)) return '查询';
  if (/save|create|update|add|batchsave/.test(lower)) return '保存';
  if (/delete|remove|del/.test(lower)) return '删除';
  if (/export/.test(lower)) return '导出';
  if (/import/.test(lower)) return '导入';
  if (/link|bind/.test(lower)) return '关联';
  return undefined;
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
    apiAreaMd: generateApiAreaMd(info),
  };
}

function generateMainMd(pageTitle: string, info: PageCodeInfo, routeMapping?: RouteMapping): string {
  const lines: string[] = [`# ${escapeMdCell(pageTitle)}`, ''];
  lines.push('## 概述');
  lines.push('');
  lines.push('| 属性 | 内容 |');
  lines.push('|------|------|');
  const pageType = info.pageType ?? inferPageTypeFromContent(info);
  lines.push(`| 页面类型 | ${escapeMdCell(pageType ?? '')} |`);
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

  if (info.hooks.length > 0) {
    lines.push('## Hook 列表');
    lines.push('');
    lines.push('| Hook 名称 | 调用的接口 |');
    lines.push('|-----------|-----------|');
    for (const hook of info.hooks) {
      const apis = hook.apis.length > 0 ? hook.apis.join(', ') : '';
      lines.push(`| ${escapeMdCell(hook.name)} | ${escapeMdCell(apis)} |`);
    }
    lines.push('');
  }

  if (info.tabs.length > 0) {
    lines.push('## Tab 列表');
    lines.push('');
    lines.push('| 标签 | Key |');
    lines.push('|------|-----|');
    for (const tab of info.tabs) {
      lines.push(`| ${escapeMdCell(tab.label)} | ${escapeMdCell(tab.key)} |`);
    }
    lines.push('');
  }

  if (info.permissions.length > 0) {
    lines.push('## 权限列表');
    lines.push('');
    lines.push('| 权限标识 |');
    lines.push('|----------|');
    for (const perm of info.permissions) {
      lines.push(`| ${escapeMdCell(perm)} |`);
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
 * ContextAction buttons are passed to Grid context and rendered as row actions.
 */
function inferButtonScope(btn: ButtonCandidate): string {
  if (btn.element === 'ContextAction') return '行级';
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
  if (btn.element === 'ContextAction') return 'grid';
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

function inferPageTypeFromContent(info: PageCodeInfo): string | undefined {
  if (info.columns.length > 0) return 'page-main';
  if (info.fields.length > 0) return 'page-detail';
  return undefined;
}
