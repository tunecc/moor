# macOS 菜单栏（tray）增强：左键切窗口 + 状态概览 + 服务器启停

日期：2026-08-09
状态：已确认，待实现

## 背景

当前 macOS 菜单栏（tray）实现很基础（`src-tauri/src/lib.rs` 的 setup 内联构建）：

- 菜单只有「Show Window」「Quit Moor」两项。
- 左键点击 tray 图标无任何绑定（`show_menu_on_left_click(false)`），想打开主窗口只能右键菜单→Show、点 Dock 图标，或再启动一个实例。
- 菜单是静态一次构建的，与运行时状态（活跃 Profile、服务器运行状态）完全脱节。

Moor 的核心语义是「当前活跃 Profile 决定 Agents 能看到的工具」，服务器启停是高频操作；主窗口（1200×800）弹出也偏慢。菜单栏作为常驻入口，理应承担「快速呼出主窗口」和「不打开窗口即可掌握的运行状态」。

## 目标

- **tray 左键单击**切换主窗口显隐：窗口隐藏则显示并聚焦，可见则隐藏；右键仍弹菜单。
- **状态概览（只读）**：菜单顶部显示当前活跃 Profile 名与运行中服务器数（`running/total`）。
- **服务器一键启停**：`Start All Servers` / `Stop All Servers` 作用于**当前活跃 Profile 内启用（`enabled=1`）的 servers**；并对每个 server 提供独立的启停项。
- 菜单内容**随事件实时刷新**，与前端状态同源，不和窗口内显示不一致。
- 以「纯逻辑可测 + 薄 UI 壳」的方式组织，补齐 tray 当前无测试的薄弱点。

## 设计

### 1. 模块结构

新增 `src-tauri/src/tray/` 模块，「可测的核心推演放纯逻辑，UI 绑定放薄壳」：

```
src-tauri/src/tray/
├── mod.rs         — 对外端点：构建并设置菜单、处理菜单动作、左键切换、订阅 EventBus 刷新循环
└── menu_state.rs  — 纯逻辑：数据模型 TrayMenuState、build_tray_menu_state(db) 构建函数、id⟷TrayAction 互转（全部单测在这）
```

`lib.rs` 只做接线：`mod tray;` 声明，setup 里调用构建/注册/订阅，run 事件里调用左键切换。tray 相关的事件注册与静态菜单构建代码从 setup 中移入模块，setup 保持精简。

### 2. 菜单模型与构建（menu_state.rs）

```rust
pub enum TrayAction {
    StartAll,
    StopAll,
    ToggleServer(String),   // running/starting → stop；其余（含 error）→ start
}

pub enum ServerStatusKind { Running, Starting, Stopped, Error }

pub struct TrayServerItem { pub id: String, pub name: String, pub status: ServerStatusKind }

pub struct TrayMenuState {
    pub overview: Vec<String>,    // 只读信息行，如 ["Profile: default", "Servers: 2/3 running"]
    pub actions:  Vec<TrayAction>,// StartAll / StopAll（可用性由 status 推导，见 §4）
    pub servers:  Vec<TrayServerItem>, // 逐个 server 行，按 sort_order 排序
}
```

`build_tray_menu_state(db: &Database) -> Result<TrayMenuState, String>`：全部从 SQLite 同步读取，不触碰 `ServerManager` 锁：

1. `ProfileRepository::find_active_id()` → 活跃 Profile；`find_by_id` 取名字；无活跃 Profile 则概览显示 `No active profile`。
2. `find_active_profile_server_ids()` → 当前活跃 Profile 内 `enabled=1` 的 server id 列表（`profile_repo.rs:230` 现成查询，正好符合作用域语义）。
3. 对每个 id，`ServerRepository::find_by_id` 取 name / status / error_message（DB 状态由现有 `persist_server_status` 同步写入，是权威）。
4. 统计 running 数，产出概览两行与 per-server 项。

字符串 id 贯穿渲染与事件映射：`start-all` / `stop-all` / `server:<uuid>` / `show` / `quit`。`parse_action(id, known_server_ids)` 收敛在 `menu_state.rs`，可单测（未知/失效 id 返回 `None`，事件层忽略）。

### 3. 渲染与动作绑定（mod.rs）

- `build_and_set(app, state)`：遍历 `TrayMenuState` → `MenuItem::with_id` / `Menu::with_items`，分隔线分组；`show_menu_on_left_click(false)` 保持。
- 只读信息行用禁用态 `MenuItem`（`enabled(false)`）表达。
- `on_menu_event`：按 `event.id.as_ref()` 分发到动作；`ToggleServer` 等异步动作 `tauri::async_runtime::spawn`，不阻塞主线程。
- 保留 tray 图标的 macOS 模板图（`tray-template.png`），本次不改图标视觉。

### 4. 启停可用性规则

- 概览行 `Servers: <running>/<total> running`；`total` 为活跃 Profile 内启用 server 数，`running` 为其中状态为 running 的个数。
- `Start All Servers`：有任一个未在运行（非 running）时可用。
- `Stop All Servers`：有任一个在运行（running 或 starting）时可用。

### 5. 左键切换主窗口

- `TrayIconBuilder.on_tray_icon_event`：`TrayIconEvent::Click { button: MouseButton::Left, button_state: ButtonState::Up, .. }` → `toggle_main_window(app)`。
- 规则：窗口可见 → `hide()`；隐藏 → `show()` + `set_focus()`，并恢复 Dock 可见性（与现有 `show_main_window` 一致）。
- 隐藏时**不**修改 Dock 图标状态：`Hide Dock Icon on Close` 只在该设置定义的「关闭窗口」语义（`CloseRequested`）下生效；toggle 隐藏不是关闭，不应让 Dock 图标自行消失。若用户开启 hide-dock 且用左键隐藏窗口，Dock 图标保持原状，从菜单 `Show Window` 恢复。

### 6. ServerManager 新增批量方法

参照现有 `start_auto_start_servers`（`server_manager.rs:388`）的结构，但不过滤 `auto_start`：

```rust
pub async fn start_all_in_active_profile(&self) {
    // find_active_profile_server_ids() 收集 id → futures::future::join_all(self.start_server(id))
    // start_server 对 running 天然 no-op
}
pub async fn stop_all_in_active_profile(&self) {
    // 同上收集 id → join_all(self.stop_server(id))
  // stop_server 对 stopped 天然 no-op
}
```

### 7. MoorState 变更与 EventBus 订阅

`MoorInner` 增持 `event_bus: Arc<EventBus>` 与 `server_manager: Arc<ServerManager>`（setup 已创建的实例放入，避免重复建）。

setup 里 `event_bus.subscribe()` 拿 `broadcast::Receiver<Evt>`，spawn 一个刷新循环：

```rust
loop { while let Ok(_evt) = rx.recv().await { app.run_on_main_thread(|| rebuild_tray_menu(&app)); } }
```

`run_on_main_thread` 确保原生菜单操作在主线程。菜单体量小，任一 `Evt`（`server:status` / `server:tools` / `profile:activated` / `settings:changed`）都触发全量重建，不做增量。启停动作本身触发 `server:status` → 菜单自动刷新，因此**前端与 tray 从同一事件总线取状态，不会不一致**。

### 8. 前端改动：无

`SSEContext` 已经消费 `server:status` 等事件并驱动 `useServers`/`useProfiles` 查询失效，窗口内 UI 会随 tray 的启停自动刷新，无需改动前端。

## 涉及文件

| 文件                                               | 改动                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src-tauri/src/tray/menu_state.rs`（新增）         | 纯模型 + `build_tray_menu_state` + `TrayAction` 互转；质量单测                                 |
| `src-tauri/src/tray/mod.rs`（新增）                | 菜单构建/设置、动作分发、左键切换、EventBus 刷新循环                                           |
| `src-tauri/src/lib.rs`                             | `mod tray;`；setup 中把 tray 构建与订阅收口到模块；`MoorState` 增持 event_bus / server_manager |
| `src-tauri/src/sidecar/services/server_manager.rs` | 新增 `start_all_in_active_profile` / `stop_all_in_active_profile`；配套测试                    |

## 不改动

- 前端（`src/`）零改动；不新增依赖。
- 不新增全局快捷键、tray 内 Profile 切换、页面直达导航、tray 图标视觉。
- 菜单「Show Window」「Quit Moor」两项保留在底部 footers。
- ServerManager 现有 `start_auto_start_servers` 等行为不变，新增方法互不影响。

## 测试

- `menu_state.rs` 单测（内存 DB）：
  - 概览文案与总数；2/3 running 时 `Start All`/`Stop All` 可用性；
  - 非活跃 Profile 的 server 不出现（过滤语义）；
  - error 状态呈现；`TrayAction` ⟷ id 互转、未知 id 解析为忽略。
- `server_manager.rs` 用现有 FakeConnector/FakeSession 模式验证：
  - `start_all_in_active_profile` 并发启动活跃 Profile 内全部 id，缺 id 的 server 不启动；
  - `stop_all_in_active_profile` 全停、no-op。
- `lib.rs` 现有 `should_*`/port 测试保持不变；编译级验证 tray 模块可挂载。

## 验收

- 单点左键菜单栏图标：主窗口隐藏→显示聚焦；再点→隐藏；右键仍弹菜单，菜单位于当前状态。
- 菜单顶部显示当前活跃 Profile 名与 `running/total`；服务器启动/停止后（含窗口内操作）菜单数字随之更新。
- `Start All/Stop All` 只作用于当前活跃 Profile 内启用的 servers；per-server 项可单独启停，状态同步。
- 左键隐藏窗口后 Dock 图标不被隐藏。
- 未知/失效菜单 id 不崩溃（被忽略）。
- 单测通过（`cargo test` 中 tray/server_manager 相关用例）。
