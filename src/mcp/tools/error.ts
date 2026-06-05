export interface ToolError {
  code: 'invalid_input' | 'not_found' | 'too_large' | 'internal_error' | 'fts_unavailable';
  message: string;
  details?: string;
}

export function formatToolError(error: ToolError) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error }, null, 2) }],
    isError: true,
  };
}

export function formatToolResult(data: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}
