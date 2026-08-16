use super::Database;
use serde::{Deserialize, Serialize};

/// Servers 页面的视觉分组。分组仅做组织,不参与 exposure。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerGroup {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn map_group(row: &rusqlite::Row<'_>) -> rusqlite::Result<ServerGroup> {
    Ok(ServerGroup {
        id: row.get("id")?,
        name: row.get("name")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub struct ServerGroupRepository<'a> {
    pub db: &'a Database,
}

impl<'a> ServerGroupRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// 按 sort_order 升序返回全部具名分组。
    pub fn find_all(&self) -> Result<Vec<ServerGroup>, String> {
        self.db.query_all(
            "SELECT * FROM server_groups ORDER BY sort_order ASC, created_at ASC",
            &[],
            map_group,
        )
    }

    pub fn find_by_id(&self, id: &str) -> Result<Option<ServerGroup>, String> {
        self.db
            .query_one("SELECT * FROM server_groups WHERE id = ?1", &[&id], map_group)
    }

    /// 创建一个分组,sort_order 取 MIN(sort_order)-1,使其排在最前(与 server 新建方向一致)。
    pub fn create(&self, name: &str) -> Result<ServerGroup, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        self.db.transaction(|conn| {
            let next_sort_order = match conn.query_row(
                "SELECT MIN(sort_order) FROM server_groups",
                [],
                |row| row.get::<_, Option<i64>>(0),
            ) {
                Ok(Some(value)) => value - 1,
                Ok(None) => 0,
                Err(e) => return Err(e.to_string()),
            };
            conn.execute(
                "INSERT INTO server_groups (id, name, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![&id, &name, &next_sort_order, &now, &now],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })?;
        self.find_by_id(&id)
            .and_then(|g| g.ok_or_else(|| "Created server group could not be reloaded".into()))
    }

    pub fn rename(&self, id: &str, name: &str) -> Result<Option<ServerGroup>, String> {
        let exists = self.db.query_one(
            "SELECT id FROM server_groups WHERE id = ?1",
            &[&id],
            |row| row.get::<_, String>(0),
        )?;
        if exists.is_none() {
            return Ok(None);
        }
        let now = chrono::Utc::now().to_rfc3339();
        self.db.run(
            "UPDATE server_groups SET name = ?1, updated_at = ?2 WHERE id = ?3",
            &[&name, &now, &id],
        )?;
        self.find_by_id(id)
    }

    /// 删除分组,并把其下所有 server 的 group_id 置 NULL(回落到 Ungrouped)。
    /// server 本身不删除。
    pub fn remove(&self, id: &str) -> Result<bool, String> {
        let exists = self.db.query_one(
            "SELECT id FROM server_groups WHERE id = ?1",
            &[&id],
            |row| row.get::<_, String>(0),
        )?;
        if exists.is_none() {
            return Ok(false);
        }
        self.db.transaction(|conn| {
            // 显式回落 group_id,与 ON DELETE SET NULL 语义等价(列上未建 FK 约束)。
            conn.execute(
                "UPDATE mcp_servers SET group_id = NULL WHERE group_id = ?1",
                [&id],
            )
            .map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM server_groups WHERE id = ?1", [&id])
                .map_err(|e| e.to_string())?;
            Ok(())
        })?;
        Ok(true)
    }

    /// 按给定顺序回写 sort_order;入参必须等于现存全部具名分组 id 集合。
    pub fn reorder(&self, ids: &[String]) -> Result<(), String> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.transaction(|conn| {
            for (index, id) in ids.iter().enumerate() {
                conn.execute(
                    "UPDATE server_groups SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![index as i64, &now, id],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(())
        })
    }

    pub fn find_all_ids(&self) -> Result<Vec<String>, String> {
        self.db.query_all(
            "SELECT id FROM server_groups",
            &[],
            |row| row.get::<_, String>(0),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;

    fn temp_db() -> Database {
        let ts = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("moor-server-group-repo-{ts}.db"));
        let db = Database::open(&path).expect("open db");
        db.run_migrations().expect("migrate");
        db
    }

    #[test]
    fn create_assigns_decreasing_sort_order() {
        let db = temp_db();
        let repo = ServerGroupRepository::new(&db);
        let a = repo.create("Dev").expect("create a");
        let b = repo.create("Ops").expect("create b");
        // 空表 → 0,之后每条 -1,因此后建的排在前面。
        assert_eq!(a.sort_order, 0);
        assert_eq!(b.sort_order, -1);
        let names: Vec<String> = repo.find_all().unwrap().into_iter().map(|g| g.name).collect();
        assert_eq!(names, vec!["Ops".to_string(), "Dev".to_string()]);
    }

    #[test]
    fn rename_keeps_id_and_servers() {
        let db = temp_db();
        let repo = ServerGroupRepository::new(&db);
        let g = repo.create("Dev").expect("create");
        let renamed = repo.rename(&g.id, "DevOps").expect("rename");
        assert_eq!(renamed.unwrap().name, "DevOps");
        assert_eq!(repo.find_by_id(&g.id).unwrap().unwrap().id, g.id);
    }

    #[test]
    fn delete_falls_back_servers_to_ungrouped() {
        use crate::sidecar::db::server_repo::{ServerInsertInput, ServerRepository};
        let db = temp_db();
        let group_repo = ServerGroupRepository::new(&db);
        let server_repo = ServerRepository::new(&db);
        let g = group_repo.create("Dev").expect("create group");

        let server = server_repo
            .insert_batch_with_active_profile(&[ServerInsertInput {
                name: "s1".into(),
                connection_type: "stdio".into(),
                command: Some("node".into()),
                args: Some(vec![]),
                url: None,
                env: None,
                headers: None,
                working_dir: None,
                auto_start: false,
            }])
            .expect("insert server")[0]
            .clone();

        server_repo
            .update(&server.id, "group_id = ?1", &[&Some(g.id.as_str())])
            .expect("assign group");

        let removed = group_repo.remove(&g.id).expect("remove");
        assert!(removed);
        assert!(group_repo.find_by_id(&g.id).unwrap().is_none());

        let group_id: Option<String> = db
            .query_one(
                "SELECT group_id FROM mcp_servers WHERE id = ?1",
                &[&server.id],
                |row| row.get::<_, Option<String>>(0),
            )
            .expect("query group_id")
            .flatten();
        assert!(group_id.is_none(), "server should fall back to ungrouped");
    }

    #[test]
    fn delete_missing_returns_false() {
        let db = temp_db();
        let repo = ServerGroupRepository::new(&db);
        assert!(!repo.remove("nope").expect("remove missing"));
    }

    #[test]
    fn reorder_writes_sort_order_in_given_sequence() {
        let db = temp_db();
        let repo = ServerGroupRepository::new(&db);
        let a = repo.create("A").expect("create a");
        let b = repo.create("B").expect("create b");
        let c = repo.create("C").expect("create c");
        // 反转顺序
        repo.reorder(&[c.id.clone(), b.id.clone(), a.id.clone()])
            .expect("reorder");
        let names: Vec<String> = repo
            .find_all()
            .expect("list")
            .into_iter()
            .map(|g| g.name)
            .collect();
        assert_eq!(names, vec!["C", "B", "A"]);
    }
}
