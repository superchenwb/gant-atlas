---
name: gant-atlas-generate
description: Generate complete feature-doc Markdown files from source code using subagent batching
argument-hint: ["[project-id] [--module <module>] [--page <pageId>] [--full]"]
---

# /gant-atlas-generate

Generate semantically complete feature-doc Markdown files for one or more pages.

This skill uses deterministic code scanning (routes, schema, APIs, buttons, hooks)
plus subagent writers to produce `feature-docs/<module>/<page>/*.md`.

## Options

`$ARGUMENTS` may contain:

- `project-id` — project identifier configured in the global projects.json
- `--module <module>` — generate only pages under this module
- `--page <pageId>` — generate only a single page (format: `module/pageName`)
- `--full` — force a full rebuild, ignoring incremental hashes

## Progress reporting

Report progress at each phase:

> `[Phase 0/7] Resolving project configuration...`
> `[Phase 1/7] Scanning pages from routes...`
> `[Phase 1.5/7] Filtering unchanged pages...`
> `[Phase 2/7] Extracting page contexts (page N/M)...`
> `[Phase 3/7] Writing Markdown via subagents (batch N/B)...`
> `[Phase 4/7] Merging generated docs...`
> `[Phase 5/7] Reviewing output...`
> `[Phase 6/7] Saving meta and report...`

---

## Phase 0 — Pre-flight

1. **Resolve plugin root.**

   The skill files live inside the gant-atlas repo. Try these candidates:

   ```bash
   PLUGIN_ROOT=""
   for candidate in \
     "${GANT_ATLAS_PLUGIN_ROOT}" \
     "$HOME/gant-atlas" \
     "$HOME/.gant-atlas/plugin" \
     "$(dirname $(realpath ~/.claude/skills/gant-atlas-generate 2>/dev/null))/../../..";
   do
     if [ -n "$candidate" ] && [ -f "$candidate/package.json" ] && [ -d "$candidate/skills/generate-docs" ]; then
       PLUGIN_ROOT="$candidate"
       break
     fi
   done
   ```

2. **Ensure the compiled core exists.**

   ```bash
   if [ ! -f "$PLUGIN_ROOT/dist/code-scanner.js" ] || [ ! -f "$PLUGIN_ROOT/dist/generator/context.js" ]; then
     cd "$PLUGIN_ROOT" && pnpm install --frozen-lockfile && pnpm run build
   fi
   ```

3. **Resolve project config.**

   Read `~/.gant-atlas/projects.json` and find the project matching the first non-flag argument.
   Required fields: `id`, `docsPath`. Optional: `codeDir`, `routesFile`.

   If no project id is given, error: "Please provide a project id."

4. **Create intermediate directories.**

   ```bash
   PROJECT_ROOT=$(dirname "$docsPath")  # or docsPath itself
   mkdir -p "$PROJECT_ROOT/.gant-atlas/intermediate/generate"
   mkdir -p "$PROJECT_ROOT/.gant-atlas/tmp"
   ```

   Store paths as:
   - `$INTERMEDIATE = $PROJECT_ROOT/.gant-atlas/intermediate/generate`
   - `$TMP = $PROJECT_ROOT/.gant-atlas/tmp`
   - `$META = $PROJECT_ROOT/.gant-atlas/generate-meta.json` (persistent across runs)

---

## Phase 1 — Scan pages

Report: `[Phase 1/7] Scanning pages from routes...`

Run the bundled scanner:

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/scan-pages.mjs" \
  "$codeDir" \
  "$routesFile" \
  "$INTERMEDIATE/pages.json"
```

Read `$INTERMEDIATE/pages.json`.

If `--module` is specified, filter pages to that module.
If `--page` is specified, keep only that page.
If no pages remain, error and stop.

Store filtered list as `$PAGES`.

---

## Phase 1.5 — Incremental filter

Report: `[Phase 1.5/7] Filtering unchanged pages...`

This phase determines which pages actually need regeneration by comparing
source code hashes against the previous generation metadata.

**If `--full` is in `$ARGUMENTS`**: skip this phase entirely, all pages proceed
to Phase 2. Report: `Full rebuild requested — all pages will be regenerated.`

**Otherwise**:

Run the incremental filter:

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/incremental-filter.mjs" \
  "$INTERMEDIATE/pages.json" \
  "$META" \
  "$INTERMEDIATE/filtered-pages.json" \
  "$INTERMEDIATE/generate-meta-staging.json"
```

This script:
1. Reads `pages.json` (all discovered pages)
2. Reads `generate-meta.json` (previous generation hashes, may not exist)
3. For each page, computes SHA-256 of all `.ts/.tsx/.js/.jsx` files in `pageDir`
4. Compares current hash vs previous hash
5. Writes `filtered-pages.json` containing only changed/new pages
6. Writes `generate-meta-staging.json` with updated hashes

After the script completes:

- Read `$INTERMEDIATE/filtered-pages.json`
- Report to user: `N pages changed, M pages unchanged (skipped).`
- If 0 pages changed: report "All pages up to date. Use --full to force regeneration." and STOP.
- Replace `$PAGES` with the filtered page list
- Store `$META_STAGING = $INTERMEDIATE/generate-meta-staging.json`

---

## Phase 2 — Extract contexts

Report: `[Phase 2/7] Extracting page contexts...`

For each page in `$PAGES`, run:

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/extract-page-context.mjs" \
  "$codeDir" \
  "$routesFile" \
  "$pageId" \
  "$INTERMEDIATE/context-$pageId.json"
```

Report progress every N pages:

> `Extracted context for page M/N: module/pageName`

After all contexts are extracted, build a batch plan.

Default batch size: **5 pages per subagent**.
If total pages <= 5, use a single batch.

Write `$INTERMEDIATE/batches.json`:

```json
{
  "schemaVersion": 1,
  "totalPages": 12,
  "batchSize": 5,
  "batches": [
    { "batchIndex": 1, "pageIds": ["ibom/pageA", "ibom/pageB", ...] },
    ...
  ]
}
```

---

## Phase 3 — Write Markdown (subagent dispatch)

Report: `[Phase 3/7] Writing Markdown via subagents...`

Load `$INTERMEDIATE/batches.json`. Iterate batches.

For each batch, dispatch a subagent using `agents/page-writer.md`. Run up to
**3 subagents concurrently** (conservative to avoid token surge).

Dispatch prompt template:

```
Generate feature-doc Markdown files for these pages.

Project root: $PROJECT_ROOT
Docs path: $docsPath

Pages (with full contexts):
1. module/pageName
   Context file: $INTERMEDIATE/context-module-pageName.json
2. ...

Instructions:
- Read each context JSON file.
- For each page, write main.md, search-area.md, grid-area.md, button-area.md, api-area.md under $docsPath/module/pageName/.
- Skip files that are not applicable (e.g. no search fields means no search-area.md).
- Use [AI生成-需确认] when uncertain.
- Return a JSON summary of pagesWritten and warnings.
```

Wait for all subagents to complete. Collect their JSON summaries.

If a subagent fails, retry once with the same context. If it fails again, record
a warning and continue; partial output is better than no output.

---

## Phase 4 — Merge docs

Report: `[Phase 4/7] Merging generated docs...`

Run the merge script:

```bash
node "$PLUGIN_ROOT/skills/generate-docs/scripts/merge-docs.mjs" \
  "$INTERMEDIATE/docs" \
  "$docsPath"
```

This copies intermediate Markdown files into the final `feature-docs/` tree.

---

## Phase 5 — Review

Report: `[Phase 5/7] Reviewing output...`

Dispatch a subagent using `agents/reviewer.md`.

Pass:
- `projectRoot`
- `docsPath`
- `pageIds` = all pages in `$PAGES`

The reviewer reads the generated Markdown and reports issues/warnings.

Store the review result at `$INTERMEDIATE/review.json`.

---

## Phase 6 — Save and report

Report: `[Phase 6/7] Saving meta and report...`

1. **Update generation meta.** Promote the staging meta to the persistent location:

   ```bash
   # If incremental-filter ran (non --full), use the staging meta
   if [ -f "$META_STAGING" ]; then
     cp "$META_STAGING" "$META"
   fi
   ```

   Then mark all successfully generated pages:

   ```bash
   node "$PLUGIN_ROOT/skills/generate-docs/scripts/update-generate-meta.mjs" \
     "$META" \
     successfulPageId1 successfulPageId2 ...
   ```

2. Write a summary to `$INTERMEDIATE/generation-report.json`:

   ```json
   {
     "generatedAt": "2026-06-08T...",
     "totalPagesScanned": 50,
     "pagesChanged": 12,
     "pagesSkipped": 38,
     "successfulPages": ["..."],
     "failedPages": ["..."],
     "warnings": ["..."],
     "docsPath": "..."
   }
   ```

3. Print a final summary to the user:
   - Total pages scanned vs changed vs skipped
   - Successful vs failed
   - Path to `feature-docs/`
   - Path to review report
   - Note any warnings from the reviewer

4. Optionally run `gant-atlas ingest` on the new docs if the project config
   includes a dbPath:

   ```bash
   pnpm exec gant-atlas ingest --docsPath "$docsPath" --db "$dbPath"
   ```

   This keeps the SQLite knowledge graph in sync with the newly generated docs.

---

## Error handling

- If `scan-pages.mjs` exits non-zero → report stderr and stop.
- If `incremental-filter.mjs` exits non-zero → treat as full rebuild (defensive fallback).
- If `extract-page-context.mjs` fails for a page → skip that page with a warning.
- If a `page-writer` subagent fails twice → skip that batch with a warning.
- Never silently drop errors. Every warning appears in the final report.
- **Always save partial results.** A partial generation is better than no generation.
- **Always update meta** for successfully generated pages, even if some failed.

---

## Example invocation

```
/gant-atlas-generate demo
/gant-atlas-generate demo --module ibom
/gant-atlas-generate demo --page ibom/dataAuthGroup
/gant-atlas-generate demo --full
```
