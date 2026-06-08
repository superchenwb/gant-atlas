# page-writer

Generate complete feature-doc Markdown files for one or more pages based on the provided `PageGenerationContext` JSON.

## Input

You will receive a prompt containing:

1. `projectRoot` — absolute path to the project
2. `docsPath` — absolute path to the feature-docs output directory
3. `pages[]` — array of page contexts (usually 1–10 pages per dispatch)

Each page context has this shape:

```ts
{
  pageId: "module/pageName",
  route: "/data-auth-group",
  module: "moduleName",
  pageName: "pageName",
  searchFields: [{ name, title?, componentType?, options? }],
  gridColumns: [{ fieldName, title?, componentType?, options? }],
  apis: ["dataAuthGroupFindListApi", "dataAuthGroupSaveApi"],
  buttons: [{ name?, element, line, onClick?, disabled?, displayCondition? }],
  hooks: [{ name, line, apis: [] }],
  snippets: { schema?: string, services?: string, pageComponent?: string },
  notes?: ["表格列可能是动态生成的，具体定义见页面组件代码。"]
}
```

## Task

For each page in `pages[]`, write the following Markdown files under `<docsPath>/<module>/<pageName>/`:

1. `main.md` — page overview with `页面类型`, `页面功能`, and API 场景描述
2. `search-area.md` — search form fields (if `searchFields` is non-empty)
3. `grid-area.md` — table columns (if `gridColumns` is non-empty)
4. `button-area.md` — buttons with scope, conditions, and click results
5. `api-area.md` — API list with business scenarios

If a page has no search fields, skip `search-area.md`.
If a page has no grid columns, skip `grid-area.md`.

**Special case: dynamic columns.**
If `notes` contains a message about dynamically generated columns (e.g.
`"表格列可能是动态生成的，具体定义见页面组件代码。"`), write
`grid-area.md` anyway with:
- A note at the top: `> ⚠️ 表格列为动态生成，具体字段见页面组件源码。`
- If `pageComponent` snippet contains column-related code, try to infer column
  names from the snippet and list them. Otherwise write:
  `| 列名 | 说明 | 备注 |
   |------|------|------|
   | — | 动态生成 | 见页面组件代码 |`

## Output rules

- Use the **existing parser conventions** from the parent project:
  - Key-value tables use `| 属性 | 内容 |`
  - Flat tables use header rows
  - API references use the exact `xxxApi` names from context.apis
- Infer business meaning from field names, titles, and snippets.
- If you are uncertain about a value, write `[AI生成-需确认]` instead of guessing.
- Keep descriptions concise (1–2 sentences per cell).
- Do not invent fields or APIs that are not in the context.

## File writing

Create parent directories as needed and write UTF-8 Markdown files.

After writing, respond with a JSON summary only:

```json
{
  "pagesWritten": [
    { "pageId": "module/pageName", "files": ["main.md", "search-area.md", ...] }
  ],
  "warnings": ["any issues or uncertain items"]
}
```
