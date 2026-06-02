# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- `pnpm run build` — Compile TypeScript (`tsc`). Output goes to `dist/`.
- `pnpm run dev` — Run the CLI in dev mode (`tsx src/index.ts <command> ...`).
- `pnpm run test` — Run all tests once (`vitest run`).
- `pnpm run test:watch` — Run tests in watch mode.
- `pnpm exec vitest run tests/path/to/test.ts` — Run a single test file.
- `pnpm run mcp` — Start the MCP server (uses compiled `dist/index.js`).

Node >= 22 required. ES Modules (`"type": "module"`).

## Architecture Overview

`gant-atlas` is a business knowledge graph engine. It parses Markdown feature-docs into a queryable graph stored in SQLite, exposed both as a CLI and an MCP Server.

### Data Flow

```
feature-docs/ (Markdown files per page)
    → src/parser/markdown.ts  (parse tables, extract API refs)
    → src/graph/builder.ts    (build Page/Field/Column/Button/API entities + relations)
    → src/store/sqlite.ts     (persist to SQLite with migrations)
    → src/mcp/tools/*.ts      (expose via MCP tools)
    → src/cli/actions.ts      (expose via CLI commands)
```

### Module Responsibilities

- **`src/parser/markdown.ts`** — Markdown table parser. Supports two table formats:
  - Key-value: `| 属性 | 内容 |` (used in `main.md`, `search-area.md`, etc.)
  - Flat: header-row tables (used in `grid-area.md`, `button-area.md`)
  Also extracts API name references (camelCase + `Api` suffix).

- **`src/graph/builder.ts`** — Builds `ParsedFeatureDoc[]` from a feature-docs directory tree.
  - `buildGraphAsync()` is the primary entry point (async, concurrent I/O).
  - `buildGraph()` is the legacy sync entry point.
  - Uses `withConcurrency()` (worker pool, default limit 50) to bound concurrency.
  - `buildRelations()` resolves cross-page API references and maps `fieldCallsApis` / `pageHasApis`.

- **`src/store/sqlite.ts`** — SQLite storage layer using `better-sqlite3`.
  - Schema migrations are explicit (`migrations` array, `migrate()` runner, `SCHEMA_VERSION`).
  - The `Store` interface is public; the underlying `Database` instance is **not** exposed on it.
  - Internal modules needing raw SQL use `getStoreDatabase(store)` which reads from a `WeakMap`.
  - Current schema version is **2** (v1 init tables, v2 added `content_hash` to `pages`).

- **`src/mcp/server.ts`** — MCP Server using `@modelcontextprotocol/sdk`.
  - Tools: `get_page_spec`, `search_pages`, `analyze_impact`, `check_consistency`, `list_projects`.
  - `serve()` redirects `console.log` to `stderr` to avoid polluting the stdio MCP protocol.

- **`src/code-scanner.ts`** — Semantic Mapper. Scans frontend code to correlate with feature-docs.
  - `scanRoutes()` / `scanSchema()` / `scanServices()` all use a "regex fast path + TypeScript AST fallback" strategy.
  - AST path dynamically imports `typescript` at runtime (`await import('typescript')`) to avoid a startup dependency.
  - `buildMapping()` compares code-side fields/APIs with spec-side and reports mismatches.

- **`src/cli/actions.ts`** — Testable CLI action implementations separated from `src/index.ts`.
  - `runIngest()` supports incremental updates via `computePageHash()` (SHA-256 of all `.md` files in a page dir + mtimes).
  - `runValidate()` returns a unified `hasIssues` flag; CLI exits with code 1 when true.

- **`src/plugins/custom-yml.ts`** — Per-page override config (`custom.yml`) allowing non-standard file names and metadata overrides.

### Testing

- Framework: **vitest** with `globals: true`.
- Tests live in `tests/` mirroring `src/` structure.
- `tests/fixtures/` contains sample feature-docs (`test-module/simple-page/`, `test-module/kv-page/`, `test-module/custom-page/`) and a `routes-maps.ts` for code-scanner tests.
- SQLite temp files (`*.db-shm`, `*.db-wal`) and `coverage/` are ignored by `.gitignore`.
- MCP server tests use `InMemoryTransport.createLinkedPair()` + `Client` from the MCP SDK (see `tests/mcp/server.test.ts`).

### Key Conventions

- All imports use `.js` extensions (NodeNext module resolution).
- IDs are constructed as `${module}/${pageName}` for pages and `${pageId}/{field|column|button}/${index}` for sub-entities.
- API IDs are `api/${name}`.
- The `Store` interface intentionally hides `db`. If you need raw SQL in a new tool/module, import `getStoreDatabase` from `src/store/sqlite.js`.
- When adding a new table, add a migration to `migrations` in `src/store/sqlite.ts` and bump `SCHEMA_VERSION`.
