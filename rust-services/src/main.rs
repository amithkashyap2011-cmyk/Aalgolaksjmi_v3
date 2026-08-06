use tokio::sync::mpsc;
use zmq;
use std::sync::atomic::Ordering;

mod gateway;
mod strategy;
mod risk;

// Simulated TradeSignal emitted by Hybrid Strategy Engine
#[derive(Debug)]
pub struct TradeSignal {
    pub symbol: String,
    pub side: String,
    pub qty: f64,
}

#[tokio::main(flavor = "multi_thread", worker_threads = 8)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 AALGOLAKSHMI Rust Microservices Layer Binding Port 5555");

    let ctx = zmq::Context::new();
    
    // Publisher -> C++ Execution
    let publisher = ctx.socket(zmq::PUB).expect("Failed creating ZeroMQ socket");
    publisher.bind("tcp://127.0.0.1:5555").expect("Failed binding ZeroMQ port");

    // Subscriber <- C++ Telemetry
    let telemetry_sub = ctx.socket(zmq::SUB).expect("Failed creating ZMQ SUB");
    telemetry_sub.connect("tcp://127.0.0.1:5556").expect("Failed connecting telemetry");
    telemetry_sub.set_subscribe(b"").expect("Failed sub all");

    // Channel linking Aaryan Strategy Core to Lakshmi Risk Filter
    let (tx, mut rx) = mpsc::channel::<TradeSignal>(1024);

    // AI & Strategy Pipeline Loop
    tokio::spawn(async move {
        while let Some(signal) = rx.recv().await {
            println!("[Aaryan CORE] Signal Received: {} on {}", signal.side, signal.symbol);
            let evaluation_result = risk::evaluate_kelly_cvar_limits(&signal);
            
            if evaluation_result.is_valid {
                let payload = format!("{}|{}|{}", signal.symbol, signal.side, signal.qty);
                let _ = publisher.send(&payload, 0);
            }
        }
    });

    // Telemetry Monitoring Task (from C++ Engine)
    tokio::spawn(async move {
        println!("🛰️ Telemetry Listener Active (Port 5556)");
        loop {
            if let Ok(msg) = telemetry_sub.recv_string(0) {
                if let Ok(data) = msg {
                    if data.starts_with("telemetry|") {
                        if let Some(val_str) = data.split('|').last() {
                            if let Ok(latency) = val_str.parse::<u64>() {
                                gateway::LATENCY_US.store(latency, Ordering::Relaxed);
                            }
                        }
                    }
                }
            }
            tokio::task::yield_now().await;
        }
    });

    // Invoke external engine loop 
    tokio::select! {
        _ = strategy::start_hybrid_engine_loop(tx) => {},
        _ = gateway::start_rest_gateway() => {},
    }

    Ok(())
}
