use crate::sidecar::db::profile_repo::ProfileRepository;
use crate::sidecar::db::server_repo::ServerRepository;
use crate::sidecar::db::Database;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ServerStatusKind {
    Running,
    Starting,
    Stopped,
    Error,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TrayServerItem {
    pub id: String,
    pub name: String,
    pub status: ServerStatusKind,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TrayAction {
    StartAll,
    StopAll,
    ToggleServer(String),
}

#[derive(Debug, Clone)]
pub struct TrayMenuState {
    pub active_profile_name: Option<String>,
    pub running_count: usize,
    pub total_count: usize,
    pub can_start_all: bool,
    pub can_stop_all: bool,
    pub servers: Vec<TrayServerItem>,
}

impl TrayMenuState {
    /// Two read-only lines: ["Profile: default", "Servers: 2/3 running"].
    /// When no active profile, first line is "No active profile" and folders are empty counts.
    pub fn overview_lines(&self) -> Vec<String> {
        let profile_line = match &self.active_profile_name {
            Some(name) => format!("Profile: {name}"),
            None => "No active profile".to_string(),
        };
        vec![
            profile_line,
            format!(
                "Servers: {}/{} running",
                self.running_count, self.total_count
            ),
        ]
    }
}

fn map_status(status: &str) -> ServerStatusKind {
    match status {
        "running" => ServerStatusKind::Running,
        "starting" => ServerStatusKind::Starting,
        "error" => ServerStatusKind::Error,
        _ => ServerStatusKind::Stopped,
    }
}

pub fn build_tray_menu_state(db: &Database) -> Result<TrayMenuState, String> {
    let profile_repo = ProfileRepository::new(db);
    let server_repo = ServerRepository::new(db);

    let Some(active_id) = profile_repo.find_active_id()? else {
        return Ok(TrayMenuState {
            active_profile_name: None,
            running_count: 0,
            total_count: 0,
            can_start_all: false,
            can_stop_all: false,
            servers: vec![],
        });
    };

    let active_profile_name = profile_repo.find_by_id(&active_id)?.map(|p| p.name);

    let ids = profile_repo.find_active_profile_server_ids()?;
    let mut servers = server_repo.find_by_ids(&ids)?;
    // The menu lists servers by sort_order (ascending, default 0 when missing),
    // matching ServerRepository::find_all, not the app_servers row order.
    servers.sort_by_key(|s| s.sort_order.unwrap_or(0));
    let servers = servers
        .into_iter()
        .map(|server| TrayServerItem {
            id: server.id,
            name: server.name,
            status: map_status(&server.status),
        })
        .collect::<Vec<_>>();

    let running_count = servers
        .iter()
        .filter(|s| s.status == ServerStatusKind::Running)
        .count();
    let total_count = servers.len();
    let can_start_all = servers
        .iter()
        .any(|s| !matches!(s.status, ServerStatusKind::Running));
    let can_stop_all = servers.iter().any(|s| {
        matches!(
            s.status,
            ServerStatusKind::Running | ServerStatusKind::Starting
        )
    });

    Ok(TrayMenuState {
        active_profile_name,
        running_count,
        total_count,
        can_start_all,
        can_stop_all,
        servers,
    })
}

pub fn parse_action(id: &str, known_server_ids: &[String]) -> Option<TrayAction> {
    match id {
        "start-all" => Some(TrayAction::StartAll),
        "stop-all" => Some(TrayAction::StopAll),
        _ => id
            .strip_prefix("server:")
            .filter(|server_id| known_server_ids.iter().any(|known| known == server_id))
            .map(|server_id| TrayAction::ToggleServer(server_id.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::{build_tray_menu_state, parse_action, ServerStatusKind, TrayAction};
    use crate::sidecar::db::profile_repo::ProfileRepository;
    use crate::sidecar::db::server_repo::{ServerInsertInput, ServerRepository};
    use crate::sidecar::db::Database;

    fn setup_db() -> Database {
        let db = Database::open(std::path::Path::new(":memory:")).expect("open in-memory db");
        db.run_migrations().expect("run migrations");
        ProfileRepository::new(&db)
            .seed_default()
            .expect("seed default profile");
        db
    }

    fn server_input(name: &str) -> ServerInsertInput {
        ServerInsertInput {
            name: name.into(),
            connection_type: "stdio".into(),
            command: Some("node".into()),
            args: None,
            url: None,
            env: None,
            headers: None,
            working_dir: None,
            auto_start: false,
        }
    }

    fn insert_server(db: &Database, id: &str, sort_order: i64) {
        ServerRepository::new(db)
            .insert_one_with_id(id, sort_order, &server_input(id))
            .expect("insert server");
    }

    fn assign_enabled(db: &Database, ids: &[&str]) {
        let ids: Vec<String> = ids.iter().map(|s| s.to_string()).collect();
        ProfileRepository::new(db)
            .assign_to_active_profile(&ids)
            .expect("assign servers to active profile");
    }

    #[test]
    fn builds_only_enabled_servers_from_active_profile() {
        let db = setup_db();
        // Non-trivial sort_orders: find_by_ids returns row order (server-a first),
        // but the menu must present them sorted by sort_order (server-b first).
        insert_server(&db, "server-a", 10);
        insert_server(&db, "server-b", 1);
        insert_server(&db, "server-c", 5);

        assign_enabled(&db, &["server-a", "server-b"]);
        // server-c is a member of the active profile but disabled.
        assign_enabled(&db, &["server-c"]);
        db.run(
            "UPDATE profile_servers SET enabled = 0 WHERE server_id = ?",
            &[&"server-c"],
        )
        .expect("disable server-c");

        let state = build_tray_menu_state(&db).expect("build tray state");
        assert_eq!(state.total_count, 2);
        assert_eq!(state.running_count, 0);
        let ids: Vec<&str> = state.servers.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&"server-a"));
        assert!(ids.contains(&"server-b"));
        assert!(!ids.contains(&"server-c"));
        let names: Vec<&str> = state.servers.iter().map(|s| s.name.as_str()).collect();
        // Sorted ascending by sort_order: server-b (1) before server-a (10).
        assert_eq!(names, vec!["server-b", "server-a"]);
    }

    #[test]
    fn counts_running_servers_and_exposes_action_availability() {
        let db = setup_db();
        insert_server(&db, "server-a", 0);
        insert_server(&db, "server-b", 1);
        insert_server(&db, "server-c", 2);
        assign_enabled(&db, &["server-a", "server-b", "server-c"]);

        let server_repo = ServerRepository::new(&db);
        server_repo
            .update_status("server-a", "running", None)
            .expect("set running");
        server_repo
            .update_status("server-b", "running", None)
            .expect("set running");
        // server-c stays stopped.

        let state = build_tray_menu_state(&db).expect("failed to build tray state");
        assert_eq!(state.running_count, 2);
        assert_eq!(state.total_count, 3);
        assert!(state.can_start_all);
        assert!(state.can_stop_all);

        server_repo
            .update_status("server-c", "running", None)
            .expect("set running");
        let all_running = build_tray_menu_state(&db).expect("failed to build tray state");
        assert_eq!(all_running.running_count, 3);
        assert!(!all_running.can_start_all);
        assert!(all_running.can_stop_all);
    }

    #[test]
    fn marks_starting_status_as_stop_able_and_start_able() {
        let db = setup_db();
        insert_server(&db, "server-a", 0);
        assign_enabled(&db, &["server-a"]);
        ServerRepository::new(&db)
            .update_status("server-a", "starting", None)
            .expect("set starting");

        let state = build_tray_menu_state(&db).expect("failed to build tray state");
        assert_eq!(state.total_count, 1);
        assert_eq!(state.servers[0].status, ServerStatusKind::Starting);
        assert!(state.can_stop_all, "starting counts as stop-able");
        assert!(
            state.can_start_all,
            "starting is not Running, so start-all applies"
        );
    }

    #[test]
    fn all_stopped_servers_disallow_stop_all_but_allow_start_all() {
        let db = setup_db();
        insert_server(&db, "server-a", 0);
        insert_server(&db, "server-b", 1);
        assign_enabled(&db, &["server-a", "server-b"]);
        // Default inserted status is "stopped".

        let state = build_tray_menu_state(&db).expect("failed to build tray state");
        assert_eq!(state.total_count, 2);
        assert_eq!(state.running_count, 0);
        assert!(!state.can_stop_all);
        assert!(state.can_start_all);
    }

    #[test]
    fn maps_error_status_without_panicking() {
        let db = setup_db();
        insert_server(&db, "server-a", 0);
        assign_enabled(&db, &["server-a"]);
        ServerRepository::new(&db)
            .update_status("server-a", "error", Some("boom"))
            .expect("update error status");

        let state = build_tray_menu_state(&db).expect("failed to build tray state");
        assert_eq!(state.total_count, 1);
        assert_eq!(state.servers[0].status, ServerStatusKind::Error);
    }

    #[test]
    fn parses_known_and_rejects_unknown_action_ids() {
        let ids = vec!["server-a".to_string()];
        assert_eq!(parse_action("start-all", &ids), Some(TrayAction::StartAll));
        assert_eq!(
            parse_action("server:server-a", &ids),
            Some(TrayAction::ToggleServer("server-a".into()))
        );
        assert_eq!(parse_action("server:missing", &ids), None);
        assert_eq!(parse_action("unknown", &ids), None);
    }

    #[test]
    fn menu_state_overview_lines_report_profile_and_running_counts() {
        let db = setup_db();
        insert_server(&db, "server-a", 0);
        insert_server(&db, "server-b", 1);
        insert_server(&db, "server-c", 2);
        assign_enabled(&db, &["server-a", "server-b", "server-c"]);
        let server_repo = ServerRepository::new(&db);
        server_repo
            .update_status("server-a", "running", None)
            .expect("set running");
        server_repo
            .update_status("server-b", "running", None)
            .expect("set running");

        let state = build_tray_menu_state(&db).expect("failed to build tray state");
        assert_eq!(
            state.overview_lines(),
            vec![
                "Profile: Default".to_string(),
                "Servers: 2/3 running".to_string()
            ]
        );
    }

    #[test]
    fn menu_state_overviews_empty_when_no_active_profile() {
        let db = setup_db();
        insert_server(&db, "server-a", 0);
        assign_enabled(&db, &["server-a"]);

        db.run("UPDATE profiles SET is_active = 0", &[])
            .expect("clear active profile");

        let state = build_tray_menu_state(&db).expect("failed to build tray state");
        assert_eq!(state.active_profile_name, None);
        assert_eq!(state.running_count, 0);
        assert_eq!(state.total_count, 0);
        assert!(state.servers.is_empty());
        assert_eq!(
            state.overview_lines(),
            vec![
                "No active profile".to_string(),
                "Servers: 0/0 running".to_string()
            ]
        );
    }
}
