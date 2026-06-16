import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { readFileSync } from 'fs';
import { scanPageDir } from '../../src/code-scanner.js';
import { generatePageSkeleton } from '../../src/generator.js';
import { parseMarkdown } from '../../src/parser/markdown.js';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'test-module');

interface GoldenField {
  name: string;
  title: string;
  componentType: string;
}

interface GoldenColumn {
  fieldName: string;
  title: string;
}

interface GoldenButton {
  name: string;
  element: string;
}

interface GoldenHook {
  name: string;
  apis: string[];
}

interface GoldenTab {
  label: string;
  key: string;
}

interface GoldenStandard {
  searchFields: GoldenField[];
  gridColumns: GoldenColumn[];
  buttons: GoldenButton[];
  apis: string[];
  hooks: GoldenHook[];
  tabs: GoldenTab[];
  permissions: string[];
}

/**
 * Golden standard eval for the deterministic generator.
 *
 * This test guards against unintended structural drift in generated feature-docs.
 * If the generator output changes (e.g. column order, dropped fields, wrong
 * componentType fallback), the parsed fields/columns will no longer match the
 * golden snapshot. Buttons, APIs, hooks, tabs and permissions are compared
 * against the scanner output to ensure the generator input stays stable.
 *
 * When intentionally changing generator behavior, update golden.json after
 * manually reviewing the new output.
 */
describe('generator golden standard', () => {
  const cases = [
    { pageName: 'rich-schema-page', module: 'test-module' },
    { pageName: 'simple-page', module: 'test-module' },
  ];

  it.each(cases)(
    'produces stable entities for $module/$pageName',
    async ({ pageName, module }) => {
      const pageDir = join(fixturesDir, pageName);
      const golden = JSON.parse(
        readFileSync(join(pageDir, 'golden.json'), 'utf-8')
      ) as GoldenStandard;

      const info = await scanPageDir(pageDir, module, pageName);
      const skeleton = generatePageSkeleton(info);

      const searchParsed = parseMarkdown(skeleton.searchAreaMd);
      const gridParsed = parseMarkdown(skeleton.gridAreaMd);

      // Extract search fields from the first table in search-area.md
      const searchTable = searchParsed.tables[0];
      expect(searchTable).toBeDefined();
      const searchFields = searchTable.rows.map((row) => ({
        name: row['参数名'] ?? row['字段名'] ?? '',
        title: row['字段标签'] ?? row['列名'] ?? '',
        componentType: row['控件类型'] ?? '',
      }));

      // Extract grid columns from the first table in grid-area.md
      const gridTable = gridParsed.tables[0];
      expect(gridTable).toBeDefined();
      const gridColumns = gridTable.rows.map((row) => ({
        fieldName: row['字段名'] ?? '',
        title: row['列名'] ?? row['列标题'] ?? '',
      }));

      // Buttons, APIs, hooks, tabs and permissions are compared from the raw
      // scanner output because the generator only renders them. The rendering
      // itself is covered by dedicated generator tests.
      const buttons: GoldenButton[] = info.buttons.map((b) => ({
        name: b.name ?? '',
        element: b.element,
      }));
      const apis: string[] = [...info.apis];
      const hooks: GoldenHook[] = info.hooks.map((h) => ({
        name: h.name,
        apis: [...h.apis],
      }));
      const tabs: GoldenTab[] = info.tabs.map((t) => ({ ...t }));
      const permissions: string[] = [...info.permissions];

      expect(searchFields).toEqual(golden.searchFields);
      expect(gridColumns).toEqual(golden.gridColumns);
      expect(buttons).toEqual(golden.buttons);
      expect(apis).toEqual(golden.apis);
      expect(hooks).toEqual(golden.hooks);
      expect(tabs).toEqual(golden.tabs);
      expect(permissions).toEqual(golden.permissions);
    }
  );
});
