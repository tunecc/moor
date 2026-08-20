# Outcome

在 Servers 页的服务器分组分区头上增加两个能力:(1)具名分组可一键启动该分组内所有服务器;(2)分组头整行空白区域点击即可折叠/展开,只有带明确功能的按钮(上移/下移/重命名/删除/一键启动)保持各自行为,不触发折叠。

# Scope

- **一键启动分组内所有服务器**:在 `ServerGroupSection` 分区头为每个具名分组渲染一个「Start all」图标按钮(Play 图标,tooltip 为 `Start all servers in <name>`)。点击后并发调用现有的单服务器 `startServer` 启动该组内所有处于 `stopped` 或 `error` 状态的服务器;已经 `running` 或 `starting` 的服务器不重复触发。按钮在分组为空或没有可启动服务器(没有 `stopped`/`error`)时禁用。Ungrouped 分区不显示该按钮(与 rename/delete/move 隐藏保持一致)。
- **分区头整行点击折叠/展开**:`ServerGroupSection` 分区头从「只有 chevron 按钮可折叠」改为「整行可折叠」。分区头 `div` 变为可聚焦、可点击区域(`role="button"` + `tabIndex` + `aria-expanded`),点击空白处或名称/数量区域即调用 `onToggleCollapse`;键盘聚焦在分区头本身时 Enter/Space 也触发折叠。上移/下移/重命名/删除/一键启动这些功能按钮点击时不冒泡触发折叠。chevron 保留为视觉指示(不再作为独立交互按钮)。
- **不回归**:现有分组增删改序、跨组拖拽、同组拖拽重排、list/grid 两种视图、空组展示、`localStorage` 折叠状态持久化均保持不变。

# Non-goals

- 不改后端 API;不新增批量启动端点(复用现有 `POST /api/servers/{id}/start`)。
- 不改 `useServers`/`useServerGroups` 的 mutation 逻辑。
- 不改 `ServerGroupsManager` 管理面板内的行为(面板内分组行不增加折叠或一键启动)。
- 不引入新依赖。
- 不给单个 server 卡片增加分组相关入口。

# Acceptance examples

- **A1 具名分组显示一键启动按钮**:渲染 `ServerGroupSection`(非 Ungrouped)时,分区头右侧操作区包含一个 Play 图标按钮,`aria-label`/`title` 含 `Start all servers in <name>`。
- **A2 Ungrouped 不显示一键启动按钮**:`isUngrouped` 为 true 时,分区头不渲染 Start all 按钮(也不渲染上移/下移/重命名/删除)。
- **A3 一键启动只启动可启动服务器**:给定分组内 server 状态分别为 `stopped`、`error`、`running`、`starting`,点击 Start all 后只对 `stopped` 和 `error` 的 server 调用一次 `onStartAll`(该回调内部并发调用各自的 `startServer`),不重复触发 `running`/`starting`。
- **A4 空组或无可用服务器的按钮禁用**:分组内 0 个 server,或所有 server 都为 `running`/`starting`,Start all 按钮为 disabled。
- **A5 按钮点击不触发折叠**:点击 Start all 按钮只执行启动逻辑,不调用 `onToggleCollapse`。
- **A6 整行点击折叠/展开**:点击分区头名称/数量/空白区域调用 `onToggleCollapse` 一次;点击上移/下移/重命名/删除按钮不调用 `onToggleCollapse`。
- **A7 键盘折叠/展开**:分区头聚焦后按 Enter 或 Space 调用 `onToggleCollapse`;焦点在内部功能按钮时按 Enter/Space 不触发分区折叠。
- **A8 折叠状态与图标不回归**:`collapsed` 为 true 显示 ChevronRight,false 显示 ChevronDown;折叠时内容区按既有逻辑隐藏;`localStorage` 折叠状态逻辑不变。

# Constraints and invariants

- 分组仍是纯视觉概念;一键启动不改变 `groupId`/`profile_servers`/`tools/list`/audit。
- 一键启动复用现有单服务器 `startServer` 语义:后端 `start_server` 对 running 幂等、对 starting 会等待,前端只对 `stopped`/`error` 发起调用。
- 分区头功能按钮的事件不冒泡到整行折叠处理器;键盘事件仅在事件目标是分区头本身时触发折叠。
- 不引入新依赖;使用现有 `lucide-react` 的 `Play`/`Loader2` 图标和 `Button` 原语。

# Decisions

- **D1 工作区沿用当前目录**:当前目录存在与分组 UI 相关的未提交改动(`ServerGridView.tsx`、`ServerGroupsManager.tsx`),本轮直接在当前目录叠加,保留这些未提交改动。
- **D2 一键启动只给具名分组**:Ungrouped 是虚拟分区,不是用户创建的分组,且已有 rename/delete/move 都对其隐藏;一键启动同样隐藏。
- **D3 一键启动只启动可启动服务器**:仅对 `stopped`/`error` 的 server 发起 `startServer`;`running`/`starting` 保持原状。按钮在无 `stopped`/`error` 可用服务器时禁用。
- **D4 整行折叠但功能按钮不折叠**:折叠处理器挂在分区头容器上;功能按钮点击时 stopPropagation;键盘折叠仅在焦点位于分区头本身时触发。
- **D5 前端并发复用现有 startServer**:不新增后端批量启动端点,在 Servers 页对组内可启动服务器 `Promise.all(startServer(id))`。

# Open questions

- [blocking] CONFIRM: 目标=Servers 页具名分组头新增「Start all」按钮(一键启动组内 `stopped`/`error` 服务器,Ungrouped 不显示);分区头整行(除功能按钮外)点击/键盘 Enter/Space 折叠展开。范围不含后端改动、不含管理面板、不引入新依赖。请确认后推进到 Build。

# Verification expectations

- 新增 `ServerGroupSection` 组件测试覆盖 A1–A8。
- `pnpm exec vp test`、`pnpm exec vp lint src`、`pnpm exec tsc -b`(或 `pnpm build:frontend` 的类型检查)通过。
- 手动:Servers 页具名分组点击 Start all 只启动 stopped/error 服务器;点击分组头空白折叠;点击上移/下移/重命名/删除/Start all 不折叠;Ungrouped 无 Start all。
