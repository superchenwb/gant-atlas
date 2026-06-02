#!/usr/bin/env node
import { Command } from 'commander';
import { buildGraph } from './graph/builder.js';
import { createStore } from './store/sqlite.js';
import { serve } from './mcp/server.js';

const program = new Command();

program
  .name('gant-atlas')
  .description('业务知识图谱引擎 — 将 feature-docs 解析为可查询的业务关系图')
  .version('0.1.0');

program
  .command('ingest')
  .description('将功能清单目录导入 SQLite 数据库')
  .requiredOption('--docsPath <path>', '功能清单根目录路径')
  .requiredOption('--db <path>', 'SQLite 数据库文件路径')
  .action((options: { docsPath: string; db: string }) => {
    console.error(`[gant-atlas] 正在导入: ${options.docsPath} -> ${options.db}`);

    const store = createStore(options.db);
    store.clearProject();

    const docs = buildGraph(options.docsPath);

    for (const doc of docs) {
      store.insertPage(doc.page);
      for (const field of doc.fields) store.insertField(field);
      for (const col of doc.columns) store.insertGridColumn(col);
      for (const btn of doc.buttons) store.insertButton(btn);
      for (const api of doc.apis) store.insertAPI(api);
      for (const rel of doc.relations.pageHasApis) {
        store.insertPageAPI(rel.pageId, rel.apiId);
      }
      for (const rel of doc.relations.fieldCallsApis) {
        store.db
          .prepare(
            `INSERT INTO field_calls_apis (field_id, api_id) VALUES (?, ?) ON CONFLICT(field_id, api_id) DO NOTHING`
          )
          .run(rel.fieldId, rel.apiId);
      }
    }

    console.error(`[gant-atlas] 导入完成: ${docs.length} 个页面`);
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

program.parse();
