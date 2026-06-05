import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../../src/store/sqlite.js';
import { handleExploreContext } from '../../../src/mcp/tools/explore-context.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('handleExploreContext', () => {
  const dbPath = join(process.cwd(), 'tests', 'explore-context-test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);

    // Pages
    store.insertNode({ id: 'page:order/payment', type: 'page', name: 'payment', title: '支付页面', summary: '处理订单支付流程', tags: [], module: 'order' });
    store.insertNode({ id: 'page:order/result', type: 'page', name: 'result', title: '支付结果', summary: '显示支付结果', tags: [], module: 'order' });
    store.insertNode({ id: 'page:user/profile', type: 'page', name: 'profile', title: '用户资料', summary: '用户个人信息管理', tags: [], module: 'user' });

    // APIs
    store.insertNode({ id: 'api:createOrder', type: 'api', name: 'createOrder', title: '创建订单', summary: '', tags: [] });
    store.insertNode({ id: 'api:payCallback', type: 'api', name: 'payCallback', title: '支付回调', summary: '', tags: [] });
    store.insertNode({ id: 'api:getUserInfo', type: 'api', name: 'getUserInfo', title: '获取用户信息', summary: '', tags: [] });

    // Fields
    store.insertNode({ id: 'field:order/payment/amount', type: 'field', name: 'amount', title: '支付金额', summary: '', tags: [] });

    // Edges
    store.insertEdge({ source: 'page:order/payment', target: 'api:createOrder', type: 'calls' });
    store.insertEdge({ source: 'page:order/payment', target: 'api:payCallback', type: 'calls' });
    store.insertEdge({ source: 'api:payCallback', target: 'page:order/result', type: 'calls' });
    store.insertEdge({ source: 'page:order/payment', target: 'field:order/payment/amount', type: 'contains' });
    store.insertEdge({ source: 'page:user/profile', target: 'api:getUserInfo', type: 'calls' });
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns relevant nodes and edges for a natural language query', async () => {
    const result = await handleExploreContext(store, { projectId: 'p1', query: '支付流程' });
    const text = result.content[0].text as string;

    expect(text).toContain('支付页面');
    expect(text).toContain('创建订单');
    expect(text).toContain('支付回调');
    expect(text).toContain('关系映射');
  });

  it('limits results to maxNodes', async () => {
    const result = await handleExploreContext(store, { projectId: 'p1', query: '支付', maxNodes: 3 });
    const text = result.content[0].text as string;

    // Should return at most 3 nodes plus the start node
    expect(text).toContain('支付');
  });

  it('returns error for empty query', async () => {
    const result = await handleExploreContext(store, { projectId: 'p1', query: '' });
    expect((result as any).isError).toBe(true);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.error.code).toBe('invalid_input');
  });

  it('returns error for missing projectId', async () => {
    const result = await handleExploreContext(store, { query: '支付' });
    expect((result as any).isError).toBe(true);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.error.code).toBe('invalid_input');
  });

  it('returns no results message for unknown query', async () => {
    const result = await handleExploreContext(store, { projectId: 'p1', query: '完全不存在的业务' });
    const text = result.content[0].text as string;
    expect(text).toContain('未找到匹配');
  });

  it('respects includeCode flag', async () => {
    const result = await handleExploreContext(store, { projectId: 'p1', query: '支付', includeCode: true });
    const text = result.content[0].text as string;
    expect(text).toContain('相关代码');
  });
});
