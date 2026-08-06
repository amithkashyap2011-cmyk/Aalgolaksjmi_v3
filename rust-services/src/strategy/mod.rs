use tokio::sync::mpsc;
use crate::TradeSignal;
use tokio::time::{sleep, Duration};

pub async fn start_hybrid_engine_loop(tx: mpsc::Sender<TradeSignal>) {
    // 1. Aaryan Strategy Feed Loop
    // 2. Continually monitors Market Data feeds
    println!("[Hybrid Engine] Connecting AI Strategy Core...");

    loop {
        // Sleep to mimic 5ms high-frequency polling
        sleep(Duration::from_millis(5000)).await;

        let mock_signal = TradeSignal {
            symbol: String::from("BTCUSDT"),
            side: String::from("BUY"),
            qty: 1.25,
        };

        let res = tx.send(mock_signal).await;
        if res.is_err() {
            eprintln!("[Error] Hybrid Strategy Engine isolated.");
            break;
        }
    }
}
