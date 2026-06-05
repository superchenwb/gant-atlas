import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../../src/store/sqlite.js';
import { handleGetCallGraph } from '../../../src/mcp/tools/get-call-graph.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('handleGetCallGraph', () => {
  const dbPath = join(process.cwd(), 'tests', 'call-graph-test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);

    store.insertNode({ id: 'page:order/payment', type: 'page', name: 'payment', title: '支付页面', summary: '', tags: [] });
    store.insertNode({ id: 'page:order/result', type: 'page', name: 'result', title: '支付结果', summary: '', tags: [] });
    store.insertNode({ id: 'api:createOrder', type: 'api', name: 'createOrder', title: '创建订单', summary: '', tags: [] });
    store.insertNode({ id: 'api:payCallback', type: 'api', name: 'payCallback', title: '支付回调', summary: '', tags: [] });
    store.insertNode({ id: 'api:notify', type: 'api', name: 'notify', title: '通知服务', summary: '', tags: [] });

    store.insertEdge({ source: 'page:order/payment', target: 'api:createOrder', type: 'calls' });
    store.insertEdge({ source: 'page:order/payment', target: 'api:payCallback', type: 'calls' });
    store.insertEdge({ source: 'api:payCallback', target: 'api:notify', type: 'calls' });
    store.insertEdge({ source: 'api:payCallback', target: 'page:order/result', type: 'calls' });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns both upstream and downstream by default', async () => {
    const result = await handleGetCallGraph(store, { projectId: 'p1', nodeId: 'api:payCallback' });
    const data = JSON.parse(result.content[0].text as string).data;

    expect(data.direction).toBe('both');
    expect(data.nodes.length).toBeGreaterThanOrEqual(3);
    expect(data.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('returns only upstream when specified', async () => {
    const result = await handleGetCallGraph(store, { projectId: 'p1', nodeId: 'api:payCallback', direction: 'upstream' });
    const data = JSON.parse(result.content[0].text as string).data;

    expect(data.direction).toBe('upstream');
    expect(data.nodes.some((n: { id: string }) => n.id === 'page:order/payment')).toBe(true);
    expect(data.nodes.some((n: { id: string }) => n.id === 'page:order/result')).toBe(false);
  });

  it('returns only downstream when specified', async () => {
    const result = await handleGetCallGraph(store, { projectId: 'p1', nodeId: 'api:payCallback', direction: 'downstream' });
    const data = JSON.parse(result.content[0].text as string).data;

    expect(data.direction).toBe('downstream');
    expect(data.nodes.some((n: { id: string }) => n.id === 'api:notify')).toBe(true);
    expect(data.nodes.some((n: { id: string }) => n.id === 'page:order/payment')).toBe(false);
  });

  it('respects maxDepth', async () => {
    const result = await handleGetCallGraph(store, { projectId: 'p1', nodeId: 'page:order/payment', maxDepth: 1 });
    const data = JSON.parse(result.content[0].text as string).data;

    expect(data.maxDepth).toBe(1);
    // At depth 1 from payment page, we should see createOrder and payCallback
    expect(data.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('returns error for non-existent node', async () => {
    const result = await handleGetCallGraph(store, { projectId: 'p1', nodeId: 'api:nonexistent' });
    expect((result as any).isError).toBe(true);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.error.code).toBe('not_found');
  });

  it('returns error for invalid direction', async () => {
    const result = await handleGetCallGraph(store, { projectId: 'p1', nodeId: 'api:createOrder', direction: 'invalid' as any });
    expect((result as any).isError).toBe(true);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.error.code).toBe('invalid_input');
  });

  it('returns error for missing projectId', async () => {
    const result = await handleGetCallGraph(store, { nodeId: 'api:createOrder' });
    expect((result as any).isError).toBe(true);
  });
});
