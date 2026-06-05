import { formatToolResult } from './error.js';

export async function handleListProjects(
  projects: Array<{ id: string; name: string; docsPath: string }>
) {
  const data = projects.map((p) => ({ id: p.id, name: p.name }));
  return formatToolResult(data, { count: data.length });
}
