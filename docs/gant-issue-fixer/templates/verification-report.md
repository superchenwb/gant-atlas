# 验证结果报告模板

## 修改验证结果

### Worktree 信息
- 分支名: {branch_name}
- 目录: {worktree_dir}

### 代码修改
| 文件 | 状态 |
|-----|------|
| `代码路径/file.tsx` | ✅ 已修改 |

### 代码检查
- TypeScript: ✅ 通过 / ❌ 有错误
- Lint: ✅ 通过 / ⚠️ 有警告
- 代码质量: {score} 分 ({grade})

### 功能验证（gant-create-test）
- 问题复现: ✅ 问题已修复 / ❌ 问题仍存在
- 验证详情: {验证结果描述}

### 文档同步
| 文档文件 | 状态 | 说明 |
|---------|------|------|
| `docs/xxx/main.md` | ✅ 已更新 | {更新内容摘要} |
| `docs/xxx/button-area.md` | ✅ 已更新 | {更新内容摘要} |
| 跳过 | - | 纯样式修改，不影响功能描述 |

### 计划提交预览
| 序号 | 提交信息 | 文件 |
|------|---------|------|
| 1 | `fix(ecr): 修复xxx问题 #{工作项ID}` | `packages/ibom/src/ebom/ecr/detail.tsx`, `hooks.ts` |
| 2 | `fix(eco): 修复ECO列表页问题 #{工作项ID}` | `packages/ibom/src/ebom/eco/list.tsx` |
| 3 | `docs: 更新{模块}功能清单文档` | `docs/ibom/...` |

---
> Step 6 不执行 git commit。确认通过后，Step 7 按上述分组自动执行提交、合并和清理。
