# 文件结构模式

### 主页面（page-main）文件结构

```
src/{module}/{page}/
  index.tsx              <- 页面入口，SearchForm + Grid + 按钮区域（如有）
  schema.tsx             <- searchSchema + gridSchema（弹出层可能还有 formSchema）
  hooks/
    useXxxSearch.ts      <- usePageSearch + 数据转换
    useXxxGridEdit.ts    <- 表格编辑逻辑（如有）
  types.ts               <- 页面专属类型
  style.ts               <- CSS-in-JS 样式
```

### 详情页（page-detail）文件结构

```
src/{module}/{page}/
  detail/
    index.tsx            <- ContextDetailCard / ContextDetailCardContainer
    store.ts             <- Zustand store（detailInfo, setDetailInfo）
    hooks/
      useDescriptionsItems.ts  <- 头部描述项
    base/
      index.tsx          <- 基本信息页签（SchemaForms）
      schema.ts          <- 表单 Schema
    {tab1}/
      index.tsx          <- 子页签组件
      schema.ts          <- 表格/表单 Schema
    {tab2}/
      ...
```

### 详情页关键模式

#### 1. detailsMap 注册模式

详情页的子页签通过 `detailsMap` 对象注册，在 `detail/index.tsx` 中查找：

```tsx
const detailsMap = {
  base: { label: tr('基本信息'), component: BaseInfoTab },
  bomTree: { label: tr('BOM结构'), component: BomTreeTab },
  changeList: { label: tr('关联变更'), component: ChangeListTab },
};

// 在 ContextDetailCard 或动态菜单中使用
<ContextDetailCard detailsMap={detailsMap} defaultActiveKey="base" />
```

**提取：** 每个子页签的 key、label、对应的组件名。

#### 2. dynamicCmpProps 传递模式

父组件通过 `dynamicCmpProps` 向子页签传递数据和回调：

```tsx
<ContextDetailCard
  detailsMap={detailsMap}
  dynamicCmpProps={{
    detailInfo,        // 详情数据
    setDetailInfo,     // 更新方法
    onRefresh,         // 刷新回调
    canEdit,           // 编辑权限
    // 其他业务数据...
  }}
/>

// 子页签组件通过 props 接收
const BaseInfoTab = ({ detailInfo, setDetailInfo, canEdit }) => {
  // ...
};
```

**提取：** dynamicCmpProps 中传递了哪些字段、字段类型、用途。

#### 3. ContextDetailCard 头部配置

详情页头部（描述项 + 操作按钮）在 `useDescriptionsItems.ts` 中配置：

```tsx
// hooks/useDescriptionsItems.ts
export const useDescriptionsItems = (detailInfo) => [
  { label: tr('编码'), value: detailInfo.code },
  { label: tr('名称'), value: detailInfo.name },
  { label: tr('状态'), value: <StatusTag status={detailInfo.status} /> },
  // ...
];

// detail/index.tsx 中使用
<ContextDetailCard
  title={detailInfo.name}
  descriptionsItems={useDescriptionsItems(detailInfo)}
  extra={
    <>
      <Button onClick={handleEdit}>{tr('编辑')}</Button>
      <Button onClick={handleDelete}>{tr('删除')}</Button>
    </>
  }
/>
```

**提取：** 头部显示哪些字段、字段格式化方式、extra 区域的按钮和操作。

---

