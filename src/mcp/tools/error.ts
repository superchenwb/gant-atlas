import { z } from 'zod';

export interface ToolError {
  code: 'invalid_input' | 'not_found' | 'too_large' | 'internal_error' | 'fts_unavailable';
  message: string;
  details?: string;
}

export interface ToolResultMeta {
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** 返回数据条数（如果有） */
  count?: number;
  /** 查询耗时（毫秒） */
  durationMs?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 格式化错误响应 —— 统一为 { success: false, error } 结构
 */
export function formatToolError(error: ToolError) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error, meta: { timestamp: nowIso() } }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * 格式化成功响应 —— 统一为 { success: true, data, meta } 结构
 */
export function formatToolResult(data: unknown, meta?: Partial<ToolResultMeta>) {
  const resultMeta: ToolResultMeta = {
    timestamp: nowIso(),
    ...meta,
  };

  // 自动推断 count（如果 data 是数组）
  if (Array.isArray(data) && resultMeta.count === undefined) {
    resultMeta.count = data.length;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, data, meta: resultMeta }, null, 2),
      },
    ],
  };
}

/**
 * 验证 MCP 工具入参 —— 使用 Zod Schema 进行运行时校验
 *
 * @returns 验证成功时返回解析后的数据；失败时返回可直接传递给 formatToolError 的错误对象
 */
export function validateToolArgs<T>(schema: z.ZodSchema<T>, args: unknown):
  | { ok: true; data: T }
  | { ok: false; error: ToolError } {
  const result = schema.safeParse(args);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    error: {
      code: 'invalid_input',
      message: result.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '),
    },
  };
}
