import type { Store } from '../../store/sqlite.js';
import { z } from 'zod';
import { formatToolResult, validateToolArgs } from './error.js';
import { validateStandardPage } from '../../validation/page.js';
import { join } from 'path';

const CheckConsistencySchema = z.object({
  pageId: z.string().optional(),
  docsPath: z.string().optional(),
});

export interface ConsistencyIssue {
  type: string;
  description: string;
  suggestion: string;
}

export interface ConsistencyReport {
  totalIssues: number;
  issues: ConsistencyIssue[];
  summary: string;
}

export function runConsistencyChecks(store: Store, pageId?: string): ConsistencyReport {
  const issues: ConsistencyIssue[] = [];

  const addIssue = (type: string, description: string, suggestion: string) => {
    issues.push({ type, description, suggestion });
  };

  const allPages = store.listNodesByType('page');
  const allFields = store.listNodesByType('field');
  const allColumns = store.listNodesByType('column');
  const allApis = store.listNodesByType('api');
  const allEdges = store.listEdges();

  // Build edge lookup maps
  const edgesFromSource = new Map<string, typeof allEdges>();
  const edgesToTarget = new Map<string, typeof allEdges>();
  for (const e of allEdges) {
    const fromList = edgesFromSource.get(e.source) ?? [];
    fromList.push(e);
    edgesFromSource.set(e.source, fromList);

    const toList = edgesToTarget.get(e.target) ?? [];
    toList.push(e);
    edgesToTarget.set(e.target, toList);
  }

  // Check incomplete pages (missing route or pageType)
  for (const p of allPages) {
    const rawId = p.id.replace(/^page:/, '');
    if (pageId && rawId !== pageId) continue;

    const meta = p.meta as Record<string, unknown> | undefined;
    if (!meta?.route || !meta?.pageType) {
      addIssue(
        'incomplete_page',
        `页面 "${rawId}" (${p.title}) 缺少 page_type 或 route`,
        '检查 main.md 中的概述表格是否包含页面类型和路径'
      );
    }
  }

  // Check pages without fields
  for (const p of allPages) {
    const rawId = p.id.replace(/^page:/, '');
    if (pageId && rawId !== pageId) continue;

    const outgoing = edgesFromSource.get(p.id) ?? [];
    const hasFields = outgoing.some((e) => e.type === 'contains' && allFields.some((f) => f.id === e.target));
    if (!hasFields) {
      addIssue(
        'empty_fields',
        `页面 "${rawId}" (${p.title}) 没有任何查询字段`,
        '检查是否缺少 search-area.md 或文件中的表格是否为空'
      );
    }
  }

  // Check pages without columns
  for (const p of allPages) {
    const rawId = p.id.replace(/^page:/, '');
    if (pageId && rawId !== pageId) continue;

    const outgoing = edgesFromSource.get(p.id) ?? [];
    const hasColumns = outgoing.some((e) => e.type === 'contains' && allColumns.some((c) => c.id === e.target));
    if (!hasColumns) {
      addIssue(
        'empty_columns',
        `页面 "${rawId}" (${p.title}) 没有任何表格列`,
        '检查是否缺少 grid-area.md 或文件中的表格是否为空'
      );
    }
  }

  // Check orphan APIs
  for (const api of allApis) {
    const incoming = edgesToTarget.get(api.id) ?? [];
    if (incoming.length === 0) {
      addIssue(
        'orphan_api',
        `API "${api.name}" 没有被任何页面或字段引用`,
        '检查 API 名称是否正确，或在 main.md / 其他文档中添加引用'
      );
    }
  }

  // Check fields that match API names but don't have edges
  const apiNames = new Set(allApis.map((a) => a.name));
  for (const field of allFields) {
    const rawPageId = field.id.match(/^field:([^/]+\/[^/]+)/)?.[1];
    if (pageId && rawPageId !== pageId) continue;

    const outgoing = edgesFromSource.get(field.id) ?? [];
    const hasApiLink = outgoing.some((e) => e.type === 'calls');
    if (!hasApiLink && apiNames.has(field.name)) {
      addIssue(
        'field_api_mismatch',
        `字段 "${field.title || field.name}" (name=${field.name}) 匹配某个 API 名称但未建立关联`,
        '检查字段名是否意外与 API 名称相同，或确认是否需要建立 fieldCallsApis 关系'
      );
    }
  }

  // Check pages with API calls but no field API links
  for (const p of allPages) {
    const rawId = p.id.replace(/^page:/, '');
    if (pageId && rawId !== pageId) continue;

    const pageOutgoing = edgesFromSource.get(p.id) ?? [];
    const pageCallsApis = pageOutgoing.some((e) => e.type === 'calls');
    if (pageCallsApis) {
      const pageFields = allFields.filter((f) => {
        const fieldIncoming = edgesToTarget.get(f.id) ?? [];
        return fieldIncoming.some((e) => e.source === p.id && e.type === 'contains');
      });
      const hasFieldApiLink = pageFields.some((f) => {
        const fieldOutgoing = edgesFromSource.get(f.id) ?? [];
        return fieldOutgoing.some((e) => e.type === 'calls');
      });
      if (!hasFieldApiLink && pageFields.length > 0) {
        addIssue(
          'page_api_no_field_link',
          `页面 "${rawId}" 引用了 API 但没有字段建立 API 关联`,
          '如果页面中的查询字段需要调用 API，检查 search-area.md 中的字段名是否与 API 名匹配'
        );
      }
    }
  }

  return {
    totalIssues: issues.length,
    issues,
    summary:
      issues.length === 0
        ? '所有检查通过，未发现一致性问题'
        : `发现 ${issues.length} 个一致性问题，请逐一排查`,
  };
}

export async function handleCheckConsistency(store: Store, args: unknown) {
  const validation = validateToolArgs(CheckConsistencySchema, args);
  const pageId = validation.ok ? validation.data.pageId : undefined;
  const docsPath = validation.ok ? validation.data.docsPath : undefined;

  // Reset stale flags for all pages before checking
  for (const p of store.listNodesByType('page')) {
    store.markNodeStale(p.id, false);
  }

  const report = runConsistencyChecks(store, pageId);

  // 当提供 docsPath 时，额外运行标准页面结构检查
  if (docsPath) {
    const structureIssues = checkPageStructure(store, docsPath, pageId);
    report.issues.push(...structureIssues);
    report.totalIssues = report.issues.length;
    report.summary =
      report.issues.length === 0
        ? '所有检查通过，未发现一致性问题'
        : `发现 ${report.issues.length} 个一致性问题，请逐一排查`;
  }

  // Mark incomplete pages as stale
  for (const issue of report.issues) {
    if (issue.type === 'incomplete_page' || issue.type === 'non_standard_page') {
      const match = issue.description.match(/页面 "([^"]+)"/);
      if (match) {
        store.markNodeStale(`page:${match[1]}`, true);
      }
    }
  }

  return formatToolResult(report, { count: report.issues.length });
}

/**
 * 检查页面目录结构是否符合标准页面定义
 */
function checkPageStructure(
  store: Store,
  docsPath: string,
  filterPageId?: string
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const pages = store.listNodesByType('page');

  for (const page of pages) {
    const rawId = page.id.replace(/^page:/, '');
    if (filterPageId && rawId !== filterPageId) continue;

    const moduleName = page.module || '';
    const pagePath = join(docsPath, moduleName, page.name);

    try {
      const report = validateStandardPage(pagePath);
      if (report.skippedByCustom) continue;
      if (!report.isStandard) {
        issues.push({
          type: 'non_standard_page',
          description: `页面 "${rawId}" (${page.title}) 不符合标准页面结构`,
          suggestion: `检查文件: ${report.files.map((f) => `${f.fileName}(${f.exists ? (f.headersValid ? '✓' : '格式错误') : '缺失'})`).join(', ')}`,
        });
      }
    } catch {
      // 目录不存在或其他 IO 错误，跳过（页面可能未生成功能清单）
    }
  }

  return issues;
}
