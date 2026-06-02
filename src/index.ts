#!/usr/bin/env node
import { Command } from 'commander';
import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { buildGraphAsync } from './graph/builder.js';
import { createStore } from './store/sqlite.js';
import { serve } from './mcp/server.js';
import { buildMapping } from './code-scanner.js';

const program = new Command();

program
  .name('gant-atlas')
  .description('业务知识图谱引擎 — 将 feature-docs 解析为可查询的业务关系图')
  .version('0.1.0');

program
  .command('ingest')
  .description('将功能清单目录导入 SQLite 数据库（支持增量更新）')
  .requiredOption('--docsPath <path>', '功能清单根目录路径')
  .requiredOption('--db <path>', 'SQLite 数据库文件路径')
  .option('--force', '强制全量重建（忽略增量检测）')
  .action(async (options: { docsPath: string; db: string; force?: boolean }) => {
    console.error(`[gant-atlas] 正在导入: ${options.docsPath} -> ${options.db}`);

    const store = createStore(options.db);

    if (options.force) {
      store.clearProject();
    }

    const existingHashes = store.getPageHashes();
    const docs = await buildGraphAsync(options.docsPath);

    // Track which pages from DB are still present in filesystem
    const seenPageIds = new Set<string>();
    let updatedCount = 0;
    let skippedCount = 0;

    for (const doc of docs) {
      const pageId = doc.page.id;
      seenPageIds.add(pageId);

      const pagePath = join(options.docsPath, doc.page.module, doc.page.pageName);
      const currentHash = computePageHash(pagePath);
      const existingHash = existingHashes.get(pageId);

      if (existingHash === currentHash) {
        skippedCount++;
        continue;
      }

      // Page is new or changed — clean old entities and re-insert
      store.deletePageEntities(pageId);
      store.insertPage(doc.page, currentHash);
      for (const field of doc.fields) store.insertField(field);
      for (const col of doc.columns) store.insertGridColumn(col);
      for (const btn of doc.buttons) store.insertButton(btn);
      for (const api of doc.apis) store.insertAPI(api);
      for (const rel of doc.relations.pageHasApis) {
        store.insertPageAPI(rel.pageId, rel.apiId);
      }
      for (const rel of doc.relations.fieldCallsApis) {
        store.insertFieldCallsAPI(rel.fieldId, rel.apiId);
      }
      updatedCount++;
    }

    // Remove pages that exist in DB but not in filesystem
    let removedCount = 0;
    for (const [pageId] of existingHashes) {
      if (!seenPageIds.has(pageId)) {
        store.deletePage(pageId);
        removedCount++;
      }
    }

    console.error(
      `[gant-atlas] 导入完成: ${docs.length} 个页面, 更新 ${updatedCount}, 跳过 ${skippedCount}, 删除 ${removedCount}`
    );
    store.db.close();
  });

program
  .command('mcp')
  .description('启动 MCP Server')
  .addCommand(
    new Command('serve')
      .description('以 stdio 模式启动 MCP Server')
      .requiredOption('--db <path>', 'SQLite 数据库文件路径')
      .requiredOption('--config <path>', '项目配置文件路径 (JSON)')
      .action(async (options: { db: string; config: string }) => {
        const { readFileSync } = await import('fs');
        const projects = JSON.parse(readFileSync(options.config, 'utf-8')) as Array<{
          id: string;
          name: string;
          docsPath: string;
        }>;

        const store = createStore(options.db);
        await serve({ store, projects });
      })
  );

program
  .command('query')
  .description('查询页面规格（人类用）')
  .addCommand(
    new Command('page')
      .description('查询指定页面的完整规格')
      .argument('<pageId>', '页面 ID（格式：module/pageName）')
      .requiredOption('--db <path>', 'SQLite 数据库文件路径')
      .action((pageId: string, options: { db: string }) => {
        const store = createStore(options.db);
        const spec = store.getPageSpec(pageId);
        if (!spec.page) {
          console.error(`[gant-atlas] 页面 "${pageId}" 不存在`);
          process.exit(1);
        }
        console.log(JSON.stringify(spec, null, 2));
        store.db.close();
      })
  );

program
  .command('map')
  .description('扫描代码目录，建立代码与功能清单的映射关系（Semantic Mapper）')
  .requiredOption('--codeDir <path>', '代码根目录路径（如 packages/ibom/src）')
  .requiredOption('--routesFile <path>', '路由配置文件路径（如 maps.ts）')
  .requiredOption('--db <path>', 'SQLite 数据库文件路径')
  .action((options: { codeDir: string; routesFile: string; db: string }) => {
    const store = createStore(options.db);
    const mapping = buildMapping(options.codeDir, options.routesFile, store);
    console.log(JSON.stringify(mapping, null, 2));
    store.db.close();
  });

program.parse();

// ─── Helpers ───

function computePageHash(pagePath: string): string {
  const hash = createHash('sha256');
  const files = readdirSync(pagePath)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort();

  for (const file of files) {
    const filePath = join(pagePath, file);
    const stat = statSync(filePath);
    hash.update(file);
    hash.update(stat.mtime.toISOString());
    hash.update(readFileSync(filePath, 'utf-8'));
  }

  return hash.digest('hex');
}
