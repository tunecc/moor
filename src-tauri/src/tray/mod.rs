use crate::sidecar::db::Database;
use crate::sidecar::services::event_bus::{EventBus, Evt};
use crate::sidecar::services::server_manager::ServerManager;
use crate::tray::menu_state::{
    build_tray_menu_state, parse_action, TrayAction, TrayMenuState,
};
use std::sync::Arc;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tokio::sync::broadcast::error::RecvError;

pub mod menu_state;

const TRAY_ID: &str = "moor-tray";

pub fn setup(
    app: &AppHandle,
    db: Arc<Database>,
    event_bus: Arc<EventBus>,
    server_manager: Arc<ServerManager>,
) -> Result<(), String> {
    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .show_menu_on_left_click(false)
        .tooltip("Moor - MCP Manager")
        .on_menu_event({
            let server_manager = server_manager.clone();
            let db = db.clone();
            move |app, event| {
                // Snapshot the current enabled in-active-profile server ids from the
                // same DB the menu was built from. A small synchronous read per click
                // keeps parse_action scoped: stale/unknown ids resolve to None.
                let known_ids: Vec<String> = build_tray_menu_state(&db)
                    .map(|state| state.servers.into_iter().map(|s| s.id).collect())
                    .unwrap_or_default();
                match parse_action(event.id.as_ref(), &known_ids) {
                    Some(TrayAction::StartAll) => {
                        let sm = server_manager.clone();
                        tauri::async_runtime::spawn(async move {
                            sm.start_all_in_active_profile().await;
                        });
                    }
                    Some(TrayAction::StopAll) => {
                        let sm = server_manager.clone();
                        tauri::async_runtime::spawn(async move {
                            sm.stop_all_in_active_profile().await;
                        });
                    }
                    Some(TrayAction::ToggleServer(server_id)) => {
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
                    None => match event.id.as_ref() {
                        "show" => crate::show_main_window(app),
                        "quit" => app.exit(0),
                        _ => {}
                    },
                }
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

    // Initial menu from persisted DB state. Built before the refresh loop so the
    // tray is populated at startup; subsequent domain events keep it live.
    rebuild_menu(app, &db)?;

    // Subscribe to domain events and rebuild the tray menu on the main thread
    // whenever a server/profile/settings event fires. Both `app` and `db` are
    // `'static` (AppHandle + Arc<Database>), so the spawned task never borrows
    // setup locals.
    let mut rx = event_bus.subscribe();
    let app_handle = app.clone();
    let db_handle = db.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let should_refresh = match rx.recv().await {
                Ok(event) => should_refresh_for_event(&event),
                Err(RecvError::Lagged(_)) => true, // missed events → rebuild to converge
                Err(RecvError::Closed) => break,
            };
            if !should_refresh {
                continue;
            }
            let app = app_handle.clone();
            let db = db_handle.clone();
            let app_for_closure = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Err(err) = rebuild_menu(&app_for_closure, &db) {
                    eprintln!("Failed to rebuild tray menu: {err}");
                }
            });
        }
    });

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
        // Use a native checkmark (✓) to mark up servers. The label is just the
        // server name — clicking toggles start/stop, same as before — so the
        // verb prefix is dropped and the running state is visible at a glance.
        let checked = server.status.is_active();
        let item = CheckMenuItem::with_id(app, format!("server:{}", server.id), &server.name, true, checked, None::<&str>)?;
        menu.append(&item)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    menu.append(&show)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Moor", true, None::<&str>)?;
    menu.append(&quit)?;
    Ok(menu)
}

/// Rebuild the tray menu from live DB state and apply it to the tray icon.
/// Used both for the initial menu at setup and for every event-triggered refresh.
pub(crate) fn rebuild_menu(app: &AppHandle, db: &Database) -> Result<(), String> {
    let state = build_tray_menu_state(db)?;
    let menu = build_menu(app, &state).map_err(|e| e.to_string())?;
    app.tray_by_id(TRAY_ID)
        .ok_or_else(|| "tray icon not found".to_string())?
        .set_menu(Some(menu))
        .map_err(|e| e.to_string())
}

/// Decide whether a domain event should trigger a tray menu rebuild.
/// All four `Evt` variants change tray-relevant state, so each returns `true`.
/// The match is exhaustive so a future new `Evt` variant forces an explicit
/// decision here rather than silently skipping a refresh.
fn should_refresh_for_event(event: &Evt) -> bool {
    match event {
        Evt::ServerStatus { .. } => true,
        Evt::ServerTools { .. } => true,
        Evt::ProfileActivated { .. } => true,
        Evt::SettingsChanged { .. } => true,
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sidecar::services::event_bus::Evt;

    #[test]
    fn tray_refreshes_for_all_domain_events() {
        assert!(should_refresh_for_event(&Evt::ServerStatus {
            server_id: "s".into(),
            status: "running".into(),
            error_message: None,
        }));
        assert!(should_refresh_for_event(&Evt::ServerTools {
            server_id: "s".into(),
        }));
        assert!(should_refresh_for_event(&Evt::ProfileActivated {
            profile_id: "p".into(),
        }));
        assert!(should_refresh_for_event(&Evt::SettingsChanged {
            settings: serde_json::json!({}),
        }));
    }
}
