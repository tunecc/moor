# Servers 列表视图切换与搜索 — Design Spec

**日期:** 2026-08-06  
**状态:** Approved for planning  
**范围:** moor 前端 Servers 页面 UI 优化  
**参考:** mcp-router `Home.tsx` 的 list/grid + search 交互（仅学交互，不照搬视觉与项目分组）

## 1. 背景与问题

当前 Servers 页（`src/pages/Servers.tsx`）只支持纵向一行一卡：

- 空间利用率低，服务器数量上来后需要大量滚动
- 顶部无搜索，只能靠肉眼扫
- 卡片信息完整但密度固定，无法在「信息完整」和「一屏多看」之间切换

mcp-router 在服务器首页提供了：

- 名称搜索
- List / Grid 视图切换，并持久化到 localStorage
- Grid 使用紧凑卡片（`ServerCardCompact`）

本设计把同类交互落到 moor，同时保持 moor 的视觉语言与现有能力（拖拽排序、启停、详情、删除确认、错误展示）。

## 2. 目标与成功标准

### 目标

1. 用户可在 **List（一行一个）** 与 **Grid（一行多个）** 之间自由切换
2. 页面顶部工具栏提供 **按名称搜索**
3. 视图选择跨会话记住；搜索词不跨会话记住
4. List 继续支持拖拽排序；Grid 不支持拖拽
5. 结构按可扩展边界拆分，避免把所有逻辑继续堆进 `Servers.tsx`

### 成功标准

- 有 ≥1 台服务器时，可见搜索框与 List/Grid 切换
- 切换 Grid 后刷新页面，仍为 Grid
- 输入名称片段后列表即时过滤（大小写不敏感，trim 后匹配）
- 无匹配时显示搜索空态，而不是「添加第一台服务器」
- List 过滤状态下拖拽重排，最终写回的是完整 servers 顺序（未被过滤掉的项相对位置正确）
- Compact 卡片仍可启停、打开详情、删除（含确认），错误信息仍可见
- 不引入 zustand；不改后端 API；不做项目分组

### 非目标

- 项目 / 工作区分组与折叠
- Grid 内拖拽排序
- 搜索 command / URL / status 等扩展字段
- 重做 Server 详情页
- 全局状态管理库迁移

## 3. 用户决策摘要

| 决策点 | 选择 |
|---|---|
| 参考深度 | 学交互，保留 moor 视觉 |
| 默认视图 | List；选择写入 localStorage |
| 搜索字段 | 仅 `server.name` |
| 卡片策略 | List = 现有完整卡；Grid = 紧凑卡 |
| 拖拽 | 仅 List |
| 实现结构 | 拆分 Toolbar / ListView / GridView + preference hook（方案 B） |
| 工具栏位置 | PageHeader 下方独立一行 |

## 4. 架构

### 4.1 组件树

```
src/pages/Servers.tsx
  PageHeader                          # 现有：Refresh / Import JSON / Scan / Add
  ConfigImportPanel / AddServerForm   # 现有
  ServersToolbar                      # 新增：Search + List/Grid
  ServerListView | ServerGridView     # 新增：二选一
    ServerCard (variant full|compact)
```

### 4.2 文件职责

| 路径 | 职责 | 不负责 |
|---|---|---|
| `src/pages/Servers.tsx` | 数据获取、search 状态、过滤、面板显隐、选择 List/Grid | 具体列表/网格 DOM 细节 |
| `src/components/servers/ServersToolbar.tsx` | 搜索输入 UI、视图切换按钮 | server 业务数据 |
| `src/components/servers/ServerListView.tsx` | DnD + full `ServerCard` 列表 | 搜索、视图偏好 |
| `src/components/servers/ServerGridView.tsx` | 响应式 grid + compact `ServerCard` | 拖拽、搜索 |
| `src/components/servers/ServerCard.tsx` | `variant: "full" \| "compact"` 两套布局，复用控件子组件 | 页面级状态 |
| `src/hooks/useServerViewPreferences.ts` | `list \| grid` 读写与校验 | searchQuery |

建议抽出的纯函数（便于单测；具体路径实现时二选一：`src/pages/servers/` 或 `src/lib/`）：

- `filterServersByName(servers, query)`
- 现有/抽出的 `getReorderedServers(servers, activeId, overId)`（过滤态也直接对全量数组按 id 重排，见 §6.1）

### 4.3 数据流

```
useServers().servers
        │
        ├─ searchQuery (useState, 会话内)
        │       │
        │       └─► filteredServers = filterByName(servers, searchQuery)
        │
        └─ viewMode (useServerViewPreferences → localStorage)
                │
                ├─ "list" → ServerListView(filteredServers) + DnD → reorderServers(full order)
                └─ "grid" → ServerGridView(filteredServers) 无 DnD
```

`searchQuery` 只影响展示集合，不修改 hook/store 中的 servers 权威顺序。

## 5. 交互设计

### 5.1 工具栏

仅在 **非 loading 且 `servers.length > 0`** 时渲染（有数据才需要搜索/切换；空列表继续走现有 empty CTA）。

布局：

```
[ 🔍 Search servers...                    ]  [List] [Grid]
```

- 搜索：`flex-1`，左图标，受控 input
- 有内容时显示清除按钮；`Escape` 清空（增强，非阻断）
- 视图按钮：lucide `List` / `LayoutGrid`
- 当前模式：激活样式（与 moor 按钮体系一致，如 active 用实心/高对比，另一侧 outline/ghost）
- 无障碍：`aria-label` / `title`；切换按钮使用 `aria-pressed`

### 5.2 搜索规则

```
normalized = query.trim().toLowerCase()
match = server.name.toLowerCase().includes(normalized)
normalized === "" → 全部通过
```

- 即时过滤，不做防抖（本地列表规模小）
- 不持久化 searchQuery

### 5.3 空态

| 条件 | UI |
|---|---|
| loading | 现有 `PageLoading` |
| `servers.length === 0` | 现有「Add Your First Server」虚线 CTA |
| 有 servers 且过滤结果为空 | 搜索空态：提示 `No servers match "{query}"` + `Clear search` |
| 有过滤结果 | List 或 Grid |

搜索空态复用/扩展 `EmptyState` 或同等风格的中性空态，**禁止**误用「添加第一台」CTA。

### 5.4 视图偏好

```ts
type ServerViewMode = "list" | "grid";
const STORAGE_KEY = "moor.servers.viewMode";
// 缺失或非法值 → "list"
```

模式对齐 `useTheme`：

- 导出 `normalizeServerViewMode(value: string | null): ServerViewMode`
- hook 返回 `{ viewMode, setViewMode }`
- `setViewMode` 同步 React state + `localStorage.setItem`

## 6. List / Grid 与卡片

### 6.1 List

- 行为保持现状：`DndContext` + `SortableContext` + `verticalListSortingStrategy`
- 渲染 `ServerCard variant="full"`（默认即可）
- 容器：`space-y-2`
- 拖拽手柄、完整信息密度不变

**过滤态拖拽（选定算法）：**

继续复用现有按 id 工作的 `getReorderedServers(allServers, activeId, overId)`：

1. 用户在过滤后的 List 上拖拽，`activeId` / `overId` 仍是 server id
2. 在**完整** `servers` 数组里按 id 定位 from/to，再 `splice` 得到 `nextFullServers`
3. 调用 `reorderServers(nextFullServers)`
4. 失败时仍走现有 `orderError` / `ErrorBanner`

语义：移动的是这两台服务器在全量顺序中的相对位置；未出现在过滤结果中的 id 不会丢失。  
不采用「先重排 filtered 再 merge 回全量」的第二套算法，避免双实现。若单测需要，直接测 `getReorderedServers` 在「全量含隐藏项、active/over 均为可见 id」下的结果即可。

### 6.2 Grid

- 无 DnD，无拖拽手柄
- 布局：`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3`
- 渲染 `ServerCard variant="compact"`
- 顺序 = `filteredServers` 的当前相对顺序（即权威 servers 顺序的稳定过滤）

### 6.3 ServerCard compact

`ServerCard` 增加：

```ts
variant?: "full" | "compact"; // default "full"
```

Compact **保留功能，压缩密度**：

| 元素 | full | compact |
|---|---|---|
| 拖拽手柄 | 有（由父传入） | 忽略 `dragHandle` |
| 头像 | 10×10 | 约 8×8 |
| 名称 / AutoStart / StatusBadge | 有 | 有 |
| 命令或 URL 预览 | 有 | 有，单行 truncate，更弱字号 |
| 启停 / 详情 / 删除 | 有 | 有 |
| 删除确认行 | 有 | 有 |
| 错误 `ErrorBanner` | 有 | 有 |
| 内边距 | `p-4` | `p-3` |

实现要求：在同一文件内分支布局，复用 `ServerIdentity`、`ServerControls`、`RemoveFeedbackRow`、`LifecycleButton` 等，避免复制第二套业务逻辑。

## 7. `Servers.tsx` 编排变化（逻辑级）

伪代码：

```tsx
const { viewMode, setViewMode } = useServerViewPreferences();
const [searchQuery, setSearchQuery] = useState("");
const filteredServers = useMemo(
  () => filterServersByName(servers, searchQuery),
  [servers, searchQuery],
);

// PageHeader 不变
// 有数据时：
<ServersToolbar
  searchQuery={searchQuery}
  onSearchQueryChange={setSearchQuery}
  viewMode={viewMode}
  onViewModeChange={setViewMode}
/>

{filtered empty && search ? <SearchEmpty onClear={() => setSearchQuery("")} />
 : viewMode === "list" ? <ServerListView servers={filteredServers} allServers={servers} ... />
 : <ServerGridView servers={filteredServers} ... />}
```

现有 Import / Add / Refresh / Scan 行为不变。

## 8. 错误处理

| 场景 | 处理 |
|---|---|
| localStorage 不可用或写入失败 | 回退内存 state，不阻断页面；可选 `console.warn` |
| 非法 viewMode 缓存 | normalize 为 `"list"` |
| 排序 API 失败 | 保持现有 `orderError` banner |
| 启停/删除失败 | 保持 `ServerCard` 现有反馈 |
| 搜索无结果 | 搜索空态，可一键清空 |

## 9. 测试计划

### 单元

- `normalizeServerViewMode`：null / 非法 / `list` / `grid`
- `filterServersByName`：空串、大小写、trim、无匹配、部分匹配
- `getReorderedServers`：含未过滤隐藏项时，仅移动 active/over 两个 id，其余相对次序与成员不丢

### 组件（按现有测试风格补充）

- `ServersToolbar`：输入触发 `onSearchQueryChange`；点击切换触发 `onViewModeChange`
- `ServerCard` compact：关键操作按钮仍存在（启停/详情/删除）

### 手动验收

1. 多台服务器时工具栏出现
2. 切 Grid → 刷新 → 仍为 Grid
3. 搜索名称过滤正确；清空恢复
4. 无匹配空态与零服务器空态区分
5. List 拖拽仍可保存顺序；过滤后拖拽不丢服务器
6. Grid 无手柄；compact 可启停/进详情/删除
7. 窄屏工具栏不严重溢出

## 10. 实现约束

- 使用 Simplified 中文注释仅在确有必要时；代码标识符与用户可见英文文案与现有 moor UI 保持一致（页面现有文案为英文）
- 不新增全局状态库
- 不修改 `PageHeader` 公共 API，除非工具栏复用证明有必要（默认不改）
- 遵循现有 Tailwind / shadcn / lucide 模式
- YAGNI：不做分组、不做远程搜索、不做命令字段匹配

## 11. 实现顺序建议

1. `useServerViewPreferences` + 单测
2. `filterServersByName`（及拖拽映射纯函数，若需要）+ 单测
3. `ServersToolbar`
4. `ServerCard` compact variant
5. `ServerListView` / `ServerGridView` 从 `Servers.tsx` 抽出
6. 编排接入 + 搜索空态
7. 手动验收与必要组件测

## 12. 开放问题

无。所有产品决策已在 brainstorm 中确认。
