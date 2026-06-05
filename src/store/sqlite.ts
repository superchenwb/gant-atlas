import Database from 'better-sqlite3';
import type { GraphNode, GraphEdge, NodeType, EdgeType } from '../types/graph.js';

export const SCHEMA_VERSION = 3;

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

// ─── Input validation helpers (DX fix: DoS protection) ───

export const MAX_INPUT_LENGTH = 10_000;
export const MAX_PATH_LENGTH = 4_096;

export function validateInputLength(input: string, maxLength: number = MAX_INPUT_LENGTH): string | null {
  if (input.length > maxLength) return `Input exceeds max length (${maxLength})`;
  return null;
}

export function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

export interface Store {
  initSchema(): void;

  // ─── 统一图谱模型接口 ───
  insertNode(node: GraphNode): void;
  insertEdge(edge: GraphEdge): void;
  listNodesByType(type: NodeType): GraphNode[];
  listAllNodes(): GraphNode[];
  searchNodes(keyword: string): GraphNode[];
  listEdges(): GraphEdge[];
  deleteNode(nodeId: string): void;
  deleteEdgesForNode(nodeId: string): void;
  getNodeById(nodeId: string): GraphNode | null;
  getNodesByIds(nodeIds: string[]): GraphNode[];
  getEdgesFromSource(sourceId: string): GraphEdge[];
  getEdgesToTarget(targetId: string): GraphEdge[];

  // ─── Phase 2: stale marking ───
  markNodeStale(nodeId: string, stale: boolean): void;
  getStalePages(): GraphNode[];

  // ─── Phase 1 新增接口 ───
  searchNodesFTS(keyword: string): GraphNode[];
  getCallGraph(nodeId: string, maxDepth?: number): { nodes: GraphNode[]; edges: GraphEdge[] };
  findDeadApis(): GraphNode[];
  findOrphanFields(): GraphNode[];
  isFTS5Available(): boolean;

  clearProject(): void;
  close(): void;
}

// Internal WeakMap to allow tightly-coupled modules to access raw SQL
const dbMap = new WeakMap<Store, Database.Database>();

export function getStoreDatabase(store: Store): Database.Database {
  const db = dbMap.get(store);
  if (!db) throw new Error('Store database instance not found');
  return db;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'unified_graph',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          tags TEXT NOT NULL DEFAULT '[]',
          meta TEXT,
          module TEXT,
          docs_path TEXT,
          content_hash TEXT
        );

        CREATE TABLE IF NOT EXISTS edges (
          source TEXT NOT NULL,
          target TEXT NOT NULL,
          type TEXT NOT NULL,
          description TEXT,
          PRIMARY KEY (source, target, type)
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
        CREATE INDEX IF NOT EXISTS idx_nodes_module ON nodes(module);
        CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
        CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
        CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
      `);
    },
    down(db) {
      db.exec(`
        DROP INDEX IF EXISTS idx_edges_target;
        DROP INDEX IF EXISTS idx_edges_source;
        DROP INDEX IF EXISTS idx_nodes_name;
        DROP INDEX IF EXISTS idx_nodes_module;
        DROP INDEX IF EXISTS idx_nodes_type;
        DROP TABLE IF EXISTS edges;
        DROP TABLE IF EXISTS nodes;
        DROP TABLE IF EXISTS __version;
      `);
    },
  },
  {
    version: 2,
    name: 'fts5_search',
    up(db) {
      // FTS5 virtual table for full-text search over nodes
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
          id, name, title, summary,
          content='nodes', content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
          INSERT INTO nodes_fts(rowid, id, name, title, summary)
          VALUES (NEW.rowid, NEW.id, NEW.name, NEW.title, NEW.summary);
        END;

        CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, id, name, title, summary)
          VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.title, OLD.summary);
        END;

        CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, id, name, title, summary)
          VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.title, OLD.summary);
          INSERT INTO nodes_fts(rowid, id, name, title, summary)
          VALUES (NEW.rowid, NEW.id, NEW.name, NEW.title, NEW.summary);
        END;
      `);

      // Backfill existing nodes into FTS index
      db.exec(`
        INSERT INTO nodes_fts(rowid, id, name, title, summary)
        SELECT rowid, id, name, title, summary FROM nodes;
      `);
    },
    down(db) {
      db.exec(`
        DROP TRIGGER IF EXISTS nodes_ai;
        DROP TRIGGER IF EXISTS nodes_ad;
        DROP TRIGGER IF EXISTS nodes_au;
        DROP TABLE IF EXISTS nodes_fts;
      `);
    },
  },
  {
    version: 3,
    name: 'add_stale_flag',
    up(db) {
      db.exec(`ALTER TABLE nodes ADD COLUMN stale INTEGER NOT NULL DEFAULT 0`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_stale ON nodes(stale)`);
    },
    down(db) {
      db.exec(`DROP INDEX IF EXISTS idx_nodes_stale`);
      // SQLite doesn't support DROP COLUMN; downgrade requires table rebuild
    },
  },
];

export function migrate(
  db: Database.Database,
  targetVersion: number = SCHEMA_VERSION,
  migrationsToRun: Migration[] = migrations
): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS __version (
      key TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    )
  `);

  const versionRow = db.prepare("SELECT version FROM __version WHERE key = 'schema'").get() as
    | { version: number }
    | undefined;
  let currentVersion = versionRow?.version ?? 0;

  const pending = migrationsToRun
    .filter((m) => m.version > currentVersion && m.version <= targetVersion)
    .sort((a, b) => a.version - b.version);

  // Note: production deployments should manually backup before running migrations.
  // Auto-backup was removed because it caused race conditions in parallel test runners.

  for (const m of pending) {
    m.up(db);
    currentVersion = m.version;
  }

  db.prepare("INSERT OR REPLACE INTO __version (key, version) VALUES ('schema', ?)").run(
    targetVersion
  );

  return currentVersion;
}

export function createStore(dbPath: string): Store {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const store: Store = {
    initSchema: () => migrate(db),
    insertNode: (node) => insertNode(db, node),
    insertEdge: (edge) => insertEdge(db, edge),
    listNodesByType: (type) => listNodesByType(db, type),
    listAllNodes: () => listAllNodes(db),
    searchNodes: (keyword) => searchNodes(db, keyword),
    listEdges: () => listEdges(db),
    deleteNode: (nodeId) => deleteNode(db, nodeId),
    deleteEdgesForNode: (nodeId) => deleteEdgesForNode(db, nodeId),
    getNodeById: (nodeId) => getNodeById(db, nodeId),
    getNodesByIds: (nodeIds) => getNodesByIds(db, nodeIds),
    getEdgesFromSource: (sourceId) => getEdgesFromSource(db, sourceId),
    getEdgesToTarget: (targetId) => getEdgesToTarget(db, targetId),
    // Phase 1 new methods
    searchNodesFTS: (keyword) => searchNodesFTS(store, keyword),
    getCallGraph: (nodeId, maxDepth) => getCallGraph(store, nodeId, maxDepth),
    findDeadApis: () => findDeadApis(store),
    findOrphanFields: () => findOrphanFields(store),
    isFTS5Available: () => checkFTS5Available(db),
    markNodeStale: (nodeId, stale) => markNodeStale(db, nodeId, stale),
    getStalePages: () => getStalePages(db),
    clearProject: () => clearProject(db),
    close: () => db.close(),
  };

  dbMap.set(store, db);
  store.initSchema();
  return store;
}

// ─── Node operations ───

function insertNode(db: Database.Database, node: GraphNode): void {
  db.prepare(
    `INSERT INTO nodes (id, type, name, title, summary, tags, meta, module, docs_path, content_hash, stale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       name = excluded.name,
       title = excluded.title,
       summary = excluded.summary,
       tags = excluded.tags,
       meta = excluded.meta,
       module = excluded.module,
       docs_path = excluded.docs_path,
       content_hash = excluded.content_hash,
       stale = excluded.stale`
  ).run(
    node.id,
    node.type,
    node.name,
    node.title,
    node.summary,
    JSON.stringify(node.tags),
    node.meta ? JSON.stringify(node.meta) : null,
    node.module ?? null,
    node.docsPath ?? null,
    node.contentHash ?? null,
    (node as GraphNode & { stale?: boolean }).stale ? 1 : 0
  );
}

function listNodesByType(db: Database.Database, type: NodeType): GraphNode[] {
  const rows = db.prepare('SELECT * FROM nodes WHERE type = ?').all(type) as NodeRow[];
  return rows.map(rowToNode);
}

function listAllNodes(db: Database.Database): GraphNode[] {
  const rows = db.prepare('SELECT * FROM nodes').all() as NodeRow[];
  return rows.map(rowToNode);
}

function searchNodes(db: Database.Database, keyword: string): GraphNode[] {
  const like = `%${keyword}%`;
  const rows = db
    .prepare(`SELECT * FROM nodes WHERE id LIKE ? OR name LIKE ? OR title LIKE ?`)
    .all(like, like, like) as NodeRow[];
  return rows.map(rowToNode);
}

function getNodeById(db: Database.Database, nodeId: string): GraphNode | null {
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId) as NodeRow | undefined;
  return row ? rowToNode(row) : null;
}

function getNodesByIds(db: Database.Database, nodeIds: string[]): GraphNode[] {
  if (nodeIds.length === 0) return [];
  const placeholders = nodeIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...nodeIds) as NodeRow[];
  return rows.map(rowToNode);
}

function deleteNode(db: Database.Database, nodeId: string): void {
  db.prepare('DELETE FROM edges WHERE source = ? OR target = ?').run(nodeId, nodeId);
  db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
}

function markNodeStale(db: Database.Database, nodeId: string, stale: boolean): void {
  db.prepare('UPDATE nodes SET stale = ? WHERE id = ?').run(stale ? 1 : 0, nodeId);
}

function getStalePages(db: Database.Database): GraphNode[] {
  const rows = db.prepare("SELECT * FROM nodes WHERE type = 'page' AND stale = 1").all() as NodeRow[];
  return rows.map(rowToNode);
}

// ─── Edge operations ───

function insertEdge(db: Database.Database, edge: GraphEdge): void {
  db.prepare(
    `INSERT INTO edges (source, target, type, description)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(source, target, type) DO UPDATE SET
       description = excluded.description`
  ).run(
    edge.source,
    edge.target,
    edge.type,
    edge.description ?? null
  );
}

function listEdges(db: Database.Database): GraphEdge[] {
  const rows = db.prepare('SELECT * FROM edges').all() as EdgeRow[];
  return rows.map(rowToEdge);
}

function getEdgesFromSource(db: Database.Database, sourceId: string): GraphEdge[] {
  const rows = db.prepare('SELECT * FROM edges WHERE source = ?').all(sourceId) as EdgeRow[];
  return rows.map(rowToEdge);
}

function getEdgesToTarget(db: Database.Database, targetId: string): GraphEdge[] {
  const rows = db.prepare('SELECT * FROM edges WHERE target = ?').all(targetId) as EdgeRow[];
  return rows.map(rowToEdge);
}

function deleteEdgesForNode(db: Database.Database, nodeId: string): void {
  db.prepare('DELETE FROM edges WHERE source = ? OR target = ?').run(nodeId, nodeId);
}

// ─── Project operations ───

function clearProject(db: Database.Database): void {
  db.exec('DELETE FROM edges');
  db.exec('DELETE FROM nodes');
}

// ─── Row mappers ───

interface NodeRow {
  id: string;
  type: string;
  name: string;
  title: string;
  summary: string;
  tags: string;
  meta: string | null;
  module: string | null;
  docs_path: string | null;
  content_hash: string | null;
  stale: number;
}

interface EdgeRow {
  source: string;
  target: string;
  type: string;
  description: string | null;
}

function rowToNode(r: NodeRow): GraphNode {
  const node: GraphNode = {
    id: r.id,
    type: r.type as NodeType,
    name: r.name,
    title: r.title,
    summary: r.summary,
    tags: safeJsonParse(r.tags, []),
    meta: safeJsonParse(r.meta, undefined),
    module: r.module ?? undefined,
    docsPath: r.docs_path ?? undefined,
    contentHash: r.content_hash ?? undefined,
  };
  // Attach stale flag as a runtime property (not part of GraphNode interface)
  if (r.stale === 1) {
    (node as GraphNode & { stale?: boolean }).stale = true;
  }
  return node;
}

function rowToEdge(r: EdgeRow): GraphEdge {
  return {
    source: r.source,
    target: r.target,
    type: r.type as EdgeType,
    description: r.description ?? undefined,
  };
}

function safeJsonParse<T>(input: string | null, fallback: T): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

// ─── Phase 1: FTS5 + Graph traversal helpers ───

function checkFTS5Available(db: Database.Database): boolean {
  try {
    const result = db.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') as enabled").get() as
      | { enabled: number }
      | undefined;
    return result?.enabled === 1;
  } catch {
    return false;
  }
}

function fallbackSearch(db: Database.Database, keyword: string): GraphNode[] {
  const like = `%${keyword}%`;
  const rows = db
    .prepare(`SELECT * FROM nodes WHERE id LIKE ? OR name LIKE ? OR title LIKE ? OR summary LIKE ?`)
    .all(like, like, like, like) as NodeRow[];
  return rows.map(rowToNode);
}

const CJK_RE = /[一-鿿㐀-䶿]/;

function searchNodesFTS(store: Store, keyword: string): GraphNode[] {
  const db = getStoreDatabase(store);

  // Sanitize keyword for FTS5 (escape quotes)
  const sanitized = keyword.replace(/"/g, '""').trim();
  if (!sanitized) return [];

  if (!checkFTS5Available(db)) {
    return fallbackSearch(db, keyword);
  }

  try {
    // Try original query first
    let rows = db
      .prepare(
        `SELECT n.* FROM nodes n
         JOIN nodes_fts fts ON n.rowid = fts.rowid
         WHERE nodes_fts MATCH ?
         LIMIT 100`
      )
      .all(sanitized) as NodeRow[];

    // If empty and keyword contains CJK, try single-char tokenization
    // FTS5 simple tokenizer indexes CJK as single chars, so "支付" → "支 付"
    if (rows.length === 0 && CJK_RE.test(sanitized)) {
      const cjkQuery = sanitized.split('').join(' ');
      rows = db
        .prepare(
          `SELECT n.* FROM nodes n
           JOIN nodes_fts fts ON n.rowid = fts.rowid
           WHERE nodes_fts MATCH ?
           LIMIT 100`
        )
        .all(cjkQuery) as NodeRow[];
    }

    if (rows.length === 0) {
      return fallbackSearch(db, keyword);
    }
    return rows.map(rowToNode);
  } catch {
    // FTS5 query syntax error → fallback to LIKE
    return fallbackSearch(db, keyword);
  }
}

function getCallGraph(
  store: Store,
  nodeId: string,
  maxDepth: number = 2
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const safeDepth = clamp(maxDepth, 1, 5);
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const resultNodes: GraphNode[] = [];
  const resultEdges: GraphEdge[] = [];

  let queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visitedNodes.has(id)) continue;
    visitedNodes.add(id);

    const node = store.getNodeById(id);
    if (node) resultNodes.push(node);

    if (depth >= safeDepth) continue;

    // outgoing edges
    const outEdges = store.getEdgesFromSource(id);
    for (const e of outEdges) {
      const edgeKey = `${e.source}-${e.target}-${e.type}`;
      if (!visitedEdges.has(edgeKey)) {
        visitedEdges.add(edgeKey);
        resultEdges.push(e);
      }
      if (!visitedNodes.has(e.target)) {
        queue.push({ id: e.target, depth: depth + 1 });
      }
    }

    // incoming edges
    const inEdges = store.getEdgesToTarget(id);
    for (const e of inEdges) {
      const edgeKey = `${e.source}-${e.target}-${e.type}`;
      if (!visitedEdges.has(edgeKey)) {
        visitedEdges.add(edgeKey);
        resultEdges.push(e);
      }
      if (!visitedNodes.has(e.source)) {
        queue.push({ id: e.source, depth: depth + 1 });
      }
    }
  }

  return { nodes: resultNodes, edges: resultEdges };
}

function findDeadApis(store: Store): GraphNode[] {
  const apis = store.listNodesByType('api');
  const allEdges = store.listEdges();
  const referenced = new Set<string>();

  for (const e of allEdges) {
    if (e.target.startsWith('api:')) {
      referenced.add(e.target);
    }
  }

  return apis.filter((api) => !referenced.has(api.id));
}

function findOrphanFields(store: Store): GraphNode[] {
  const fields = store.listNodesByType('field');
  const allEdges = store.listEdges();
  const contained = new Set<string>();

  for (const e of allEdges) {
    if (e.type === 'contains' && e.target.startsWith('field:')) {
      contained.add(e.target);
    }
  }

  return fields.filter((field) => !contained.has(field.id));
}
