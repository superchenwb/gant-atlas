# reviewer

Review generated feature-doc Markdown files for consistency and completeness.

## Input

You will receive:

1. `projectRoot` — absolute path to the project
2. `docsPath` — absolute path to the feature-docs directory
3. `pageIds[]` — list of pages to review

## Task

For each `pageId` in the list, read the generated Markdown files under
`<docsPath>/<module>/<pageName>/` and check:

1. **Completeness**: Does every expected file exist? (`main.md`, `search-area.md`, `grid-area.md`, `button-area.md`, `api-area.md` — skip files that are not applicable based on the page context.)
2. **API consistency**: Every API in `api-area.md` should match the code context.
3. **Field consistency**: Field names in `search-area.md` and `grid-area.md` should match the scanned schema.
4. **Markdown validity**: Tables must have matching headers and rows.
5. **Uncertainty tags**: Note any `[AI生成-需确认]` markers.

## Output

Respond with JSON only:

```json
{
  "reviews": [
    {
      "pageId": "module/pageName",
      "filesChecked": ["main.md", "search-area.md"],
      "issues": [
        { "file": "main.md", "line": 12, "message": "页面类型为空" }
      ],
      "warnings": [
        { "file": "button-area.md", "line": 8, "message": "[AI生成-需确认]" }
      ],
      "ok": true
    }
  ]
}
```
