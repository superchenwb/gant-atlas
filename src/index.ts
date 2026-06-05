#!/usr/bin/env node
import { Command } from 'commander';
import { join } from 'path';
import { serve } from './mcp/server.js';
import { runIngest, runQueryPage, runMap, runValidate, runGenerate, runManifest } from './cli/actions.js';
import { setupCommand } from './cli/setup.js';

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
    const result = await runIngest(options.docsPath, options.db, options.force);
    console.error(
      `[gant-atlas] 导入完成: ${result.totalPages} 个页面, 更新 ${result.updated}, 跳过 ${result.skipped}, 删除 ${result.removed}`
    );
  });

program
  .command('mcp')
  .description('启动 MCP Server')
  .addCommand(
    new Command('serve')
      .description('以 stdio 模式启动 MCP Server')
      .option('--db <path>', '全局 SQLite 数据库文件路径（单项目模式，不推荐）')
      .requiredOption('--config <path>', '项目配置文件路径 (JSON)')
      .action(async (options: { db?: string; config: string }) => {
        const { readFileSync } = await import('fs');
        const rawProjects = JSON.parse(readFileSync(options.config, 'utf-8')) as Array<{
          id: string;
          name: string;
          docsPath: string;
          dbPath?: string;
        }>;

        const projects = rawProjects.map((p) => ({
          id: p.id,
          name: p.name,
          docsPath: p.docsPath,
          dbPath: p.dbPath ?? options.db ?? join(p.docsPath, '..', '.gant', 'business-graph.db'),
        }));

        await serve({ projects });
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
        const spec = runQueryPage(pageId, options.db);
        if (spec === null) {
          console.error(`[gant-atlas] 页面 "${pageId}" 不存在`);
          process.exit(1);
        }
        console.log(JSON.stringify(spec, null, 2));
      })
  );

program
  .command('map')
  .description('扫描代码目录，建立代码与功能清单的映射关系（Semantic Mapper）')
  .requiredOption('--codeDir <path>', '代码根目录路径（如 packages/ibom/src）')
  .requiredOption('--routesFile <path>', '路由配置文件路径（如 maps.ts）')
  .requiredOption('--db <path>', 'SQLite 数据库文件路径')
  .action(async (options: { codeDir: string; routesFile: string; db: string }) => {
    const mapping = await runMap(options.codeDir, options.routesFile, options.db);
    console.log(JSON.stringify(mapping, null, 2));
  });

program
  .command('validate')
  .description('验证数据一致性（CI/CD 用）')
  .requiredOption('--db <path>', 'SQLite 数据库文件路径')
  .option('--codeDir <path>', '代码根目录路径（可选，启用 Semantic Mapper）')
  .option('--routesFile <path>', '路由配置文件路径（可选）')
  .action(async (options: { db: string; codeDir?: string; routesFile?: string }) => {
    const result = await runValidate(options.db, options.codeDir, options.routesFile);

    const output = result.mapping
      ? { consistency: result.consistency, mapping: result.mapping }
      : result.consistency;

    console.log(JSON.stringify(output, null, 2));

    if (result.hasIssues) {
      process.exit(1);
    }
  });

program
  .command('generate')
  .description('根据代码自动生成 feature-doc 骨架')
  .requiredOption('--codeDir <path>', '代码根目录路径')
  .requiredOption('--routesFile <path>', '路由配置文件路径')
  .requiredOption('--docsPath <path>', '功能清单输出目录路径')
  .option('--page <pageId>', '仅生成指定页面（格式：module/pageName）')
  .option('--force', '强制覆盖已有文件')
  .option('--dry-run', '预览生成内容，不写入磁盘')
  .action(async (options: { codeDir: string; routesFile: string; docsPath: string; page?: string; force?: boolean; dryRun?: boolean }) => {
    const result = await runGenerate(options);
    console.error(`[gant-atlas] 生成完成: ${result.generated.length} 个文件, 跳过 ${result.skipped.length} 个已有文件`);
    if (result.skipped.length > 0 && !options.force) {
      console.error(`[gant-atlas] 提示: 使用 --force 可覆盖已有文件`);
    }
  });

program
  .command('manifest')
  .description('导出项目功能清单（YAML/JSON）')
  .requiredOption('--db <path>', 'SQLite 数据库文件路径')
  .option('--format <format>', '输出格式: yaml 或 json', 'yaml')
  .option('--output <path>', '输出文件路径（默认 stdout）')
  .action(async (options: { db: string; format?: string; output?: string }) => {
    const fmt = options.format?.toLowerCase() ?? 'yaml';
    const result = runManifest(options.db);

    const out = fmt === 'json' ? result.json : result.yaml;

    if (options.output) {
      const { writeFileSync } = await import('fs');
      writeFileSync(options.output, out, 'utf-8');
      console.error(`[gant-atlas] 清单已导出: ${options.output}`);
    } else {
      console.log(out);
    }
  });

program
  .command('setup')
  .description('一键配置 MCP（支持 Cursor、Claude Code、OpenCode、Codex）')
  .action(async () => {
    await setupCommand();
  });

program.parse();
