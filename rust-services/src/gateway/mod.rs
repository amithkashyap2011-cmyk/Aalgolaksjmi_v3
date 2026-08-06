use axum::{routing::get, Json, Router};
use std::net::SocketAddr;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

pub static LATENCY_US: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
pub struct ApiHealth {
    status: String,
    hft_execution_link: String,
    rust_node_active: bool,
    active_strategies: Vec<String>,
    latency_us: u64,
}

// REST Endpoint to link the React Frontend to the Rust/C++ Hybrid backplane
async fn health_check() -> Json<ApiHealth> {
    Json(ApiHealth {
        status: "ONLINE".into(),
        hft_execution_link: "tcp://127.0.0.1:5555 (ZMQ)".into(),
        rust_node_active: true,
        active_strategies: vec!["LAKSHMI_VAR".into(), "AARYAN_HYBRID".into()],
        latency_us: LATENCY_US.load(Ordering::Relaxed),
    })
}

pub async fn start_rest_gateway() {
    let app = Router::new().route("/api/health", get(health_check));

    let addr = SocketAddr::from(([127, 0, 0, 1], 4000));
    println!("🌐 Rust API Gateway bridging to Frontend on http://{}", addr);
    
    // Non-blocking Gateway
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
