import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { scanPageButtons } from '../../src/scanner/button-scanner.js';

const FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures', 'test-module', 'simple-page');
const ACTION_CALLBACK_DIR = join(process.cwd(), 'tests', 'fixtures', 'test-module', 'action-callback-page');

describe('scanPageButtons', () => {
  it('extracts button candidates from TSX page files', async () => {
    const result = await scanPageButtons(FIXTURES_DIR);

    expect(result.buttons.length).toBeGreaterThanOrEqual(2);

    const addButton = result.buttons.find((b) => b.name === '新增');
    expect(addButton).toBeDefined();
    expect(addButton?.element).toBe('Button');
    expect(addButton?.onClick).toContain('handleAdd');
    expect(addButton?.disabled).toContain('loading');

    const deleteButton = result.buttons.find((b) => b.name === '删除');
    expect(deleteButton).toBeDefined();
    expect(deleteButton?.element).toBe('ActionButton');
    expect(deleteButton?.onClick).toContain('handleDelete');

    // <a> links are navigation, not buttons — should be excluded
    const exportLink = result.buttons.find((b) => b.name === '导出');
    expect(exportLink).toBeUndefined();
  });

  it('extracts custom hooks that call APIs', async () => {
    const result = await scanPageButtons(FIXTURES_DIR);

    const dataHook = result.hooks.find((h) => h.name === 'useSimplePageData');
    expect(dataHook).toBeDefined();
    expect(dataHook?.apis).toContain('simplePageFindListApi');

    const deleteHook = result.hooks.find((h) => h.name === 'useDeleteItem');
    expect(deleteHook).toBeDefined();
    expect(deleteHook?.apis).toContain('simplePageSaveApi');
  });

  it('returns empty arrays for non-existent directories', async () => {
    const result = await scanPageButtons(join(process.cwd(), 'tests', 'fixtures', 'not-real'));
    expect(result.buttons).toEqual([]);
    expect(result.hooks).toEqual([]);
  });

  it('extracts action callbacks from hooks.ts as synthetic buttons', async () => {
    const result = await scanPageButtons(ACTION_CALLBACK_DIR);

    const deleteBtn = result.buttons.find((b) => b.name === '删除');
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn?.element).toBe('ContextAction');
    expect(deleteBtn?.apiCalls).toContain('deleteByIdAPI');

    const archiveBtn = result.buttons.find((b) => b.name === '归档');
    expect(archiveBtn).toBeDefined();
    expect(archiveBtn?.apiCalls).toContain('updateVehicleStatusAPI');

    const previewBtn = result.buttons.find((b) => b.name === '预览');
    expect(previewBtn).toBeDefined();

    // Framework hooks imported from procomponents should be filtered out
    expect(result.hooks.some((h) => h.name === 'useModalOpen')).toBe(false);
  });
});
