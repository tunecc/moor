# Outcome

解决 Servers 页两个问题:(1)空组「drag one here」落点不生效;(2)卡片控制区按钮过多(分组移动菜单冗余)。移除卡片上的分组移动菜单,只保留启动 + 删除;新增一个页面内弹出的「管理分组」面板,集中做分组的增删改序,并在面板内通过拖拽把 server 移到别的分组。空组在 Servers 页作为有效拖拽落点。

# Scope

- **卡片控制区精简**:移除 `ServerCard` 右上角 `OverflowMenu` 及其分组移动菜单;`ServerControls` 只保留 启动/停止 + 删除 两个按钮。不再传 `groups`/`onAssignGroup` 到卡片(卡片不再承担分组移动)。
- **新增「管理分组」面板**:`ServerGroupsManager` 弹出面板(基于现有 AlertDialog/Sheet 原语,不引入新依赖),从 Servers 页顶部「Manage Groups」按钮打开。面板内:
  - 列出所有具名分组(按 sortOrder),每组显示名称、server 数量、重命名、删除;
  - 顶部「Add Group」;
  - 分组之间可上/下移动调整顺序(复用 reorderGroups);
  - 每个分组下方列出该组的 server(可滚动),可拖拽到其他分组区域,落点即写 `groupId`(跨组拖拽只写 `groupId`,不改 `sort_order`);
  - 空分组区域同样是有效 droppable 落点;
  - Ungrouped 分区也作为可拖入目标(server 拖到 Ungrouped 即 `groupId=null`)。
- **修复 Servers 页空组落点**:当前空展开组 `ServerListView`/`ServerGridView` 无 sortable 项,dnd-kit 不触发 `over`。给每个分区(无论展开/折叠/空)挂 `useDroppable`(id `group:<partitionId>`),拖入即调用 `onAssignGroup`。展开非空组的内部同组/跨组拖拽仍由内层 DndContext 处理。
- **移除 `handleAssignGroup` 死代码**:`ServerCard` 中未被引用的 `handleAssignGroup` 与 `assigningGroup`/`assignError` 状态一并移除(Verifier 已标为死代码)。
- **不回归**:保留卡片 click 跳转详情、键盘 Enter/Space、启动/停止、删除确认行、错误 banner、list/grid 同组拖拽重排、外层 DndContext 的 `handleSectionDrop`。

# Non-goals

- 不改后端 API(`/api/servers/{id}` PUT 接受 `groupId`、`/api/server-groups` 系列)。
- 不改 `useServerGroups`/`useServers` 的 mutation 逻辑。
- 不改 AddServerForm。
- 不引入新依赖(复用 `@dnd-kit` + 现有 UI 原语)。
- 不把分组管理做成独立路由页(本期做页面内弹出面板)。
- 不在 Servers 页卡片上保留任何分组移动入口(统一进管理面板)。
- 不改分组仅视觉的约束(移动 server 只写 `group_id`)。

# Acceptance examples

- **A1 卡片只剩启动+删除**:渲染 `ServerCard`(list 与 compact 两种 variant),其控制区只有 启动/停止 + 删除 两个按钮;不再有 `OverflowMenu`、`MoreVertical`、`FolderInput`。`ServerCard.test.tsx` 现有用例仍通过(需要更新断言以反映菜单已移除)。
- **A2 卡片不再接受 groups/onAssignGroup**:`ServerCard` 不再声明 `groups`/`onAssignGroup` props;调用方不再传递。TypeScript 编译通过。
- **A3 管理面板入口**:Servers 页顶部「Add Group」旁新增「Manage Groups」按钮;点击打开 `ServerGroupsManager` 弹出面板;再次点击或 Esc/外部点击关闭。
- **A4 面板列出分组**:面板打开后按 sortOrder 列出所有具名分组,每组显示名称、server 数量、重命名、删除按钮;Ungrouped 不在面板列表中(它不可重命名/删除)。
- **A5 面板内增删改序**:面板内「Add Group」创建新组;重命名更新名称;删除走原确认对话框语义(组内 server 回落到 Ungrouped);上/下移动调整 sortOrder。所有操作通过既有 `useServerGroups` mutation。
- **A6 面板内跨组拖拽**:面板内把 server `a`(组 g1)拖到组 g2 区域,`onAssignGroup("a","g2")` 被调用一次;不调 `onReorder`;拖回原组原位无 mutation。
- **A7 面板内空组落点**:面板内某具名分组当前无 server,把任一 server 拖入该组区域,`onAssignGroup(serverId, thatGroupId)` 被调用。
- **A8 面板内 Ungrouped 落点**:面板内把 server 拖到 Ungrouped 区域,`onAssignGroup(serverId, null)` 被调用。
- **A9 Servers 页空组落点修复**:Servers 页某具名分组当前无 server(显示「drag one here」),把任一 server 拖入该分区,`onAssignGroup(serverId, thatGroupId)` 被调用(此前不生效)。
- **A10 Servers 页折叠组落点**:折叠的分区仍作为 droppable,拖入即移动。
- **A11 卡片高度不回归**:卡片没有移除确认/错误 banner 时保持紧凑高度(无分组选择行)。
- **A12 非回归**:`ServerCard.test.tsx`、`server-groups.test.ts` 通过;点击卡片跳转 `/servers/:id`;移除确认时点击不跳转;list/grid 同组拖拽重排仍走 `onReorder`;跨组拖拽只写 `groupId`。

# Constraints and invariants

- 分组仍是纯视觉概念:移动 server 只写 `mcp_servers.group_id`,不改 `profile_servers`/Active Profile/`tools/list`/audit。
- 跨组拖拽不修改任何 server 的 `sort_order`;只有同组内拖拽才 `onReorder`。
- 不引入新依赖;管理面板复用 `AlertDialog` 原语或自建最小 Sheet(遵循现有 `cn` 样式约定)。
- 管理面板键盘可达(Esc 关闭、Tab 序列、按钮可聚焦)。
- 不破坏现有 `ServersToolbar`、`ServerGroupSection` 分区头按钮(上/下/重命名/删除仍可用)。

# Decisions

- **D1 卡片移除分组菜单**:用户明确「不要再给卡片加操作按钮,启动+删除就够」。`OverflowMenu` 从 `ServerCard` 移除;`OverflowMenu.tsx` 组件本身保留(可能管理面板会复用,或留作通用原语)。
- **D2 分组管理入口=页面内弹出面板**:用户选「页面内弹出面板」(非独立路由、非侧边抽屉)。用 `AlertDialog` 风格的 modal,内容区承载分组列表 + 拖拽。
- **D3 面板内跨组拖拽=只写 groupId**:与 Servers 页一致,跨组拖拽只写 `groupId` 不改 `sort_order`;面板内不再做同组重排(同组顺序由 Servers 页 list/grid 视图管理;面板只管「哪个 server 在哪个组」)。
- **D4 修复空组落点=给每个分区挂 useDroppable**:根因是空展开组内层 SortableContext 无项,dnd-kit 不产生 `over`。修复方式:在 `ServerGroupSection` 内(展开和折叠都)渲染一个 `useDroppable`(id `group:<id>`),由外层 `DndContext` 的 `handleSectionDrop` 处理。这样空组、折叠组、展开组都能作为落点。
- **D5 面板 DndContext 独立**:面板有自己的 `DndContext`(Servers 页外层 DndContext 不覆盖面板)。面板内拖拽落点为各分组 droppable + Ungrouped droppable。
- **D6 移除 ServerCard 死代码**:`handleAssignGroup`/`assigningGroup`/`assignError` 在卡片精简后一并删除;错误展示回归到只有 removeError。

# Open questions

- [blocking] CONFIRM: 目标=卡片只留启动+删除(移除 OverflowMenu 分组菜单);新增 Servers 页顶部「Manage Groups」弹出面板,集中管理分组(增删改序)+ 面板内跨组拖拽移动 server;修复 Servers 页空组/折叠组作为拖拽落点;不引入新依赖;不动后端/hooks/AddServerForm。范围不含独立路由页。请确认后推进到 Build。

# Verification expectations

- 单元/组件测试覆盖 A1–A12。
- `pnpm test`(vp test)通过;`tsc -b` 与 `vp lint src` 通过。
- 手动:Servers 页空组拖入生效;管理面板打开/增删改序/跨组拖拽/空组落点/Ungrouped 落点;卡片只剩启动+删除且点击仍跳转详情。
