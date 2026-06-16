# Hook 检测模式

### usePageSearch

```tsx
const { loading, onSearch, params, pagination } = usePageSearch(
  async (filterInfo, pageInfo) => {
    // 数据转换发生在这里
    const res = await api.search({ ...filterInfo, pageInfo });
    return { list: res.content, total: res.totalCount };
  }
);
```

### useRequest（ahooks）

```tsx
const { loading, runAsync } = useRequest(api.getDetail, {
  manual: true,
  onSuccess: (data) => {
    setDetailInfo(data);
  },
});
```

### useGrid + useRowSelection

```tsx
const { onGridReady, gridApiRef, gridManagerRef } = useGrid({ schema: gridSchema });
const { rowSelection, selectedRows } = useRowSelection({ gridApiRef });
```

### useConfigTabsSearch（通用多 Tab 数据管理模式）

> **这是通用的多 Tab 主页面数据管理模式**，不限定于特定模块或查询请求类型。任何需要「同一搜索条件 + 多 Tab 切换 + 各 Tab 独立 Grid」的主页面均可采用此模式。

在多 Tab 主页面的 hooks 文件中查找（如 `useSearchTabs`、`useXxxTabs`）。该模式通过一个统一入口管理共享搜索参数，并为每个 Tab 维护独立的 Grid 实例和数据源：

```typescript
// hooks/useXxxTabs.ts
// useConfigTabsSearch 是通用模式，任意多 Tab 页面都可按此结构封装

const {
  params,         // 共享搜索参数（所有 Tab 共用）
  dataSourceMap,  // 各 Tab 数据源映射 { [tabKey]: dataSource[] }
  loading,        // 加载状态
  isLoaded,       // 是否已加载
  activeKey,      // 当前激活 Tab
  onTabChange,    // Tab 切换回调（自动触发 onSearch）
  onSearch,       // 搜索触发
  onRefresh,      // 刷新
  gridMap,        // 各 Tab Grid 实例映射 { [tabKey]: gridRef }
  setData,        // 手动设置数据
} = useConfigTabsSearch(namespace, requestFn);

// namespace: 数据缓存标识（如 'engineeringConfig', 'productConfig'）
// requestFn: (params) => Promise<dataSource[]>
//   - params 为共享搜索参数
//   - 返回当前激活 Tab 的数据
//   - 其他 Tab 的数据由 Hook 内部并行请求
```

**提取要点：**
- `namespace`：数据存储标识（用于跨 Tab 数据缓存）
- `requestFn`：传入的请求函数，负责将搜索参数转换为 API 请求并返回数据
- `dataSourceMap` 中的键 → 对应的 Tab keys（确认有哪些 Tab）
- `gridMap` 中的键 → 各 Tab 的 Grid 管理实例（确认每个 Tab 用的 Grid 组件）
- 该模式的核心价值：共享搜索参数、统一状态管理、自动并行请求各 Tab 数据

### useExtensionFieldSearchAndGridSchema（搜索/表格扩展字段注入）

在页面入口文件中查找，用于将业务自定义扩展字段动态注入到 SearchForm schema 和 Grid columns 中：

```typescript
import { useExtensionFieldSearchAndGridSchema } from '@@ibom/hooks/extensionfields';

const { extensionFieldSearchSchema, getExtensionFieldSearchParams } = useExtensionFieldSearchAndGridSchema(
  businessCode,     // 业务编码（如 'FeatureTable'）
  {
    record: { featureType: 'E' },  // 扩展字段筛选条件
    searchSchema,    // 基础 SearchForm schema（扩展字段将合并到其中）
  }
);
```

**提取要点：**
- `extensionFieldSearchSchema`：合并了扩展字段后的完整搜索 schema（传给 SearchForm）
- `getExtensionFieldSearchParams`：用于在提交搜索前分离基础字段和扩展字段参数（传给 `useConfigTabsSearch` 的请求函数）
- `businessCode`：标识哪类业务的扩展字段
- 分析时需识别哪些字段来自 `searchSchema`（基础），哪些是 Hook 注入的（扩展）

---

