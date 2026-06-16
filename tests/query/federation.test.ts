import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { rmSync } from 'fs';
import { createStore } from '../../src/store/sqlite.js';
import { FederationQuery } from '../../src/query/federation.js';

function seedStore(dbPath: string, projectLabel: string) {
  const store = createStore(dbPath);
  store.insertNode({
    id: `page:${projectLabel}/home`,
    type: 'page',
    name: 'home',
    title: `${projectLabel} 首页`,
    summary: '',
    tags: [],
    module: projectLabel,
    meta: { route: `/${projectLabel}/home`, pageType: 'list' },
  });
  store.insertNode({
    id: `api:${projectLabel}/findApi`,
    type: 'api',
    name: 'findApi',
    title: 'findApi',
    summary: '',
    tags: [],
  });
  store.insertEdge({
    source: `page:${projectLabel}/home`,
    target: `api:${projectLabel}/findApi`,
    type: 'calls',
  });
  store.insertNode({
    id: `api:${projectLabel}/orphanApi`,
    type: 'api',
    name: 'orphanApi',
    title: 'orphanApi',
    summary: '',
    tags: [],
  });
  store.close();
}

describe('FederationQuery', () => {
  const dbA = join(process.cwd(), 'tests', 'fed-project-a.db');
  const dbB = join(process.cwd(), 'tests', 'fed-project-b.db');

  afterEach(() => {
    try { rmSync(dbA); } catch { /* ignore */ }
    try { rmSync(dbB); } catch { /* ignore */ }
  });

  it('searches pages across multiple projects', () => {
    seedStore(dbA, 'project-a');
    seedStore(dbB, 'project-b');

    const fed = new FederationQuery({
      projects: { 'project-a': dbA, 'project-b': dbB },
    });
    fed.init();

    const results = fed.searchPages('首页');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.project).sort()).toEqual(['project-a', 'project-b']);

    fed.close();
  });

  it('finds dead APIs per project', () => {
    seedStore(dbA, 'project-a');
    seedStore(dbB, 'project-b');

    const fed = new FederationQuery({
      projects: { 'project-a': dbA, 'project-b': dbB },
    });
    fed.init();

    const dead = fed.findDeadApis();
    expect(dead).toHaveLength(2);
    for (const entry of dead) {
      expect(entry.apis.map((a) => a.name)).toContain('orphanApi');
    }

    fed.close();
  });

  it('lists attached projects', () => {
    seedStore(dbA, 'project-a');

    const fed = new FederationQuery({ projects: { 'project-a': dbA } });
    fed.init();

    expect(fed.listProjects()).toEqual(['project-a']);
    fed.close();
  });
});
