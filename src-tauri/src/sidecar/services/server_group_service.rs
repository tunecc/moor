//! Server Group 领域服务。封装分组的持久化,让路由层只负责 HTTP 形状。
//! 分组仅做 Servers 页面的视觉组织,不参与 exposure。

use crate::sidecar::db::server_group_repo::{ServerGroup, ServerGroupRepository};
use crate::sidecar::db::Database;
use std::collections::HashSet;

pub struct ServerGroupService;

pub enum ServerGroupServiceError {
    NotFound(String),
    Validation(String),
    InvalidOrder(String),
    Internal(String),
}

impl std::fmt::Debug for ServerGroupServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(m) => f.debug_tuple("NotFound").field(m).finish(),
            Self::Validation(m) => f.debug_tuple("Validation").field(m).finish(),
            Self::InvalidOrder(m) => f.debug_tuple("InvalidOrder").field(m).finish(),
            Self::Internal(m) => f.debug_tuple("Internal").field(m).finish(),
        }
    }
}

impl From<ServerGroupServiceError> for crate::sidecar::http::app_error::AppError {
    fn from(e: ServerGroupServiceError) -> Self {
        match e {
            ServerGroupServiceError::NotFound(m) => Self::not_found(m),
            ServerGroupServiceError::Validation(m) => Self::validation(m),
            ServerGroupServiceError::InvalidOrder(m) => Self::order_invalid(m),
            ServerGroupServiceError::Internal(m) => Self::internal(m),
        }
    }
}

impl ServerGroupService {
    pub fn list(db: &Database) -> Result<Vec<ServerGroup>, ServerGroupServiceError> {
        ServerGroupRepository::new(db)
            .find_all()
            .map_err(ServerGroupServiceError::Internal)
    }

    pub fn create(db: &Database, name: &str) -> Result<ServerGroup, ServerGroupServiceError> {
        if name.is_empty() {
            return Err(ServerGroupServiceError::Validation("name is required".into()));
        }
        ServerGroupRepository::new(db)
            .create(name)
            .map_err(ServerGroupServiceError::Internal)
    }

    pub fn rename(
        db: &Database,
        id: &str,
        name: Option<&str>,
    ) -> Result<ServerGroup, ServerGroupServiceError> {
        if let Some(name) = name {
            if name.is_empty() {
                return Err(ServerGroupServiceError::Validation("name is required".into()));
            }
        }
        ServerGroupRepository::new(db)
            .rename(id, name.unwrap_or(""))
            .map_err(ServerGroupServiceError::Internal)?
            .ok_or_else(|| ServerGroupServiceError::NotFound("Server group not found".into()))
    }

    pub fn remove(db: &Database, id: &str) -> Result<(), ServerGroupServiceError> {
        let removed = ServerGroupRepository::new(db)
            .remove(id)
            .map_err(ServerGroupServiceError::Internal)?;
        if !removed {
            return Err(ServerGroupServiceError::NotFound("Server group not found".into()));
        }
        Ok(())
    }

    pub fn reorder(
        db: &Database,
        group_ids: &[String],
    ) -> Result<Vec<ServerGroup>, ServerGroupServiceError> {
        let repo = ServerGroupRepository::new(db);
        let existing_ids = repo
            .find_all_ids()
            .map_err(ServerGroupServiceError::Internal)?;
        let existing_set: HashSet<_> = existing_ids.iter().collect();
        let new_set: HashSet<_> = group_ids.iter().collect();
        if existing_set != new_set || group_ids.is_empty() != existing_ids.is_empty() {
            return Err(ServerGroupServiceError::InvalidOrder(
                "Server group order must include every existing group exactly once.".into(),
            ));
        }
        repo.reorder(group_ids)
            .map_err(ServerGroupServiceError::Internal)?;
        repo.find_all()
            .map_err(ServerGroupServiceError::Internal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;

    #[test]
    fn validation_error_maps_to_bad_request() {
        let err: crate::sidecar::http::app_error::AppError =
            ServerGroupServiceError::Validation("name is required".into()).into();
        assert_eq!(err.status_code(), StatusCode::BAD_REQUEST);
        assert_eq!(err.code(), "VALIDATION_ERROR");
    }

    #[test]
    fn not_found_maps_to_404() {
        let err: crate::sidecar::http::app_error::AppError =
            ServerGroupServiceError::NotFound("nope".into()).into();
        assert_eq!(err.status_code(), StatusCode::NOT_FOUND);
    }
}
