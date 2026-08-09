# macOS 菜单栏增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Moor 增加 macOS tray 左键切换主窗口、活跃 Profile 状态概览，以及当前活跃 Profile 内启用 servers 的批量/单项启停。

**Architecture:** 新增 `src-tauri/src/tray/` 模块，将 SQLite 状态到菜单模型的转换放入可测试的 `menu_state.rs`，将 Tauri 原生菜单、事件分发、tray 点击和刷新循环放入 `mod.rs`。`ServerManager` 提供批量启停方法；`lib.rs` 仅负责把既有 `EventBus`、`ServerManager` 和 tray 模块接线起来。菜单每次收到领域事件时全量重建，避免维护第二套状态。

**Tech Stack:** Rust 2021、Tauri 2.10.3（tray-icon）、muda/Tauri menu API、Tokio、SQLite（rusqlite）、现有 EventBus/ServerManager 测试设施。

## Global Constraints

- tray 左键单击切换主窗口；右键仍弹原生菜单。
- `Start All Servers` / `Stop All Servers` 只作用于当前活跃 Profile 内 `enabled=1` 的 servers。
- 菜单顶部显示活跃 Profile 名与 `running/total`，状态由 SQLite 与既有 `server:status` 事件驱动刷新。
- 前端 `src/` 零改动，不新增依赖，不新增全局快捷键、Profile 快捷切换或页面直达导航。
- 保留 `Show Window`、`Quit Moor` 和 macOS `tray-template.png`。
- 左键隐藏窗口不修改 Dock 可见性；`Hide Dock Icon on Close` 只适用于现有 `CloseRequested` 流程。
- 未知或失效菜单 id 必须被安全忽略。
- 每个任务先写失败测试，再写最小实现；每个任务完成后运行对应测试并提交。

---

## 文件结构与职责

| 文件                                               | 职责                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src-tauri/src/tray/menu_state.rs`                 | 纯菜单状态模型、SQLite 查询组装、菜单 action id 解析/编码、单元测试                      |
| `src-tauri/src/tray/mod.rs`                        | Tauri MenuItem/Menu/Submenu 构建、tray 菜单事件分发、窗口 toggle、事件订阅与菜单刷新     |
| `src-tauri/src/sidecar/services/server_manager.rs` | 新增活跃 Profile 批量启停方法及其 FakeConnector 测试                                     |
| `src-tauri/src/lib.rs`                             | 注册 tray 模块；将 `EventBus`/`ServerManager` 保存进 `MoorState`；接入初始化和运行时事件 |

## 接口约定

- `TrayAction`: `StartAll | StopAll | ToggleServer(String)`；`running/starting` 的单 server action 映射为 stop，其余状态映射为 start。
- `TrayMenuState`: `active_profile_name: Option<String>`、`running_count: usize`、`total_count: usize`、`can_start_all: bool`、`can_stop_all: bool`、`servers: Vec<TrayServerItem>`。
- `TrayServerItem`: `id: String`、`name: String`、`status: ServerStatusKind`，其中 `ServerStatusKind` 为 `Running | Starting | Stopped | Error`。
- `build_tray_menu_state(db: &Database) -> Result<TrayMenuState, String>`：只读 SQLite，不取得 ServerManager 锁。
- `parse_action(id: &str, known_server_ids: &[String]) -> Option<TrayAction>`：解析 `start-all`、`stop-all`、`server:<id>`；未知 id 返回 `None`。
- `ServerManager::start_all_in_active_profile(&self)` 与 `stop_all_in_active_profile(&self)`：并发调用已有单 server 方法并忽略单项结果，保证一个失败不会阻止其他 server 尝试。

---

### Task 1: 增加 ServerManager 活跃 Profile 批量启停

**Files:**

- Modify: `src-tauri/src/sidecar/services/server_manager.rs:388-415`（现有 auto-start 方法附近）
- Test: `src-tauri/src/sidecar/services/server_manager.rs` 内现有 FakeConnector/FakeSession 测试模块

**Interfaces:**

- Consumes: `ProfileRepository::find_active_profile_server_ids()`、`start_server()`、`stop_server()`。
- Produces: `pub async fn start_all_in_active_profile(&self)`、`pub async fn stop_all_in_active_profile(&self)`，供 tray 动作分发调用。

- [ ] **Step 1: 写失败测试**

在现有 fake connector 测试模块增加测试 fixture：插入两个 server 到活跃 Profile，再插入一个 server 但不加入活跃 Profile；调用 `start_all_in_active_profile()`，断言活跃 Profile 的两个 server 状态都是 `running`，非活跃 server 仍为 `stopped`。随后调用 `stop_all_in_active_profile()`，断言前两个变为 `stopped`。

测试核心断言形态：

```rust
manager.start_all_in_active_profile().await;
assert_eq!(manager.get_server(&active_a).await.unwrap().status, "running");
assert_eq!(manager.get_server(&active_b).await.unwrap().status, "running");
assert_eq!(manager.get_server(&inactive).await.unwrap().status, "stopped");

manager.stop_all_in_active_profile().await;
assert_eq!(manager.get_server(&active_a).await.unwrap().status, "stopped");
assert_eq!(manager.get_server(&active_b).await.unwrap().status, "stopped");
```

- [ ] **Step 2: 运行失败测试**

Run: `cd src-tauri && cargo test server_manager::tests::batch -- --nocapture`
Expected: FAIL，因为两个批量方法尚未定义。

- [ ] **Step 3: 实现最小批量方法**

在 `ServerManager` 中读取 `find_active_profile_server_ids()`；复制 id 列表后释放 repository/其他临时状态；使用 `futures::future::join_all` 并发调用单项方法：

```rust
pub async fn start_all_in_active_profile(&self) {
    let ids = ProfileRepository::new(&self.db)
        .find_active_profile_server_ids()
        .unwrap_or_default();
    let _ = futures::future::join_all(ids.iter().map(|id| self.start_server(id))).await;
}

pub async fn stop_all_in_active_profile(&self) {
    let ids = ProfileRepository::new(&self.db)
        .find_active_profile_server_ids()
        .unwrap_or_default();
    let _ = futures::future::join_all(ids.iter().map(|id| self.stop_server(id))).await;
}
```

对查询错误按现有 `start_auto_start_servers` 风格安全返回；单项失败不阻断其他项。不要改动 `start_auto_start_servers` 的 auto_start 过滤。

- [ ] **Step 4: 运行通过测试**

Run: `cd src-tauri && cargo test server_manager::tests::batch -- --nocapture`
Expected: PASS。

- [ ] **Step 5: 运行相关回归测试并提交**

Run: `cd src-tauri && cargo test server_manager::tests -- --nocapture`
Expected: PASS。

```bash
git add src-tauri/src/sidecar/services/server_manager.rs
git commit -m "feat(tray): add active profile batch server controls"
```

---

### Task 2: 创建可测试的 tray menu state 模块

**Files:**

- Create: `src-tauri/src/tray/menu_state.rs`
- Create: `src-tauri/src/tray/mod.rs`（先声明 `mod menu_state;`，暂不接入完整 Tauri 渲染）
- Modify: `src-tauri/src/lib.rs:16-17`（声明 `mod tray;`，使测试模块可编译）
- Test: `src-tauri/src/tray/menu_state.rs` 内 `#[cfg(test)]` 模块

**Interfaces:**

- Consumes: `Database`、`ProfileRepository`、`ServerRepository` 的公开查询接口。
- Produces: `TrayMenuState`、`TrayServerItem`、`ServerStatusKind`、`TrayAction`、`build_tray_menu_state`、`parse_action`，供 Task 3 的 Tauri 壳调用。

- [ ] **Step 1: 写失败测试**

覆盖这些具体情况：

```rust
#[test]
fn builds_only_enabled_servers_from_active_profile() { /* 3 servers, 2 enabled; assert total=2 */ }

#[test]
fn counts_running_servers_and_exposes_action_availability() { /* 2 running of 3; start=true, stop=true */ }

#[test]
fn maps_error_status_without_panicking() { /* status="error" -> ServerStatusKind::Error */ }

#[test]
fn parses_known_and_rejects_unknown_action_ids() {
    let ids = vec!["server-a".to_string()];
    assert_eq!(parse_action("start-all", &ids), Some(TrayAction::StartAll));
    assert_eq!(parse_action("server:server-a", &ids), Some(TrayAction::ToggleServer("server-a".into())));
    assert_eq!(parse_action("server:missing", &ids), None);
    assert_eq!(parse_action("unknown", &ids), None);
}
```

测试 fixture 使用 `Database::open(":memory:")` 或现有临时 DB helper，运行 migrations、seed default profile，再通过 repository 插入 server 并调整 profile `enabled` 与数据库 status。

- [ ] **Step 2: 运行失败测试**

Run: `cd src-tauri && cargo test tray::menu_state::tests -- --nocapture`
Expected: FAIL，因为 tray 模型和构建函数尚未实现。

- [ ] **Step 3: 实现菜单状态核心**

定义公开模型。构建函数按 profile repository 返回的 enabled server id 顺序，使用 `ServerRepository::find_by_ids` 保留请求顺序；不存在的 id 直接跳过。状态映射规则：`running`→Running、`starting`→Starting、`error`→Error、其他（包括 `stopped`）→Stopped。

`can_start_all = servers.iter().any(|s| s.status != Running)`；`can_stop_all = servers.iter().any(|s| matches!(s.status, Running | Starting))`。无活跃 Profile 时 profile 名为 `None`、服务器为空。

将 action id 解析限制在已知 server id 集合内，避免陈旧菜单事件启停已删除 server。对菜单底层状态只保留名称和 status；`error_message` 不放入 tray 菜单，避免菜单过长和泄露详细运行错误。

- [ ] **Step 4: 运行通过测试**

Run: `cd src-tauri && cargo test tray::menu_state::tests -- --nocapture`
Expected: PASS。

- [ ] **Step 5: 运行 Rust 单测并提交**

Run: `cd src-tauri && cargo test`
Expected: PASS。

```bash
git add src-tauri/src/tray src-tauri/src/lib.rs
git commit -m "feat(tray): add testable tray menu state"
```

---

### Task 3: 实现原生菜单构建与动作分发

**Files:**

- Modify: `src-tauri/src/tray/mod.rs`
- Modify: `src-tauri/src/lib.rs:10-17,49-88,301-336`
- Test: `src-tauri/src/tray/menu_state.rs`（模型逻辑继续保持可测；Tauri 原生渲染通过编译验证）

**Interfaces:**

- Consumes: Task 1 的批量方法；Task 2 的 `build_tray_menu_state`、`parse_action` 和模型。
- Produces: `pub fn setup(app: &AppHandle, db: Arc<Database>, event_bus: Arc<EventBus>, server_manager: Arc<ServerManager>) -> Result<(), String>`；现有 `show_main_window` 逻辑接入 tray；菜单事件调用 server manager。

- [ ] **Step 1: 先定义菜单组装边界并编译失败**

在 `tray/mod.rs` 先定义固定 tray id（例如 `moor-tray`）和动作 id 常量；引入 `tauri::menu::{Menu, MenuItem, PredefinedMenuItem}`、`tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}`。让 `setup` 接收 app/db/event_bus/server_manager，但先返回明确的未实现错误，运行 `cargo check` 确认接线编译入口。

- [ ] **Step 2: 实现菜单构建**

`rebuild_menu(app, db)` 同步调用 `build_tray_menu_state`，创建禁用的概览 `MenuItem`s；创建 `Start All Servers` 与 `Stop All Servers`（按 `can_start_all`/`can_stop_all` 设置 enabled）；为每个 server 创建 `MenuItem`：`Running`/`Starting` 显示 `Stop <name>`，其他显示 `Start <name>`。菜单尾部放 `Show Window`、`Quit Moor`，并用 `PredefinedMenuItem::separator(app)` 分组。

Tauri `Menu::with_items` 需要 `&[&dyn IsMenuItem]`，且 menu item 需在同一局部作用域就能被菜单引用。推荐按以下结构组装（item 先放进本地 `Vec`，再取引用）：

```rust
fn build_menu(app: &AppHandle, state: &TrayMenuState) -> tauri::Result<Menu> {
    let menu = Menu::new(app)?;
    for line in &state.overview {
        let item = MenuItem::with_id(app, "overview", line, false, None::<&str>)?;
        menu.append(&item)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    for (label, id, enabled) in [
        ("Start All Servers", "start-all", state.can_start_all),
        ("Stop All Servers", "stop-all", state.can_stop_all),
    ] {
        let item = MenuItem::with_id(app, id, label, enabled, None::<&str>)?;
        menu.append(&item)?;
    }
    if !state.servers.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    for server in &state.servers {
        let (heading, action) = match server.status {
            ServerStatusKind::Running | ServerStatusKind::Starting => ("Stop", "server:{}".to_string()),
            _ => ("Start", "server:{}".to_string()),
        };
        let label = format!("{heading} {}", server.name);
        let id = format!("server:{}", server.id);
        let item = MenuItem::with_id(app, id, label, true, None::<&str>)?;
        menu.append(&item)?;
    }
    Ok(menu)
}
```

注意 `Menu::append` 每次传入 `&item`，item 在当前 scope 内存活；menu 本身持有 item 的内部句柄，无需把 item 引用存到菜单之前的作用域之外。

- [ ] **Step 3: 实现菜单事件分发**

菜单事件回调只做轻量分发：`show` 调 `show_main_window`；`quit` 调 `app.exit(0)`；`start-all`/`stop-all`/`server:<id>` 克隆 `Arc<ServerManager>` 后使用 `tauri::async_runtime::spawn` 执行：

```rust
match id {
    "show" => show_main_window(app),
    "quit" => app.exit(0),
    "start-all" => { let sm = manager.clone(); tauri::async_runtime::spawn(async move { sm.start_all_in_active_profile().await; }); }
    "stop-all" => { let sm = manager.clone(); tauri::async_runtime::spawn(async move { sm.stop_all_in_active_profile().await; }); }
    raw if raw.starts_with("server:") => {
        let server_id = raw.trim_start_matches("server:").to_string();
        let sm = manager.clone();
        tauri::async_runtime::spawn(async move {
            let should_stop = matches!(sm.get_server(&server_id).await.map(|s| s.status.as_str()), Some("running") | Some("starting"));
            let result = if should_stop { sm.stop_server(&server_id).await } else { sm.start_server(&server_id).await };
            if let Err(e) = result { eprintln!("tray server action failed: {e}"); }
        });
    }
    _ => {}
}
```

单 server 失败只记录，不 panic。clone `AppHandle` 与 `Arc<ServerManager>` 作为 task 捕获。

- [ ] **Step 4: 实现 tray 左键切换**

保留 `.show_menu_on_left_click(false)`，增加 `.on_tray_icon_event`。仅匹配 `TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }`；忽略右键、Down 和其他事件。`toggle_main_window` 使用 `get_webview_window("main")`：可见则 `hide()`，不可见则复用现有显示/聚焦逻辑。

- [ ] **Step 5: 接入 lib.rs 并运行编译验证**

在 `MoorInner` 保存 `db` 已有字段之外，再保存 `server_manager: Arc<ServerManager>`；`EventBus` 不必重复放入 `MoorState`，因为刷新循环可在 setup 中直接捕获 `event_bus.subscribe()`。用常量 tray id 通过 `app.tray_by_id` 获取 tray handle；避免依赖默认空 `TrayIconId`。

删除 `lib.rs:303-336` 的静态 tray 构建，改为调用 `tray::setup(...)`。将现有 `show_main_window` 作为 crate 内可见函数（如 `pub(crate)`）供 tray 模块调用；保持 quit/show 行为和 icon/template 跨平台分支。

- [ ] **Step 6: 运行编译和全部测试**

Run: `cd src-tauri && cargo check`
Expected: PASS。

Run: `cd src-tauri && cargo test`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/tray src-tauri/src/lib.rs
git commit -m "feat(tray): add dynamic menu and left click toggle"
```

---

### Task 4: 接入 EventBus 动态刷新并收紧运行时错误处理

**Files:**

- Modify: `src-tauri/src/tray/mod.rs`
- Modify: `src-tauri/src/lib.rs`（setup 初始化顺序与状态生命周期）
- Test: `src-tauri/src/tray/menu_state.rs` 与 `src-tauri/src/lib.rs` 现有测试

**Interfaces:**

- Consumes: Task 3 的已创建 tray handle、数据库和菜单重建函数。
- Produces: tray 在 `ServerStatus`、`ServerTools`、`ProfileActivated`、`SettingsChanged` 后自动重建；接收循环退出时不影响主应用。

- [ ] **Step 1: 写刷新行为的可测试纯函数/策略测试**

不要在无 Tauri runtime 的单测里伪造原生 tray；增加一个事件过滤/刷新策略函数测试，明确四类 `Evt` 都返回刷新、broadcast `Lagged` 也继续接收：

```rust
#[test]
fn tray_refreshes_for_all_domain_events() {
    assert!(should_refresh_for_event(&Evt::ServerStatus { server_id: "s".into(), status: "running".into(), error_message: None }));
    assert!(should_refresh_for_event(&Evt::ServerTools { server_id: "s".into() }));
    assert!(should_refresh_for_event(&Evt::ProfileActivated { profile_id: "p".into() }));
    assert!(should_refresh_for_event(&Evt::SettingsChanged { settings: serde_json::json!({}) }));
}
```

- [ ] **Step 2: 运行失败测试**

Run: `cd src-tauri && cargo test tray::tests::tray_refreshes -- --nocapture`
Expected: FAIL，因为刷新策略尚未实现。

- [ ] **Step 3: 实现订阅循环**

在 `tray::setup` 中订阅 `event_bus`，克隆 `AppHandle`、`Arc<Database>` 和固定 tray id 到 Tokio task：

```rust
while let Ok(event) = receiver.recv().await {
    if !should_refresh_for_event(&event) { continue; }
    let app = app.clone();
    let db = db.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = rebuild_menu(&app, &db);
    });
}
```

生产实现应处理 `broadcast::error::RecvError::Lagged(_)`：继续循环并立即重建一次；`Closed` 才退出。重建失败用 `eprintln!("Failed to rebuild tray menu: {err}")` 记录，不终止主进程。避免每个事件都无限创建刷新 task；每次事件只提交一次主线程任务即可。

- [ ] **Step 4: 检查 setup 生命周期与初始菜单**

确保 ServerManager 已 `load_from_db` 的异步任务与 tray 初始菜单没有数据竞争：初始菜单允许显示数据库的 stopped 状态；load 完成后由后续状态事件或显式 rebuild 更新。setup 先构建 tray，再启动订阅，确保应用一启动菜单就可用。所有 `Arc` 捕获都是 `'static`，不借用 setup 局部变量。

- [ ] **Step 5: 运行验证**

Run: `cd src-tauri && cargo fmt --check`
Expected: PASS。

Run: `cd src-tauri && cargo test`
Expected: PASS。

Run: `pnpm build:frontend`
Expected: PASS（确认前端无意外回归）。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/tray src-tauri/src/lib.rs
git commit -m "feat(tray): refresh menu from domain events"
```

---

### Task 5: macOS 运行时验收与最终回归

**Files:**

- Modify: only files needed for verified defects found during runtime validation; do not broaden scope.
- Test: packaged/dev macOS Tauri app plus existing Rust/frontend suites.

**Interfaces:**

- Consumes: Tasks 1–4 的完整 tray 功能。
- Produces: 已验证的 macOS 行为与最终干净 working tree；若发现缺陷，先按失败输出修复并重新验证。

- [ ] **Step 1: 运行 Rust 与前端完整验证**

Run: `cd src-tauri && cargo test`
Expected: PASS。

Run: `pnpm build:frontend`
Expected: PASS。

- [ ] **Step 2: 启动 Tauri 开发应用**

使用项目已有 Tauri 启动方式运行 app，验证不依赖 browser dev server 的独立 tray 行为。检查主窗口可见/隐藏、tray 右键菜单和状态内容。

- [ ] **Step 3: 验收左键行为**

按顺序验证：

1. 窗口可见时单击 tray 左键，窗口隐藏。
2. 再次单击，窗口显示且获得焦点。
3. 右键 tray 仍显示原生菜单，不会直接 toggle。
4. 开启 `Hide Dock Icon on Close` 后通过 tray 左键隐藏，Dock 图标仍保持可见。

- [ ] **Step 4: 验收状态与启停**

准备活跃 Profile 内两个 enabled server 和一个 disabled server：

1. 菜单显示 `running/total`，total 只计两个 enabled server。
2. `Start All Servers` 只启动这两个 server。
3. `Stop All Servers` 只停止这两个 server。
4. disabled server 不出现在菜单。
5. 从主窗口启动/停止 server 后重新打开菜单，概览与单 server 操作项反映最新状态。
6. 删除或切换 Profile 后，旧菜单事件不会导致崩溃或操作已失效 server。

- [ ] **Step 5: 检查最终状态并汇报证据**

Run: `git status --short`
Expected: clean（除非用户明确要求保留未提交变更）。报告实际运行的命令、PASS/FAIL 输出和 macOS 手工验收结果；若某项因环境不可用而跳过，明确说明而不是宣称全部完成。

---

## Plan self-review

- **Spec coverage:** 左键 toggle 在 Task 3/5；状态概览与 enabled Profile 过滤在 Task 2/3/5；批量启停在 Task 1/3/5；EventBus 全量刷新在 Task 4；纯逻辑单测在 Task 2/4；无依赖/无前端改动/模板图保留在 Global Constraints 与 Task 3；未知 action 安全忽略在 Task 2/3/5。
- **Placeholder scan:** 未使用 TBD、TODO、later、appropriate error handling 等占位描述；每个任务包含具体文件、接口、命令和实现形态。
- **Type consistency:** Task 1 的两个方法名与 Task 3 的调用一致；Task 2 的模型、构建函数和解析函数与 Task 3/4 的消费一致；`EventBus` 与 `Evt` 使用现有类型。
- **Scope check:** 该 spec 已将 tray UI、ServerManager 批量控制和事件刷新作为一个强耦合、可独立验收的子项目；没有引入快捷键或前端改造等独立范围。
