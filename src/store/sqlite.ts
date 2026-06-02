import Database from 'better-sqlite3';
import type {
  Page,
  Field,
  GridColumn,
  Button,
  API,
} from '../types/index.js';

const SCHEMA_VERSION = 1;

export interface Store {
  db: Database.Database;
  initSchema(): void;
  insertPage(page: Page): void;
  insertField(field: Field): void;
  insertGridColumn(column: GridColumn): void;
  insertButton(button: Button): void;
  insertAPI(api: API): void;
  insertPageAPI(pageId: string, apiId: string): void;
  getPageSpec(pageId: string): {
    page: Page | null;
    fields: Field[];
    columns: GridColumn[];
    buttons: Button[];
    apis: API[];
  };
  searchPages(keyword: string, module?: string): Page[];
  clearProject(): void;
}

export function createStore(dbPath: string): Store {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const store: Store = {
    db,
    initSchema: () => initSchema(db),
    insertPage: (page) => insertPage(db, page),
    insertField: (field) => insertField(db, field),
    insertGridColumn: (column) => insertGridColumn(db, column),
    insertButton: (button) => insertButton(db, button),
    insertAPI: (api) => insertAPI(db, api),
    insertPageAPI: (pageId, apiId) => insertPageAPI(db, pageId, apiId),
    getPageSpec: (pageId) => getPageSpec(db, pageId),
    searchPages: (keyword, module) => searchPages(db, keyword, module),
    clearProject: () => clearProject(db),
  };

  store.initSchema();
  return store;
}

function initSchema(db: Database.Database): void {
  // Schema version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS __version (
      key TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    )
  `);

  const versionRow = db.prepare("SELECT version FROM __version WHERE key = 'schema'").get() as
    | { version: number }
    | undefined;
  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        page_name TEXT NOT NULL,
        page_title TEXT NOT NULL,
        page_type TEXT,
        route TEXT,
        page_function TEXT
      );

      CREATE TABLE IF NOT EXISTS fields (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        field_label TEXT NOT NULL,
        field_name TEXT NOT NULL,
        component_type TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 0,
        default_value TEXT
      );

      CREATE TABLE IF NOT EXISTS grid_columns (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        column_title TEXT NOT NULL,
        field_name TEXT,
        display_content TEXT NOT NULL,
        editable INTEGER NOT NULL DEFAULT 0,
        width INTEGER,
        sortable INTEGER DEFAULT 0,
        data_type TEXT,
        align TEXT
      );

      CREATE TABLE IF NOT EXISTS buttons (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        button_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        position TEXT NOT NULL,
        display_condition TEXT,
        disabled_condition TEXT,
        click_result TEXT NOT NULL,
        confirm_required INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS apis (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS field_calls_apis (
        field_id TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
        api_id TEXT NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
        PRIMARY KEY (field_id, api_id)
      );

      CREATE TABLE IF NOT EXISTS page_calls_apis (
        page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        api_id TEXT NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
        PRIMARY KEY (page_id, api_id)
      );

      CREATE INDEX IF NOT EXISTS idx_pages_module ON pages(module);
      CREATE INDEX IF NOT EXISTS idx_fields_page_id ON fields(page_id);
      CREATE INDEX IF NOT EXISTS idx_grid_columns_page_id ON grid_columns(page_id);
      CREATE INDEX IF NOT EXISTS idx_buttons_page_id ON buttons(page_id);
      CREATE INDEX IF NOT EXISTS idx_apis_name ON apis(name);
    `);

    db.prepare("INSERT OR REPLACE INTO __version (key, version) VALUES ('schema', ?)").run(SCHEMA_VERSION);
  }
}

function insertPage(db: Database.Database, page: Page): void {
  db.prepare(
    `INSERT INTO pages (id, module, page_name, page_title, page_type, route, page_function)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       module = excluded.module,
       page_name = excluded.page_name,
       page_title = excluded.page_title,
       page_type = excluded.page_type,
       route = excluded.route,
       page_function = excluded.page_function`
  ).run(
    page.id,
    page.module,
    page.pageName,
    page.pageTitle,
    page.pageType ?? null,
    page.route ?? null,
    page.pageFunction ?? null
  );
}

function insertField(db: Database.Database, field: Field): void {
  db.prepare(
    `INSERT INTO fields (id, page_id, field_label, field_name, component_type, required, default_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       page_id = excluded.page_id,
       field_label = excluded.field_label,
       field_name = excluded.field_name,
       component_type = excluded.component_type,
       required = excluded.required,
       default_value = excluded.default_value`
  ).run(
    field.id,
    field.pageId,
    field.fieldLabel,
    field.fieldName,
    field.componentType,
    field.required ? 1 : 0,
    field.defaultValue ?? null
  );
}

function insertGridColumn(db: Database.Database, column: GridColumn): void {
  db.prepare(
    `INSERT INTO grid_columns (id, page_id, column_title, field_name, display_content, editable, width, sortable, data_type, align)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       page_id = excluded.page_id,
       column_title = excluded.column_title,
       field_name = excluded.field_name,
       display_content = excluded.display_content,
       editable = excluded.editable,
       width = excluded.width,
       sortable = excluded.sortable,
       data_type = excluded.data_type,
       align = excluded.align`
  ).run(
    column.id,
    column.pageId,
    column.columnTitle,
    column.fieldName ?? null,
    column.displayContent,
    column.editable ? 1 : 0,
    column.width ?? null,
    column.sortable ? 1 : 0,
    column.dataType ?? null,
    column.align ?? null
  );
}

function insertButton(db: Database.Database, button: Button): void {
  db.prepare(
    `INSERT INTO buttons (id, page_id, button_name, scope, position, display_condition, disabled_condition, click_result, confirm_required)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       page_id = excluded.page_id,
       button_name = excluded.button_name,
       scope = excluded.scope,
       position = excluded.position,
       display_condition = excluded.display_condition,
       disabled_condition = excluded.disabled_condition,
       click_result = excluded.click_result,
       confirm_required = excluded.confirm_required`
  ).run(
    button.id,
    button.pageId,
    button.buttonName,
    button.scope,
    button.position,
    button.displayCondition || null,
    button.disabledCondition || null,
    button.clickResult,
    button.confirmRequired ? 1 : 0
  );
}

function insertAPI(db: Database.Database, api: API): void {
  db.prepare(
    `INSERT INTO apis (id, name, description)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description`
  ).run(api.id, api.name, api.description ?? null);
}

function insertPageAPI(db: Database.Database, pageId: string, apiId: string): void {
  db.prepare(
    `INSERT INTO page_calls_apis (page_id, api_id)
     VALUES (?, ?)
     ON CONFLICT(page_id, api_id) DO NOTHING`
  ).run(pageId, apiId);
}

function getPageSpec(
  db: Database.Database,
  pageId: string
): {
  page: Page | null;
  fields: Field[];
  columns: GridColumn[];
  buttons: Button[];
  apis: API[];
} {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId) as PageRow | undefined;
  const fields = db.prepare('SELECT * FROM fields WHERE page_id = ?').all(pageId) as FieldRow[];
  const columns = db.prepare('SELECT * FROM grid_columns WHERE page_id = ?').all(pageId) as GridColumnRow[];
  const buttons = db.prepare('SELECT * FROM buttons WHERE page_id = ?').all(pageId) as ButtonRow[];
  const apis = db
    .prepare(
      `SELECT a.* FROM apis a
       JOIN page_calls_apis pca ON a.id = pca.api_id
       WHERE pca.page_id = ?`
    )
    .all(pageId) as APIRow[];

  return {
    page: page ? rowToPage(page) : null,
    fields: fields.map(rowToField),
    columns: columns.map(rowToGridColumn),
    buttons: buttons.map(rowToButton),
    apis: apis.map(rowToAPI),
  };
}

function searchPages(db: Database.Database, keyword: string, module?: string): Page[] {
  const like = `%${keyword}%`;
  const sql = module
    ? `SELECT * FROM pages WHERE module = ? AND (id LIKE ? OR page_name LIKE ? OR page_title LIKE ?)`
    : `SELECT * FROM pages WHERE id LIKE ? OR page_name LIKE ? OR page_title LIKE ?`;

  const stmt = db.prepare(sql);
  const rows = module
    ? (stmt.all(module, like, like, like) as PageRow[])
    : (stmt.all(like, like, like) as PageRow[]);

  return rows.map(rowToPage);
}

function clearProject(db: Database.Database): void {
  db.exec('DELETE FROM page_calls_apis');
  db.exec('DELETE FROM field_calls_apis');
  db.exec('DELETE FROM fields');
  db.exec('DELETE FROM grid_columns');
  db.exec('DELETE FROM buttons');
  db.exec('DELETE FROM apis');
  db.exec('DELETE FROM pages');
}

// ─── Row mappers ───

interface PageRow {
  id: string;
  module: string;
  page_name: string;
  page_title: string;
  page_type: string | null;
  route: string | null;
  page_function: string | null;
}

interface FieldRow {
  id: string;
  page_id: string;
  field_label: string;
  field_name: string;
  component_type: string;
  required: number;
  default_value: string | null;
}

interface GridColumnRow {
  id: string;
  page_id: string;
  column_title: string;
  field_name: string | null;
  display_content: string;
  editable: number;
  width: number | null;
  sortable: number | null;
  data_type: string | null;
  align: string | null;
}

interface ButtonRow {
  id: string;
  page_id: string;
  button_name: string;
  scope: string;
  position: string;
  display_condition: string | null;
  disabled_condition: string | null;
  click_result: string;
  confirm_required: number;
}

interface APIRow {
  id: string;
  name: string;
  description: string | null;
}

function rowToPage(r: PageRow): Page {
  return {
    id: r.id,
    module: r.module,
    pageName: r.page_name,
    pageTitle: r.page_title,
    pageType: r.page_type ?? undefined,
    route: r.route ?? undefined,
    pageFunction: r.page_function ?? undefined,
  };
}

function rowToField(r: FieldRow): Field {
  return {
    id: r.id,
    pageId: r.page_id,
    fieldLabel: r.field_label,
    fieldName: r.field_name,
    componentType: r.component_type,
    required: r.required === 1,
    defaultValue: r.default_value ?? undefined,
  };
}

function rowToGridColumn(r: GridColumnRow): GridColumn {
  return {
    id: r.id,
    pageId: r.page_id,
    columnTitle: r.column_title,
    fieldName: r.field_name ?? undefined,
    displayContent: r.display_content,
    editable: r.editable === 1,
    width: r.width ?? undefined,
    sortable: r.sortable === 1,
    dataType: r.data_type ?? undefined,
    align: (r.align as 'left' | 'center' | 'right') ?? undefined,
  };
}

function rowToButton(r: ButtonRow): Button {
  return {
    id: r.id,
    pageId: r.page_id,
    buttonName: r.button_name,
    scope: r.scope,
    position: r.position,
    displayCondition: r.display_condition ?? '',
    disabledCondition: r.disabled_condition ?? '',
    clickResult: r.click_result,
    confirmRequired: r.confirm_required === 1,
  };
}

function rowToAPI(r: APIRow): API {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
  };
}
