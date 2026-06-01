# GBrain 能否满足需求的诚实分析

## 直接结论

**不能完全满足。**

GBrain 擅长"搜索相关文档"，但我们的核心需求是"结构化关系查询"和"影响面分析"。两者的数据模型不匹配。

---

## 逐个需求分析

### 需求 1：规格查询 — "数据权限管理页面有哪些查询字段？"

**GBrain 原生做法：**

把 `dataauthgroup/search-area.md` 作为一整页存入 gbrain：

```json
{
  "id": "bombusiness-dataauthgroup-search-area",
  "content": "# 查询区域\n\n## 数据授权名称\n| 属性 | 内容 |\n| 字段标签 | 数据授权名称 |\n| 参数名 | dataAuthName |\n..."
}
```

查询：
```bash
gbrain search "数据权限管理 查询字段"
```

**结果：** gbrain 返回整个 `search-area.md` 的内容（或片段）。

**问题：**
- AI 拿到的是**文本**，不是结构化数据
- AI 需要自己从 Markdown 表格里提取"字段标签、参数名、控件类型"
- 如果文档很长，gbrain 可能截断，丢失部分字段
- 每次查询都要重新解析表格，低效且易错

** verdict：能做，但体验差。**

---

### 需求 2：影响面分析 — "修改 dataAuthGroupFindListApi 会影响哪些页面？"

**GBrain 原生做法：**

这个需求需要**关系遍历**：
```
接口 dataAuthGroupFindListApi
    → 被字段 dataAuthName 使用
    → 属于页面 数据权限管理
    → 同时被页面 业务字段扩展 使用
```

GBrain 没有"关系"概念。它只有"文档相似度"。

你可以尝试：
```bash
gbrain search "dataAuthGroupFindListApi"
```

**结果：** gbrain 返回所有**提到**这个字符串的文档。

**问题：**
- 返回的是"提到这个接口的文档"，不是"使用这个接口的页面"
- 无法区分"接口定义"和"接口使用"
- 无法回答"这个接口被哪些字段使用"（字段和接口的关系不存在）
- 如果一个页面有 10 个接口，gbrain 无法告诉你"具体是哪些字段在用这个接口"

**verdict：不能做。** 这是结构化关系查询，不是文本搜索。

---

### 需求 3：一致性校验 — "代码和规格文档一致吗？"

**GBrain 原生做法：**

需要对比两个列表：
- feature-docs 中的字段列表：[数据授权名称, 数据授权编码, 数据授权级别]
- 代码中的字段列表：[dataAuthName, dataAuthCode, createTime]

GBrain 可以分别存储两边的信息，但无法做**结构化对比**。

你可以问：
```bash
gbrain search "dataauthgroup schema.ts 字段"
gbrain search "dataauthgroup search-area 字段"
```

**结果：** 拿到两段文本，AI 需要自己对比。

**问题：**
- 无法自动发现"feature-docs 有但代码没有"的字段
- 无法自动发现"代码有但 feature-docs 没有"的字段
- 每次校验都要 AI 读两段文本、自己对比，不可靠

**verdict：不能做。** 需要结构化数据对比，gbrain 没有表结构概念。

---

## 如果强行基于 GBrain 做，方案是什么？

**方案：把每个业务元素拆成独立 page，用标签标记关系。**

```json
{
  "id": "field-dataauthgroup-dataAuthName",
  "content": "字段: 数据授权名称\n参数名: dataAuthName\n所属页面: 数据权限管理\n关联接口: dataAuthGroupFindListApi",
  "tags": ["field", "dataauthgroup", "dataAuthGroupFindListApi"]
}

{
  "id": "api-dataAuthGroupFindListApi",
  "content": "接口: dataAuthGroupFindListApi\n描述: 分页查询数据权限组列表",
  "tags": ["api", "dataAuthGroupFindListApi"]
}
```

查询影响面：
```bash
gbrain search "dataAuthGroupFindListApi"
# 返回所有带这个标签的 page（字段、页面、接口定义）
```

**这个方案的缺陷：**

| 问题 | 说明 |
|------|------|
| 数据预处理复杂 | 需要把 Markdown 拆成几十个独立 page，维护映射关系 |
| 查询不精确 | 语义搜索会返回"相似"结果，可能混入无关内容 |
| 无法多跳遍历 | 无法做"接口 → 字段 → 页面"的链式查询 |
| 一致性校验仍做不了 | 没有表结构，无法做集合对比 |
| 违背 gbrain 设计 | gbrain 设计为"文档知识库"，不是"关系数据库" |

---

## 唯一可行的折中：利用 GBrain 的基础设施

GBrain 的底层是 Postgres（或 PGLite）+ pgvector。

**如果我们直接访问 gbrain 的数据库：**

可以在同一个 Postgres 实例中：
- gbrain 用自己的 schema 存文档和向量
- atlas 用自己的 schema 存业务关系表

两者共享数据库进程，但逻辑隔离。

**但这意味着：**
- 不基于 gbrain 的"文档模型"
- 只是借用它的数据库基础设施
- 本质上还是在 Postgres 上自建关系表

**为什么不直接用 SQLite？**
- Postgres 更强大，但 gbrain 的 PGLite/Postgres 是 gbrain 的内部实现细节
- 依赖 gbrain 的数据库 = 耦合 gbrain 的部署方式
- SQLite 零配置、单文件、足够满足需求

---

## 最终结论

| 问题 | 答案 |
|------|------|
| 需求能否完全用 gbrain 完成？ | **不能。** 影响面分析和一致性校验无法满足 |
| 能否基于 gbrain 的基础设施做？ | 技术上可以（共用 Postgres），但耦合度高，不如 SQLite 独立 |
| 最优方案 | **借鉴 gitnexus 思路（扫描 → 图谱化 → 查询），用 SQLite 自建关系存储** |

**一句话：gbrain 是搜索引擎，我们要造的是数据库。引擎和数据库可以并存，但一个不能替代另一个。**
