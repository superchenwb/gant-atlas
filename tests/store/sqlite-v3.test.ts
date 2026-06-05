import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../src/store/sqlite.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('SQLite Store v3 (unified graph)', () => {
  const dbPath = join(process.cwd(), 'tests', 'test-v3.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('inserts and retrieves a node', () => {
    const node = {
      id: 'page:test/page',
      type: 'page' as const,
      name: 'test-page',
      title: 'Test Page',
      summary: 'A test page',
      tags: ['test'],
      meta: { route: '/test' },
    };

    store.insertNode(node);
    const nodes = store.listAllNodes();

    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('page:test/page');
    expect(nodes[0].name).toBe('test-page');
    expect(nodes[0].meta).toEqual({ route: '/test' });
  });

  it('inserts and retrieves an edge', () => {
    const edge = {
      source: 'page:test/page',
      target: 'field:test/page/field/0',
      type: 'contains' as const,
    };

    store.insertEdge(edge);
    const edges = store.listEdges();

    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe('page:test/page');
    expect(edges[0].type).toBe('contains');
  });

  it('filters nodes by type', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'P1', summary: '', tags: [] });
    store.insertNode({ id: 'field:f1', type: 'field', name: 'f1', title: 'F1', summary: '', tags: [] });
    store.insertNode({ id: 'api:a1', type: 'api', name: 'a1', title: 'A1', summary: '', tags: [] });

    expect(store.listNodesByType('page').length).toBe(1);
    expect(store.listNodesByType('field').length).toBe(1);
    expect(store.listNodesByType('api').length).toBe(1);
  });

  it('searches nodes by keyword', () => {
    store.insertNode({ id: 'page:search-target', type: 'page', name: 'target', title: 'Target Page', summary: '', tags: [] });
    store.insertNode({ id: 'page:other', type: 'page', name: 'other', title: 'Other', summary: '', tags: [] });

    const results = store.searchNodes('target');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('target');
  });

  it('deletes a node and its edges', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'P1', summary: '', tags: [] });
    store.insertEdge({ source: 'page:p1', target: 'field:f1', type: 'contains' });

    store.deleteNode('page:p1');

    expect(store.listAllNodes().length).toBe(0);
    expect(store.listEdges().length).toBe(0);
  });

  it('updates existing node on conflict', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'P1', summary: '', tags: [] });
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1-updated', title: 'P1 Updated', summary: '', tags: [] });

    const nodes = store.listAllNodes();
    expect(nodes[0].name).toBe('p1-updated');
  });
});
