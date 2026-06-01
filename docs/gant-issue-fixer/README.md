# gant-issue-fixer

通用需求修改与 Bug 修复技能，核心特色：**修改代码时同步更新功能清单文档**。

## 依赖

- `gant-feature-docs` — 功能清单文档管理（读取/生成/更新）
- `gant-create-test` — 浏览器测试验证（模式一：只测试）
- `code-detection-toolbox` — 代码质量检测

## 使用方式

### 1. 指定云效工作项（可选）

```
修复云效问题 #12345
分析云效Bug #67890
```

### 2. 描述问题

```
零件详情页的设计信息Tab加载报错，帮我分析修复
icost 成本项目页面的新增按钮点击无反应
```

### 3. 指定文件路径

```
packages/ibom/src/ebom/ecr/detail/index.tsx 有bug，点击保存没反应
```

## 执行流程

1. **获取问题** → 云效(可选) / 描述 / 文件路径
2. **智能分析 + 文档查询** → 代码搜索 + gant-feature-docs 读取/创建文档
3. **浏览器复现** → 委托 gant-create-test（条件执行）
4. **方案确认** → 展示代码 diff + 文档修改计划
5. **执行修改与验证** → 代码修改 + 质量检查 + 测试验证 + 文档同步
6. **提交与收尾** → Git 提交 + 云效更新(可选)

## 配置

包配置见 `config/packages.json`，支持所有业务包：
- ibom — 智能BOM管理系统
- ilowcode — 低代码平台
- ip2system — P2系统
- usersystem — 用户管理系统
- icost — 成本管理系统

新增业务包时，在 `config/packages.json` 中添加对应配置即可。
