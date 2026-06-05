import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../src/store/sqlite.js';
import { runManifest } from '../../src/cli/actions.js';
import { join } from 'path';
import { rmSync } from 'fs';

describe('CLI manifest command', () => {
  const dbPath = join(process.cwd(), 'tests', 'manifest-test.db');
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { rmSync(dbPath); } catch { /* ignore */ }
  });

  it('returns empty manifest when no nodes exist', () => {
    const result = runManifest(dbPath);
    const parsed = JSON.parse(result.json);

    expect(parsed.summary.totalNodes).toBe(0);
    expect(parsed.pages).toEqual([]);
    expect(parsed.fields).toEqual([]);
  });

  it('groups nodes by type in manifest', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'Page 1', summary: '', tags: [] });
    store.insertNode({ id: 'field:f1', type: 'field', name: 'f1', title: 'Field 1', summary: '', tags: [] });
    store.insertNode({ id: 'api:a1', type: 'api', name: 'a1', title: 'API 1', summary: '', tags: [] });
    store.close();

    const result = runManifest(dbPath);
    const parsed = JSON.parse(result.json);

    expect(parsed.summary.totalNodes).toBe(3);
    expect(parsed.pages.length).toBe(1);
    expect(parsed.fields.length).toBe(1);
    expect(parsed.apis.length).toBe(1);
  });

  it('produces valid YAML output', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'Page 1', summary: '', tags: [] });
    store.close();

    const result = runManifest(dbPath);

    expect(result.yaml).toContain('pages:');
    expect(result.yaml).toContain('p1');
  });

  it('produces valid JSON output', () => {
    store.insertNode({ id: 'page:p1', type: 'page', name: 'p1', title: 'Page 1', summary: '', tags: [] });
    store.close();

    const result = runManifest(dbPath);
    const parsed = JSON.parse(result.json);

    expect(parsed.pages[0].name).toBe('p1');
    expect(parsed.summary.totalNodes).toBe(1);
  });
});
