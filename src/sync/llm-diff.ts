/**
 * LLM-assisted semantic diff generator.
 *
 * Goal: turn the coarse-grained, deterministic diff produced by `diff.ts` into
 * human-reviewable semantic suggestions (e.g. "this field rename breaks the
 * query API parameter").
 *
 * This module is designed to degrade gracefully:
 * - If no LLM provider is configured, it returns rule-based semantic hints.
 * - In tests the LLM client can be mocked via `createLlmDiffClient`.
 *
 * The actual LLM call is intentionally isolated in `callLlmForSuggestions`
 * so that the rest of the diff pipeline stays deterministic and fast.
 */

import type { SyncDiff, StructuredChange } from './diff.js';

export interface SemanticDiffSuggestion {
  /** Category for grouping in review UI. */
  category: string;
  /** One-line human-readable suggestion. */
  description: string;
  /** Severity informs review priority. */
  severity: 'info' | 'warning' | 'critical';
}

export interface LlmDiffOptions {
  /** Optional extra context about the page or the code change. */
  pageContext?: string;
  /** Optional LLM client override for testing. */
  client?: LlmDiffClient;
}

export interface LlmDiffClient {
  generateSuggestions(diff: SyncDiff, context?: string): Promise<SemanticDiffSuggestion[]>;
}

/**
 * Generate semantic diff suggestions for a sync diff.
 *
 * Falls back to deterministic rule-based suggestions when no LLM client is
 * supplied, keeping unit tests fast and deterministic.
 */
export async function generateSemanticDiffSuggestions(
  diff: SyncDiff,
  options: LlmDiffOptions = {}
): Promise<SemanticDiffSuggestion[]> {
  if (options.client) {
    return options.client.generateSuggestions(diff, options.pageContext);
  }
  return ruleBasedSuggestions(diff);
}

/**
 * Deterministic fallback: produce simple semantic hints from structured changes.
 *
 * This is intentionally conservative. It flags obvious risk patterns but does
 * not try to infer business semantics (that is the LLM's job).
 */
function ruleBasedSuggestions(diff: SyncDiff): SemanticDiffSuggestion[] {
  const suggestions: SemanticDiffSuggestion[] = [];

  for (const fileDiff of diff.fileDiffs) {
    if (fileDiff.status === 'unchanged') continue;

    for (const change of fileDiff.structuredChanges) {
      const base = describeChange(change);

      if (change.operation === 'removed') {
        suggestions.push({
          category: fileDiff.fileName,
          description: `${base}：确认是否已从页面功能中下线，避免文档与代码不一致。`,
          severity: 'warning',
        });
        continue;
      }

      if (change.operation === 'added') {
        suggestions.push({
          category: fileDiff.fileName,
          description: `${base}：请在 main.md 中补充对应的功能说明或影响范围。`,
          severity: 'info',
        });
        continue;
      }

      // modified
      const modifiedKeys = detectModifiedKeys(change);
      if (modifiedKeys.length > 0) {
        suggestions.push({
          category: fileDiff.fileName,
          description: `${base}，变更列：${modifiedKeys.join('、')}。请检查是否需要同步调整 API 参数或权限。`,
          severity: 'warning',
        });
      } else {
        suggestions.push({
          category: fileDiff.fileName,
          description: base,
          severity: 'info',
        });
      }
    }
  }

  return suggestions;
}

function describeChange(change: StructuredChange): string {
  const kindMap: Record<string, string> = {
    field: '查询条件',
    column: '表格列',
    button: '按钮',
    api: '接口',
    metadata: '页面元数据',
    unknown: '条目',
  };
  const kindLabel = kindMap[change.kind] ?? kindMap.unknown;

  switch (change.operation) {
    case 'added':
      return `${kindLabel}「${change.name}」新增`;
    case 'removed':
      return `${kindLabel}「${change.name}」删除`;
    case 'modified':
      return `${kindLabel}「${change.name}」已修改`;
    default:
      return `${kindLabel}「${change.name}」未变更`;
  }
}

function detectModifiedKeys(change: StructuredChange): string[] {
  if (!change.oldValue || !change.newValue) return [];
  const keys = new Set([
    ...Object.keys(change.oldValue),
    ...Object.keys(change.newValue),
  ]);
  const modified: string[] = [];
  for (const key of keys) {
    const oldVal = (change.oldValue[key] ?? '').trim();
    const newVal = (change.newValue[key] ?? '').trim();
    if (oldVal !== newVal) {
      modified.push(key);
    }
  }
  return modified;
}

/**
 * Placeholder for a real LLM client.
 *
 * Future implementations may call an LLM with a structured prompt and parse
 * the result into `SemanticDiffSuggestion[]`. For now this is exported so
 * callers can plug in their own client without changing `generateSemanticDiffSuggestions`.
 */
export function createDefaultLlmClient(): LlmDiffClient {
  return {
    async generateSuggestions(diff: SyncDiff, _context?: string) {
      // TODO: wire to an actual LLM provider when available.
      // `_context` is kept in the signature for future prompt enrichment.
      return ruleBasedSuggestions(diff);
    },
  };
}
