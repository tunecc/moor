# Outcome

用户在 Servers 页面把一个 server 拖到某个分组(尤其是空组、折叠组)时,虽然界面有 `No servers in this group — drag one here.` 这类落点提示,但拖拽落空、不生效。目标:把 Servers 页面的拖拽统一到单一 `DndContext`,让空组、折叠组和跨分区移动都能稳定生效,并保留同组内排序。

# Scope

- `src/pages/Servers.tsx`:成为唯一持有 `DndContext` 的位置,统一处理 `onDragEnd`。
- `src/components/servers/ServerListView.tsx`、`src/components/servers/ServerGridView.tsx`:移除各自内部的 `DndContext`/`sensors`/`handleDragEnd`,改为接收外层传入的 `SortableContext` 渲染职责与跨组/同组落点判断所需信息。落点决策移到 `Servers.tsx` 的统一处理器。
- `src/components/servers/ServerGroupSection.tsx`:空组/折叠分区的 `GroupDropArea` 在单一 DnD 体系下成为有效落点;无需新增组件,只保证其 `useDroppable` 与外层 `DndContext` 在同一上下文。

# Non-goals

- 不改动后端 `/api/servers/:id`、`/api/server-groups` 等接口;`updateServer` 写 `groupId` 的语义保持不变。
- 不改动 `ServerGroupsManager` 弹窗内的分组管理交互。
- 不引入新的依赖或测试框架;验收通过 `tsc`/lint 与手动浏览器验证。
- 不改变 `partitionServersByGroup` 的分区分组语义。

# Acceptance examples

- A1. 在 Servers 页面有一个空组(0 个 server)。把另一个分区的某个 server 拖到该空组的落点区域后,松开鼠标,该 server 的 `groupId` 更新为该空组,卡片出现在该空组下。
- A2. 在折叠分组(非空)上拖入其他分区的 server,松开后该 server 移入对应组,折叠状态不变。
- A3. 同一分区内拖动 server 进行排序,仍按原 `onReorder` 写 `sort_order`,顺序持久化。
- A4. 列表视图与网格视图两种 `viewMode` 下,A1–A3 均成立。
- A5. 拖到落点时,`GroupDropArea` 出现高亮(`isOver` 视觉态);松开后调用 `updateServer` 成功,失败时显示 `ErrorBanner`。
- A6. `pnpm build:frontend`(含 `tsc -b`)与 `pnpm lint` 退出码为 0;不引入新的 lint 警告。

# Constraints and invariants

- 跨组移动只写 `groupId`,不修改 `sort_order`;同组拖动走既有 `reorderServers` 路径。语义与 `ServerListView`/`ServerGridView` 当前实现一致。
- 单一 `DndContext`:`Servers.tsx` 外层一个 `DndContext`,内部各分区共享同一上下文;`ServerListView`/`ServerGridView` 不再各自创建 `DndContext`。
- `useSortable` 的 `id` 必须在单一 `SortableContext` 范围内唯一;若跨分区使用单一 `SortableContext`,需要把所有可见 server 的 id 收集起来作为 items,以避免 dnd-kit 报 id 冲突或落点错乱。
- `UNGROUPED_ID` 作为虚拟分区 id 的映射规则保持不变(`group:__ungrouped__` → `null`)。
- 鼠标激活阈值沿用 `PointerSensor` 的 `activationConstraint: { distance: 6 }`,避免误触。
- 网格视图整张卡片可拖(`ServerGridView` 既有行为),列表视图仍由 `GripVertical` 把手触发拖拽。

# Decisions

- 采用单一 `DndContext` 架构:把 `DndContext`、`sensors`、`handleDragEnd` 上提到 `Servers.tsx`,所有分区共享。理由:外层 `DndContext` 才能识别跨分区 `useDroppable`(`group:<id>`)与跨分区 `useSortable` 落点;原先各分区子 `DndContext` 互相隔离,导致空组/折叠组的 `GroupDropArea` 落点无法被正在被拖动 server 所在的子 `DndContext` 感知,拖过去没有效果。
- 在外层用一个 `SortableContext`(list 视图为 `verticalListSortingStrategy`,grid 视图为 `rectSortingStrategy`),`items` 为当前可见全部 server id;分区内部仍按各自分组渲染。理由:dnd-kit 要求 sortable items 与被拖元素在同一 `SortableContext` 内,统一上下文后跨组落点判定与同组排序可共存。
- `handleDragEnd` 统一逻辑:`over.id` 以 `group:` 前缀 → 跨组移动(写 `groupId`);否则按 `active`/`over` 的 `groupId` 是否相同决定跨组移动或同组排序。落点判定所需 `servers`、`allServers`、`onAssignGroup`、`onReorder` 等已在 `Servers.tsx` 闭包内可用。
- 验收方式:`tsc -b` + `lint` 通过,再在浏览器手动验证 A1–A5。不新增组件测试(项目当前无 vitest/test 脚本)。

# Open questions

- [blocking] CONFIRM: 上述单一 `DndContext` 架构与验收 A1–A6 是否符合你期望的范围与结果?是否还要保留分区头的整体拖拽重排(目前用 `onMoveUp/onMoveDown` 按钮实现,不在本次拖拽改动范围)?

# Verification expectations

- `pnpm build:frontend`(`tsc -b` + `vp build`)退出码 0。
- `pnpm lint` 退出码 0,不新增 lint 警告。
- 启动 dev 应用,在 Servers 页面手动验证 A1–A5;至少覆盖:空组落点、折叠组落点、同组排序、跨组移动、list 与 grid 两种视图。
