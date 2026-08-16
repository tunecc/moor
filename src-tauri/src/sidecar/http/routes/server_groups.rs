use crate::sidecar::db::server_group_repo::ServerGroup;
use crate::sidecar::http::app_error::AppError;
use crate::sidecar::http::AppState;
use crate::sidecar::services::server_group_service::ServerGroupService;
use axum::{
    extract::{Path, State},
    response::Json,
    routing::{get, put},
    Router,
};
use serde::Deserialize;
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/server-groups", get(list).post(create))
        .route(
            "/api/server-groups/{id}",
            get(get_one).put(update).delete(remove),
        )
        .route("/api/server-groups/order", put(reorder))
}

async fn list(State(state): State<Arc<AppState>>) -> Result<Json<Vec<ServerGroup>>, AppError> {
    let groups = ServerGroupService::list(&state.db).map_err(AppError::from)?;
    Ok(Json(groups))
}

async fn get_one(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ServerGroup>, AppError> {
    let group = crate::sidecar::db::server_group_repo::ServerGroupRepository::new(&state.db)
        .find_by_id(&id)
        .map_err(AppError::internal)?
        .ok_or_else(|| AppError::not_found("Server group not found"))?;
    Ok(Json(group))
}

#[derive(Deserialize)]
struct CreateBody {
    name: String,
}

async fn create(
    State(state): State<Arc<AppState>>,
    axum::Json(body): axum::Json<CreateBody>,
) -> Result<(axum::http::StatusCode, Json<ServerGroup>), AppError> {
    let group = ServerGroupService::create(&state.db, &body.name).map_err(AppError::from)?;
    Ok((axum::http::StatusCode::CREATED, Json(group)))
}

#[derive(Deserialize)]
struct UpdateBody {
    name: Option<String>,
}

async fn update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    axum::Json(body): axum::Json<UpdateBody>,
) -> Result<Json<ServerGroup>, AppError> {
    let group =
        ServerGroupService::rename(&state.db, &id, body.name.as_deref()).map_err(AppError::from)?;
    Ok(Json(group))
}

async fn remove(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    ServerGroupService::remove(&state.db, &id).map_err(AppError::from)?;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReorderBody {
    group_ids: Vec<String>,
}

async fn reorder(
    State(state): State<Arc<AppState>>,
    axum::Json(body): axum::Json<ReorderBody>,
) -> Result<Json<Vec<ServerGroup>>, AppError> {
    if body.group_ids.is_empty() {
        return Err(AppError::order_invalid(
            "Server group order must include every existing group exactly once.",
        ));
    }
    let groups =
        ServerGroupService::reorder(&state.db, &body.group_ids).map_err(AppError::from)?;
    Ok(Json(groups))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use std::time::SystemTime;
    use tower::ServiceExt;

    fn temp_data_dir(test_name: &str) -> std::path::PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("system time is before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("moor-server-group-route-{test_name}-{timestamp}"))
    }

    fn test_state(data_dir: std::path::PathBuf) -> Arc<AppState> {
        AppState::for_test(&data_dir)
    }

    #[tokio::test]
    async fn create_and_list_groups() {
        let data_dir = temp_data_dir("create-list");
        let state = test_state(data_dir.clone());
        let group = ServerGroupService::create(&state.db, "Dev").expect("create");
        assert_eq!(group.name, "Dev");

        let response = router()
            .with_state(state)
            .oneshot(
                axum::http::Request::builder()
                    .method(axum::http::Method::GET)
                    .uri("/api/server-groups")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("route should respond");
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let _ = std::fs::remove_dir_all(data_dir);
    }
}
