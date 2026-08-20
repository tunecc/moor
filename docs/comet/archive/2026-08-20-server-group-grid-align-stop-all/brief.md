# Outcome

Servers 页服务器分组在网格视图下：(1) 分组内服务器不足以占满一行时，卡片不再拉伸占满整行，而是与「服务器最多的分组」使用相同的列宽、留空对齐；(2) 每个具名分组头同时具备「一键启动」与「一键暂停（停止）」两个按钮。

# Scope

- **网格不拉伸（auto-fill）**：`ServerGridView` 的 `gridTemplateColumns` 由 `repeat(auto-fit, ...)` 改为 `repeat(auto-fill, ...)`，使未占满的行保留空轨道而非拉伸卡片。各分组共用同一套宽度驱动的列布局（宽屏封顶 3 列），服务器少的分组按相同列宽渲染、留空对齐，不再把 1–2 张卡片拉伸成整行。list 视图（纵向堆叠）不受影响。
- **分组头一键停止（Stop all）**：在 `ServerGroupSection` 具名分组头操作区，紧邻已有 Start all 增加「Stop all」图标按钮（`Square` 图标，`aria-label`/`title` 为 `Stop all servers in <name>`，hover 为 error 色）。点击后并发调用现有单服务器 `stopServer`，停止该组内所有处于 `running` 或 `starting` 状态的服务器；`stopped`/`error` 的服务器不重复触发。按钮在分组为空或没有 `running`/`starting` 服务器时禁用。Ungrouped 分区不显示该按钮（与 Start all、rename/delete/move 隐藏保持一致）。
- **保留一键启动（Start all）**：现有 Start all 行为不变，仍只对 `stopped`/`error` 服务器发起、Ungrouped 隐藏；与新增 Stop all 共存，各自独立的 busy 与 disabled 逻辑。
- **不回归**：分组增删改序、跨组拖拽、同组拖拽重排、list/grid 视图切换、空组展示、`localStorage` 折叠状态持久化、分区头整行折叠与功能按钮不冒泡等既有行为保持不变。

# Non-goals

- 不改后端 API；不新增批量启停端点（复用现有 `POST /api/servers/{id}/start` 与 `/stop`）。
- 不改 `useServers`/`useServerGroups` 的 mutation 逻辑。
- 不改 `ServerGroupsManager` 管理面板内的网格与按钮（面板内分组行不增加折叠、Start all 或 Stop all）。
- 不改 list 视图的纵向布局。
- 不引入新依赖；使用现有 `lucide-react` 的 `Square`/`Play`/`Loader2` 图标与 `Button` 原语。
- 不给单个 server 卡片增加分组相关入口。

# Acceptance examples

- **A1 网格使用 auto-fill 不拉伸**：`ServerGridView` 渲染的网格容器 `gridTemplateColumns` 含 `auto-fill`（非 `auto-fit`），使未占满的行保留空轨道、卡片不拉伸。
- **A2 少量服务器留空对齐**：一个分组只有 1 或 2 个服务器时，其卡片宽度与「占满一行的分组」的卡片宽度一致（同一列宽），剩余位置留空，而不是把 1–2 张卡片拉伸成整行。
- **A3 list 视图不回归**：list 视图仍为纵向堆叠，不引入网格列模板。
- **A4 具名分组显示 Stop all 按钮**：渲染 `ServerGroupSection`（非 Ungrouped）时，分区头操作区在 Start all 旁包含一个 `Square` 图标按钮，`aria-label`/`title` 含 `Stop all servers in <name>`。
- **A5 Ungrouped 不显示 Stop all**：`isUngrouped` 为 true 时，分区头不渲染 Stop all（也不渲染 Start all/上移/下移/重命名/删除）。
- **A6 Stop all 只停止运行中/启动中服务器**：给定分组内 server 状态分别为 `running`、`starting`、`stopped`、`error`，点击 Stop all 后只对 `running` 和 `starting` 的 server 调用一次 `onStopAll`（该回调内部并发调用各自的 `stopServer`），不重复触发 `stopped`/`error`。
- **A7 空组或无运行中服务器的 Stop all 禁用**：分组内 0 个 server，或所有 server 都为 `stopped`/`error`，Stop all 按钮为 disabled。
- **A8 Stop all 点击不触发折叠**：点击 Stop all 按钮只执行停止逻辑，不调用 `onToggleCollapse`。
- **A9 Start all 行为不回归**：具名分组仍渲染 Start all（`Play` 图标，`Start all servers in <name>`），点击只启动 `stopped`/`error` 服务器，Ungrouped 不显示；Start all 与 Stop all 各自独立 busy/disabled。
- **A10 键盘与折叠不回归**：分区头整行点击/Enter/Space 折叠；Start all、Stop all、上移/下移/重命名/删除按钮点击或键盘激活时不触发折叠。

# Constraints and invariants

- 分组仍是纯视觉概念；一键启停不改变 `groupId`/`profile_servers`/`tools/list`/audit。
- 一键启停复用现有单服务器 `startServer`/`stopServer` 语义：后端 `start_server` 对 running 幂等、对 starting 会等待；`stop_server` 可中断 starting（`stop_while_starting_keeps_server_stopped`）。前端只对相应可启停状态发起调用。
- 网格列数仍由容器宽度驱动（宽屏封顶 3 列），仅改 `auto-fit`→`auto-fill` 以保留空轨道；不改为按某分组服务器数动态计算列数（否则少量服务器会再次占满整行，违背「不要把整行给占满」）。
- 分区头功能按钮的事件不冒泡到整行折叠处理器；键盘事件仅在事件目标是分区头本身时触发折叠。
- 不引入新依赖。

# Decisions

- **D1 网格改 auto-fill**：`ServerGridView` 的 `gridTemplateColumns` 由 `auto-fit` 改为 `auto-fill`，保留空轨道使未占满的行不拉伸；列数仍由宽度驱动。理由：用户明确要求「不要把整行给占满」「有两个也不要占满整行」，故列数不能等于该组服务器数，必须留空——`auto-fill` 是「固定列宽 + 留空」的标准做法，`auto-fit` 才是拉伸。
- **D2 Stop all 复用 stopServer 并发停止**：不新增后端批量停止端点，在 Servers 页对组内 `running`/`starting` 服务器 `Promise.all(stopServer(id))`，与 Start all 对称。
- **D3 Stop all 范围含 starting**：与托盘 `can_stop_all`（含 `Running`/`Starting`）一致；后端支持停止 starting 中的服务器。
- **D4 Stop all 仅具名分组、与 Start all 同区**：Ungrouped 隐藏，按钮置于 Start all 旁，`Square` 图标 + error hover 色，独立 busy/disabled。
- **D5 工作区沿用当前目录**：在当前 main 分支叠加改动。

# Open questions

- [blocking] CONFIRM: 目标=Servers 页网格视图改用 auto-fill，使未占满的行不拉伸、按最多分组列宽留空对齐；每个具名分组头在已有 Start all 旁新增 Stop all（并发停止组内 running/starting 服务器，Ungrouped 不显示，空组/无可停服务器时禁用）。范围不含后端改动、不含管理面板、不含 list 视图布局、不引入新依赖。请确认后推进到 Build。

# Verification expectations

- `ServerGridView` 与 `ServerGroupSection` 组件测试覆盖 A1–A10。
- `pnpm exec vp test`、`pnpm exec vp lint src`、`pnpm exec tsc -b`（或 `pnpm build:frontend` 的类型检查）通过。
- 手动：Servers 页网格视图下，服务器少的分组卡片不拉伸、与多服务器分组同宽、留空对齐；具名分组点击 Stop all 只停止 running/starting 服务器，点击 Start all 只启动 stopped/error；点击各功能按钮不折叠分组；Ungrouped 无 Start/Stop all。
