# 完成报告模板

## 修复完成报告

### Worktree 信息
- 分支名: `fix/{task-slug}-{timestamp}`
- Worktree 目录: `../{project-name}-wt-{task-slug}-{timestamp}/`
- 合并状态: ✅ 已合并回 {original_branch}
- 清理状态: ✅ Worktree 已移除 / ⚠️ 合并冲突，保留待手动解决

### 代码提交
| 序号 | 提交信息 | 状态 |
|------|---------|------|
| 1 | `fix(ecr): 修复xxx问题 #{工作项ID}` | ✅ 已提交 |
| 2 | `fix(eco): 修复ECO列表页问题 #{工作项ID}` | ✅ 已提交 |
| 3 | `docs: 更新{模块}功能清单文档` | ✅ 已提交 |

- 提交分支: {branch_name}

### 云效状态（如适用）
- 工作项: #{id}
- 工作项状态: ✅ 已更新为"已修复"
- 解决说明: ✅ 已添加

### 文档同步
- 功能清单文档: ✅ 已同步更新 / ⚠️ 不涉及功能变更
- 更新文件数: {count}
- 更新文件列表:
  - `docs/xxx/main.md`
  - `docs/xxx/button-area.md`

### 修改摘要
{简要描述本次修改的内容和影响}
