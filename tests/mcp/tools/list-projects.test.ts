import { describe, it, expect } from 'vitest';
import { handleListProjects } from '../../../src/mcp/tools/list-projects.js';

describe('handleListProjects', () => {
  it('returns simplified project list', async () => {
    const projects = [
      { id: 'p1', name: 'Project A', docsPath: '/docs/a' },
      { id: 'p2', name: 'Project B', docsPath: '/docs/b' },
    ];

    const result = await handleListProjects(projects);
    expect(result.content).toHaveLength(1);

    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed).toEqual([
      { id: 'p1', name: 'Project A' },
      { id: 'p2', name: 'Project B' },
    ]);
  });

  it('returns empty array for no projects', async () => {
    const result = await handleListProjects([]);
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed).toEqual([]);
  });
});
