# Outcome

在 Moor 的 Servers 页面引入"分组（Group）"能力，让用户可以把众多 MCP server 按自己方式归组展示与操作，降低查找成本。参照 mcp-router 的 Project 分组体验，但适配 Moor 已有的 Profile（exposure）模型。

# Scope

- 新增 Group 概念：命名的容器，用于组织 Servers 页面的 server 展示。**仅视觉组织，不影响网关对外暴露**。
- 单一归属：每个 server 至多属于一个 Group，未分组则归入 "Ungrouped"。
- 仅 Servers 页面（grid + list 两种视图）按 Group 分区/折叠展示。
- Group 管理：创建、重命名、删除、排序。
- server 归属：分配到某 Group 或保持未分组；支持在分组间移动 server；组内仍保留 sort_order 排序。
- 数据层：新增 `server_groups` 表与 `mcp_servers.group_id` 列（可空），配套迁移与回填。
- 服务层：Group CRUD、server 归属更新、批量按组返回。
- HTTP 路由：`/api/server-groups` CRUD + `/api/servers/{id}` 支持更新 `groupId`。
- 前端：类型、API 客户端、查询/缓存、Servers 页面分组渲染、grid/list 两视图一致。
- 配套测试：迁移幂等与回填、Group CRUD/归属逻辑、关键 UI 行为。

# Non-goals

- 不改变 Profile 的 exposure 语义。Active Profile 仍唯一决定网关对外暴露哪些 server/tool；分组不参与 exposure，不提供"按组批量 toggle enabled"快捷动作（不在本轮）。
- 不引入 mcp-router 的 Workspace（独立数据库/配置档案）概念。
- 不做云同步、多设备共享分组配置。
- 不在 Profile 编辑器、Dashboard 等其他展示 server 列表处按分组呈现。
- 不替换现有 sort_order / dnd-kit 拖拽排序，而是与之共存（组内排序 + 组排序）。

# Acceptance examples

- A1 数据迁移：存量 Moor 数据库执行迁移后新增 `server_groups` 表与 `mcp_servers.group_id` 列；所有现存 server 的 `group_id` 为 NULL（即未分组）；`sort_order` 回填逻辑不回归；迁移可重复执行不报错。
- A2 创建 Group：在 Servers 页面创建一个 Group（如 "Dev"），它出现在列表中，按 `sort_order` 排序，初始为空。
- A3 server 归属：将一个未分组 server 分配到某 Group 后，该 server 在 grid 与 list 两种视图下都出现在该 Group 分区内；同一 server 在同一时刻只属于一个 Group，移入新组即从原组移除。
- A4 Ungrouped：所有 `group_id` 为 NULL 的 server 统一显示在 "Ungrouped" 分区；该分区始终展示在所有具名 Group 之后；不能重命名或删除 "Ungrouped"。
- A5 重命名 Group：重命名一个 Group 后，其下所有 server 仍归属该 Group，展示名更新；组 id 不变。
- A6 删除 Group：删除一个非空 Group 后，其下所有 server 的 `group_id` 置为 NULL（回落到 Ungrouped），server 本身不被删除；删除最后一个具名 Group 后只剩 Ungrouped。
- A7 组排序：可调整 Group 之间的顺序，反映在 Servers 页面；组内 server 仍按各自 `sort_order` 排序。
- A8 exposure 不受影响：分组操作（创建/重命名/删除/移动 server）前后，Active Profile 的 enabled server 集合与 `tools/list` 返回结果不变；Audit 记录不受分组影响。
- A9 现有数据与行为不回归：Profile、ProfileServer、ToolDiscovery、Audit、Config Import、server 启停/拖拽排序在引入分组后行为不变；Config Import 仍按原逻辑导入，未导入的分组关系不受影响。
- A10 视图一致性：grid 与 list 两种视图下的分组分区、折叠状态、未分组分区展示一致；空 Group 在两种视图下均显示空状态。

# Constraints and invariants

- 单 Rust in-process gateway 架构不变（ADR-0001）；分组是组织层，不引入新进程。
- 数据迁移对存量数据库安全：`group_id` 可空，存量 server 默认未分组；`ensure_column` 模式幂等。
- 删除 Group 时其下 server 回落到 Ungrouped，不删除 server 本身（参照 `profile_servers` 的 `ON DELETE CASCADE` 思路，但 group_id 置 NULL 而非删 server）。
- "Ungrouped" 不是数据库行，是 `group_id IS NULL` 的虚拟分区；不存储具名行。
- 不破坏现有 Profile / Audit / ToolDiscovery 数据与行为。
- GROUP_BY/sort：先按 `server_groups.sort_order`，再组内按 `mcp_servers.sort_order`。

# Decisions

- 工作区隔离：用户选定 `current`（沿用 main 分支）。
- 命名采用"分组 / Group"，与用户用词一致；不与 Profile 混用（CONTEXT.md 已将 group 列为 Profile 的避免词）。
- 分组语义：仅视觉组织，不参与 exposure（Active Profile 仍是唯一 exposure 决定者）。
- 归属基数：单一归属（一个 server 至多一个 Group），与 mcp-router project 一致。
- 生效范围：仅 Servers 页面（grid + list）。
- 数据模型：新增 `server_groups(id, name, sort_order, created_at, updated_at)`；`mcp_servers.group_id TEXT NULL REFERENCES server_groups(id) ON DELETE SET NULL`。
- Ungrouped 为虚拟分区，不建具名行。

# Open questions

- [blocking] CONFIRM: 上述目标、范围、关键决定、验收项与非目标是否与你预期一致？确认后进入 Build。

# Verification expectations

- 迁移在存量数据库上幂等且不丢数据（含 sort_order 回填逻辑不回归）——A1。
- 分组的增删改、server 归属移动在 grid/list 两种视图下表现一致——A2/A3/A4/A5/A6/A7/A10。
- 删除 Group 后其下 server 正确回落到 Ungrouped——A6。
- 现有 Profile/exposure 行为不受分组引入影响——A8/A9。
- Config Import 与 server 启停/拖拽不回归——A9。
