# Outcome

消除 Servers 页面每张 MCP 服务器卡片下方常驻的「移动到分组」下拉所占用的大量垂直空间：list 视图改为通过跨组拖拽移动服务器；grid 视图新增按组拖拽能力，并保留一个收进卡片右上角溢出菜单的「移动到分组」入口作为兜底。删除 ServerCard 中常驻的分组选择行，让卡片回到原来的紧凑高度。

# Scope

- **删除常驻分组选择行**：移除 `ServerCard` 中渲染 `FolderInput` + `Select` 的整块 JSX 及相关状态（`assigningGroup`/`assignError`/`handleAssignGroup`/`currentGroupValue`）。卡片不再为分组选择增加高度。
- **list 视图跨组拖拽**：`ServerListView` 当前仅允许同组内拖拽重排；改为允许把一个 server 拖到另一组内的 server 上，落到目标 server 所在组的末尾（或拖到目标 server 之前/之后的同组位置）。跨组移动通过现有 `updateServer` 写 `groupId` 实现，不改变其他 server 的 `sort_order`。
- **grid 视图拖拽**：`ServerGridView` 当前无任何拖拽。新增跨组拖拽（同 list）：从任一组卡片拖到另一组卡片上时，该 server 移动到目标组。grid 视图内仍可同组重排。
- **grid 视图溢出菜单**：为 `ServerCard` 增加一个轻量「更多」菜单（基于现有 UI 原语，不引入新依赖），菜单内提供「移动到分组」子项，选择后调用 `onAssignGroup`。该菜单只在提供 `groups` + `onAssignGroup` 时渲染。
- **list 视图保留溢出菜单作为兜底**：list 视图以拖拽为主路径；但 `ServerCard` 在 list 视图同样提供该溢出菜单（菜单为卡片自身能力，由 props 决定是否渲染），保证键盘 / 触摸等不便拖拽场景仍有移动手段。
- **空组作为拖拽落点**：当一个具名分组当前没有 server 时（空状态行），该分组区域作为有效落点，拖入后 server 移动到该组。
- **卡片交互不回归**：保留现有 click 跳转详情、键盘 Enter/Space、start/stop/remove、移除确认行、错误 banner、拖拽句柄等行为。

# Non-goals

- 不改变后端 API（`/api/servers/{id}` PUT 接受 `groupId`、`/api/server-groups` 系列）。
- 不改变分组本身的创建/重命名/删除/重排、Ungrouped 虚拟分区语义、collapse 持久化。
- 不引入新的第三方依赖（复用 `@dnd-kit` + 现有 UI 原语）。
- 不修改 AddServerForm（新增 server 仍默认 Ungrouped）。
- 不在搜索过滤状态下引入特殊拖拽语义（仍按显示出的 server 拖拽；搜索状态下跨组拖拽同样可用，目标组以实际渲染的分区为准）。
- 不改变 audit/profile/tools 等非可见行为（分组仅视觉的约束不变）。

# Acceptance examples

- **A1 常驻下拉已移除**：渲染一张带 `groups` + `onAssignGroup` 的 `ServerCard`（list 与 compact 两种 variant），其 DOM 中不再包含 `FolderInput` 图标、不再包含「移动到分组」的下拉触发器（即不再有值为 `Ungrouped`/分组名的 `Select`）。`ServerCard.test.tsx` 现有用例仍通过。
- **A2 list 跨组拖拽改 groupId**：list 视图中把 server `a`（在组 `g1`）拖到组 `g2` 的 server `b` 上，`onAssignGroup("a", "g2")` 被调用一次；不调用 `onReorder`（因为只有同组重排才触发 reorder）。若拖回原组原位则不产生任何 mutation。
- **A3 list 同组拖拽仍走 reorder**：在同一个组内拖拽重排时，调用 `onReorder` 给出新的 `allServers` 顺序，且不调用 `onAssignGroup`（与现状一致）。
- **A4 grid 跨组拖拽**：grid 视图中把 server `a`（组 `g1`）拖到组 `g2` 的卡片上，`onAssignGroup("a", "g2")` 被调用。grid 内同组拖拽触发 `onReorder`。
- **A5 grid 同组重排**：grid 视图同一组内拖拽改顺序，`onReorder` 被调用并保持组外 server 相对顺序不变。
- **A6 溢出菜单移动到分组**：点击 `ServerCard` 右上角「更多」菜单，展开后选择某分组，`onAssignGroup(serverId, <groupId|null>)` 被调用；选择「Ungrouped」等价于 `groupId=null`。菜单打开/选择不触发卡片 click 跳转。
- **A7 空组可作为落点**：某具名分组当前无 server（显示「No servers in this group.」），把任一 server 拖入该分组区域，`onAssignGroup(serverId, <groupId>)` 被调用。
- **A8 卡片高度回落**：list 与 grid 卡片在没有移除确认/错误 banner 时，垂直高度不再因分组选择行而多出一行（`mt-2` 行被移除）。
- **A9 非回归**：`ServerCard.test.tsx`、`server-groups.test.ts` 现有用例全部通过；点击卡片仍跳转 `/servers/:id`；移除确认时点击卡片不跳转；拖拽句柄点击不跳转。

# Constraints and invariants

- 分组仍是纯视觉概念：移动 server 只写 `mcp_servers.group_id`，不改 `profile_servers`、不改 Active Profile、不改 `tools/list`、不写 audit。
- 每张卡片仍属于至多一个组；跨组移动 = 写 `groupId`，不需要专门的 move endpoint。
- 跨组拖拽不修改任何 server 的 `sort_order`；只有同组内拖拽才通过 `onReorder` 调整 `sort_order`。
- 不引入新依赖；新菜单复用项目既有 UI 原语（`Button`、可选 `AlertDialog`/`Select` 风格的 popover，或一个最小自建 dropdown，遵循现有 `cn` 样式约定）。
- 触摸 / 键盘可达性：溢出菜单必须键盘可达（Tab 聚焦、Enter/Space 展开、方向键或 Tab 选择）；list/grid 拖拽沿用 `@dnd-kit` 的 `KeyboardSensor`。
- 不破坏现有 `ServersToolbar`、`ServerGroupSection`（分组头按钮尺寸的未提交微调一并保留）。

# Decisions

- **D1 主交互=跨组拖拽，兜底=溢出菜单**：用户选择「跨组拖拽 + grid 溢出菜单」。list 与 grid 都支持跨组拖拽；grid 额外用溢出菜单兜底；list 同样保留该菜单作为键盘/触摸兜底。
- **D2 跨组拖拽落点语义**：跨组拖拽的目标是「目标 server 所在的组」或「空组区域」。落到目标组的任意 server 上即把被拖 server 移到该组（不试图在该组内做精确插入位置，仅写 `groupId`，组内顺序由现有 `sort_order` 决定）。这样无需扩展后端，语义简单。
- **D3 跨组=只写 groupId，不 reorder**：跨组移动不调 `onReorder`，避免在 PUT order 时误改其他 server 的 `sort_order`。被移动 server 在目标组内的位置保持其原有 `sort_order`（后端不变更），UI 由 `partitionServersByGroup` 重新分区后呈现。
- **D4 grid 视图用 dnd-kit 加拖拽**：grid 当前没有 DndContext；新增一个 grid 专用 DndContext（避免与 list 内层 DndContext 冲突，grid 用自己的）。使用 `rectSortingStrategy` 之类 grid 策略。
- **D5 溢出菜单实现**：自建一个最小 dropdown（受控 open state + 外部 click 关闭），避免引入 Radix DropdownMenu 新依赖。菜单内项为各分组 + Ungrouped。选中后调用 `onAssignGroup`。

# Open questions

- [blocking] CONFIRM: 目标=移除卡片常驻分组下拉、以跨组拖拽（list+grid）为主路径、grid/list 卡片右上角加「更多」溢出菜单兜底移动分组；跨组拖拽只写 `groupId` 不改 `sort_order`；不引入新依赖。范围不含后端与分组管理本身。请确认后推进到 Build。

# Verification expectations

- 单元/组件测试覆盖 A1–A9。
- `pnpm test`（项目既有测试体系）通过；`pnpm typecheck`/`pnpm lint` 通过。
- 手动在 list 与 grid 视图各做一次：同组重排、跨组移动、空组落点、溢出菜单移动、卡片点击跳转、移除确认不跳转。
