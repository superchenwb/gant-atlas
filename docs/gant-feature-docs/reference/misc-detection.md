# 其他检测方法

业务组件**不是**直接从 procomponents 引入的。查找：

1. **Schema 中的自定义 componentType**：`componentType: 'PartTypeSelect'`, `'LoupeSelect'` 等
2. **Grid 中的自定义 render**：`render: (text) => <CustomCell />`
3. **导入的组件**：`import { PartTypeSelect } from '@/components'`

发现后提取：
- 它在页面上呈现成什么前端能力
- 它承载了哪些字段、列、按钮、弹窗或选择逻辑
- 它依赖哪些数据源（如果前端可见）
- 它有哪些特殊交互规则

> 注意：文件路径、导入路径、是否公共组件等信息只用于分析过程，不进入最终文档。

---

## API 端点提取

在这些模式中查找 API 调用：

```typescript
// 模式 1：直接导入
import { searchBom, deleteBom, updateBom } from '@/services/bom';

// 模式 2：内联 fetch
const res = await request.post('/api/bom/list', params);

// 模式 3：Service 文件
// services/bom.ts
export const searchBom = (params) => request.post('/api/bom/list', params);
```

提取：HTTP 方法、URL 路径、请求参数、响应结构。

### API 可达性规则

Service 文件中经常存在历史导出或备用接口。生成页面文档时只记录**当前页面可达**的 API：

1. 从页面入口 `index.tsx` 的 import、Hook、按钮组件、弹窗组件开始追踪。
2. 只收录被当前页面实际调用的 service 函数，或被当前页面渲染的子组件实际调用的 service 函数。
3. 对 service 文件中未被导入、未被调用的导出函数，不要放入接口调用链。
4. 对黑盒框架组件（如上传、导入、预览）内部接口无法从源码追踪时，写"组件内部处理/源码未显式声明"，不要臆造 URL。
5. 若某个接口名称看似相关但没有可达调用路径，应忽略；可在不确定时标注"未发现当前页面调用"，但不要作为页面主接口列出。

---

## 权限检测

查找：

```tsx
// 模式 1：useAuth hook
const { hasPermission } = useAuth();
const canDelete = hasPermission('bom:ebom:delete');

// 模式 2：Permission 包装器
<Permission code="bom:ebom:delete">
  <DeleteButton />
</Permission>

// 模式 3：条件渲染
{hasPermission('bom:ebom:edit') && <EditButton />}
```

提取：权限编码字符串、控制的范围（按钮显示/禁用）。

### 模块权限绑定校验

本项目常见权限写法是：

```typescript
// auth.ts
import { pageModule, moduleAuth, ModuleAuthActions } from '@@ibom/auth';
export const auth = moduleAuth.bind(null, pageModule);

// 页面
{auth(ModuleAuthActions.maintain) && <Button />}
```

提取时需要记录两层信息：

| 信息 | 输出 |
|------|------|
| 模块变量 | `pageModule` 等实际绑定变量 |
| 动作 | `ModuleAuthActions.maintain` / `ModuleAuthActions.edit` 等实际动作 |

**异常检测规则：**

- 将 `auth.ts` 中绑定的模块变量与页面目录、路由、菜单标题进行语义比对。
- 如果页面目录、路由、菜单标题指向业务 A，但 `auth.ts` 绑定的是明显属于业务 B 的模块变量，不要自动纠正为期望模块。
- 文档应写实际源码绑定，并在"特殊说明"或"权限说明"中标注：`潜在权限模块不匹配，需确认是否应使用当前页面对应模块`。
- 权限字段不要只写动作名；应尽量写成 `模块变量 + 动作`，例如 `pageModule + ModuleAuthActions.maintain`。
