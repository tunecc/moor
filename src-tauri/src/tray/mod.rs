use crate::sidecar::db::Database;
use crate::sidecar::services::event_bus::EventBus;
use crate::sidecar::services::server_manager::ServerManager;
use crate::tray::menu_state::{build_tray_menu_state, ServerStatusKind, TrayMenuState};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub mod menu_state;

const TRAY_ID: &str = "moor-tray";

pub fn setup(
    app: &AppHandle,
    db: Arc<Database>,
    _event_bus: Arc<EventBus>,
    server_manager: Arc<ServerManager>,
) -> Result<(), String> {
    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .show_menu_on_left_click(false)
        .tooltip("Moor - MCP Manager")
        .on_menu_event({
            let server_manager = server_manager.clone();
            move |app, event| match event.id.as_ref() {
                "show" => crate::show_main_window(app),
                "quit" => app.exit(0),
                "start-all" => {
                    let sm = server_manager.clone();
                    tauri::async_runtime::spawn(async move {
                        sm.start_all_in_active_profile().await;
                    });
                }
                "stop-all" => {
                    let sm = server_manager.clone();
                    tauri::async_runtime::spawn(async move {
                        sm.stop_all_in_active_profile().await;
                    });
                }
                raw if raw.starts_with("server:") => {
                    let server_id = raw.trim_start_matches("server:").to_string();
                    let sm = server_manager.clone();
                    tauri::async_runtime::spawn(async move {
                        let should_stop = matches!(
                            sm.get_server(&server_id).await.map(|s| s.status),
                            Some(status) if status == "running" || status == "starting"
                        );
                        let result = if should_stop {
                            sm.stop_server(&server_id).await
                        } else {
                            sm.start_server(&server_id).await
                        };
                        if let Err(e) = result {
                            eprintln!("tray server action failed: {e}");
                        }
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                toggle_main_window(tray.app_handle());
            }
        });

    #[cfg(target_os = "macos")]
    let _tray = builder
        .icon(tauri::include_image!("./icons/tray-template.png"))
        .icon_as_template(true)
        .build(app)
        .map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "macos"))]
    let _tray = builder
        .icon(tauri::include_image!("./icons/32x32.png"))
        .build(app)
        .map_err(|e| e.to_string())?;

    // Initial menu from persisted DB state. Task 4 replaces this once subscriptions land.
    let state = build_tray_menu_state(&db)?;
    let menu = build_menu(app, &state).map_err(|e| e.to_string())?;
    app.tray_by_id(TRAY_ID)
        .ok_or_else(|| "tray icon not found after setup".to_string())?
        .set_menu(Some(menu))
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Build the full tray menu from a snapshot of the tray menu state.
pub(crate) fn build_menu(
    app: &AppHandle,
    state: &TrayMenuState,
) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    for line in state.overview_lines() {
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
        let heading = match server.status {
            ServerStatusKind::Running | ServerStatusKind::Starting => "Stop",
            _ => "Start",
        };
        let label = format!("{heading} {}", server.name);
        let id = format!("server:{}", server.id);
        let item = MenuItem::with_id(app, id, label, true, None::<&str>)?;
        menu.append(&item)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    menu.append(&show)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Moor", true, None::<&str>)?;
    menu.append(&quit)?;
    Ok(menu)
}

/// Rebuild the menu from live DB state. Task 4 uses this to refresh after events.
#[allow(dead_code)] // consumed by the Task 4 refresh loop
pub(crate) fn rebuild_menu(
    app: &AppHandle,
    db: &Database,
) -> Result<Menu<tauri::Wry>, String> {
    let state = build_tray_menu_state(db)?;
    build_menu(app, &state).map_err(|e| e.to_string())
}

/// Show the main window when hidden, hide it when visible.
pub(crate) fn toggle_main_window(app: &AppHandle) {
    let visible = app
        .get_webview_window("main")
        .map(|window| window.is_visible().unwrap_or(false))
        .unwrap_or(false);
    if visible {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    } else {
        crate::show_main_window(app);
    }
}