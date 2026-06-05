# 步骤输出格式参考

## 2a 搜索定位结果（必须输出）

```
📋 2a 搜索定位结果：
| 序号 | 代码目录/文件路径 | 定位依据 |
|------|-------------------|---------|
| 1 | packages/ibom/src/ebom/ecr/ | Grep匹配"xxxApi" |
| 2 | packages/ibom/src/components/xxx/ | Glob搜索结果 |
```

> 未输出此表格不可进入 2b。

## 2b 门控检查（必须输出，进入 2c 的唯一凭证）

```
🚧 2b 门控检查：
| 代码目录 | 文档状态 | 处理方式 | 门控 |
|---------|---------|---------|------|
| packages/ibom/src/ebom/ecr/ | ✅ 存在 | 已读取 | ✅ 通过 |
| packages/ibom/src/components/xxx/ | ❌ 缺失 | 用户选择创建 | ✅ 通过 |
| packages/ibom/src/hooks/bom/ | ❌ 缺失 | 用户选择跳过 | ✅ 通过（无文档参考） |
| packages/procomponents/src/... | ⚡ 框架代码 | 用户确认继续 | ✅ 通过 |

✅ 2b 门控已通过，允许进入 2c 使用 Read 工具阅读代码
```

> 未输出此表格禁止进入 2c。

## 2c 分析结论

```
📋 2c 分析结论：
- 问题类型：Bug / 需求修改
- 根因/影响：{一句话描述}
- 涉及文件：{列出需要修改的文件路径}
- 修改思路：{简述修复/实现方向}
```

## 文档路径映射规则

把代码路径中的 `packages/<pkg>/src` 替换为 `ai-harness-root/docs/<pkg>`：

| 场景 | 代码路径 | 文档路径 |
|------|---------|---------|
| 页面目录 | `packages/ibom/src/ebom/ecr/` | `ai-harness-root/docs/ibom/ebom/ecr/` |
| 组件目录 | `packages/ibom/src/components/xxx/` | `ai-harness-root/docs/ibom/components/xxx/main.md` |
| Hook 文件 | `packages/ibom/src/hooks/bom/useBomSearch.ts` | `ai-harness-root/docs/ibom/hooks/bom/useBomSearch.md` |

## Spec 计划模板（Step 5a）

写入 `ai-harness-root/specs/fix-{task-slug}-{timestamp}.md`：

```markdown
## Spec 任务计划

### 任务信息
- 问题来源: 云效 #{id} / 用户描述
- 包名: {pkg}
- 问题类型: Bug / 需求修改
- Worktree 分支: fix/{task-slug}-{timestamp}
- Worktree 目录: {worktree_dir_path}

### 执行步骤（AI 动态规划）
| 序号 | 类型 | 操作 | 文件/工具 |
|------|------|------|----------|
| 1 | 修改 | {具体修改描述} | {file_path} |
| 2 | 文档 | {文档更新描述} | {doc_path} |
| 3 | 质量 | code-detection-toolbox 检查 | {modified_files} |
| 4 | 验证 | gant-create-test 浏览器验证 | {page_info} |
| 5 | 文档 | gant-feature-docs 同步更新 | {doc_dir} |

> Spec 计划不包含 git commit 步骤。提交在 Step 7（用户确认后）自动执行。
```

### Spec 步骤动态规划规则

| 因素 | 影响 |
|------|------|
| 问题复杂度 | 简单 bug 1 个修改步骤；复杂需求多个 |
| 涉及文件数 | 每个文件可独立步骤或合并 |
| 文档需求 | 功能变更决定是否需要文档同步 |
| 验证需求 | 是否可在浏览器中验证 |
| 质量要求 | procomponents 框架代码需更严格检查 |

## 云效解决说明模板（Step 7 合并推送阶段）

仅当问题来源为云效时使用：

```markdown
## 问题解决说明

### 问题原因
{问题根因的文字描述}

### 解决思路
{修复方法的文字描述，不包含具体代码}

### 修改范围
- 修改文件: {file_list}
- 影响模块: {modules}

### 提交记录
| 序号 | 提交信息 |
|------|---------|
| 1 | `fix(模块): {问题描述} #{工作项ID}` |
| 2 | `docs: 更新{模块}功能清单文档` |

### 文档同步
- 功能清单文档: ✅ 已同步更新 / ⚠️ 不涉及功能变更

### Worktree 信息
- 分支: {branch_name}（已合并并清理）
```
