# Outcome

从 Ungrouped(最底部未分组区)向上拖动 server 到上方分组时,落点识别不稳定:有时能落入目标分组,有时落空或落到相邻分区的 server 上。目标是让"光标进入某分组区域(含分组头、空组、卡片间隙)就判定为落到该分组"成为可靠规则,跨组移动稳定生效。

# Scope

- `src/pages/Servers.tsx`:把 `DndContext` 的 `collisionDetection` 从 `closestCenter` 改为自定义碰撞算法,优先匹配 `group:<id>` 这类分区级 droppable,再回退到 server sortable 项。
- `src/components/servers/ServerGroupSection.tsx`:确认 `GroupDropArea` 在展开/折叠/空组三种状态下都覆盖该分组的可落点区域(已具备);如需要,扩展 droppable 覆盖范围使整段分区可落点。
- 新增自定义 collision detection 工具(放在 `Servers.tsx` 内或 `src/lib/` 下,二选一)。

# Non-goals

- 不改动同组内 server 排序逻辑(`reorderServers` 路径不变)。
- 不改动跨组 server-to-server 移动语义(只写 `groupId`)。
- 不改动后端接口、`useServerGroups`/`useServers` hooks。
- 不改动 `ServerGroupsManager` 弹窗内的拖拽。
- 不引入新依赖。

# Acceptance examples

- A1. 从 Ungrouped 拖一个 server,光标停留在上方某个具名分区的**分组头**区域松开 → 该 server 移入该分组(`groupId` 更新)。
- A2. 从 Ungrouped 拖一个 server,光标停留在上方某个**非空展开**分组的卡片之间空白处松开 → 该 server 移入该分组(而非落空或落到相邻分区)。
- A3. 从 Ungrouped 拖一个 server 到**空组**的落点区域松开 → 移入该空组。
- A4. 从 Ungrouped 拖一个 server 到**折叠分组**区域松开 → 移入该折叠分组,折叠状态不变。
- A5. 同组内拖动 server 排序仍正常工作(`reorderServers` 写 `sort_order`)。
- A6. 列表视图与网格视图两种 `viewMode` 下,A1–A5 均成立。
- A7. `pnpm build:frontend`(`tsc -b`)与 `pnpm lint` 退出码 0,不引入新 lint 警告;`pnpm test` 仍通过。

# Constraints and invariants

- 自定义 collision detection 必须返回 `Collision` 数组(dnd-kit `CollisionDetection` 签名),首元素为最终 `over`。
- 优先级规则:若光标坐标(`pointerCoordinates`)落在某个 `group:<id>` droppable 的矩形内,优先返回该 `group:<id>`(即使同时落在内部某 server sortable 上)。这是修复"时灵时不灵"的核心:父级 droppable 优先于子级 sortable。
- 光标不在任何 `group:<id>` 矩形内时,回退到 `closestCenter` 语义(按中心距离选最近的 server sortable),保证同组排序仍可用。
- `pointerCoordinates` 缺失(键盘操作等)时,直接回退到 `closestCenter`。
- `UNGROUPED_ID` 映射规则不变(`group:__ungrouped__` → `null`)。
- `handleDragEnd` 的三分支逻辑(1 group: 前缀跨组、2 跨组 server-to-server、3 同组排序)保持不变;本次只改 collision detection 的选择准确度。

# Decisions

- 采用自定义 collision detection(方案 A):先 `pointerWithin` 语义找出光标所在的所有 droppable,若其中含 `group:` 前缀的分区级 droppable,则优先返回它;否则回退 `closestCenter`。理由:`closestCenter` 只按几何中心距离选唯一目标,父级 `GroupDropArea` 与子级 sortable 共存时子级常胜出,导致分区级落点识别不稳。
- `GroupDropArea` 在展开非空状态下已包裹整段 children(`ServerGroupSection.tsx:182-184`),其矩形覆盖整个分区内容区;折叠状态下包裹提示文本或空 div,矩形覆盖折叠行。两种状态下 `group:<id>` 矩形都存在,自定义算法可统一识别。
- 实现位置:自定义函数放在 `Servers.tsx` 内(只此一处使用),避免新增 lib 文件。若函数体过长再抽到 `src/lib/dnd-collision.ts`。

# Open questions

- [blocking] CONFIRM: 上述自定义 collision detection 方案与验收 A1–A7 是否符合你期望的范围与结果?是否同意"父级 group droppable 优先于子级 sortable"这一优先级规则?

# Verification expectations

- `pnpm build:frontend`(`tsc -b` + `vp build`)退出码 0。
- `pnpm lint` 退出码 0,不新增 lint 警告。
- `pnpm test` 仍全部通过。
- 启动 `pnpm tauri dev`,在 Servers 页面手动验证 A1–A6:从 Ungrouped 向上拖到具名分组的分组头、卡片间空白、空组、折叠组;并验证同组排序仍可用;list 与 grid 两种视图各覆盖一次。
