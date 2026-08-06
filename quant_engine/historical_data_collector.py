import httpx
import pandas as pd
import time
import os
from datetime import datetime, timedelta
from pathlib import Path

# institutional focus symbols
SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT"]
TIMEFRAMES = ["1m", "5m", "15m"]
LIMIT = 1000 # Binance max per request
BARS_PER_COMBO = 5000 # 5 requests each

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "historical"
DATA_DIR.mkdir(parents=True, exist_ok=True)

def fetch_klines(symbol, interval, limit=1000, end_time=None):
    url = "https://api.binance.com/api/v3/klines"
    params = {
        "symbol": symbol,
        "interval": interval,
        "limit": limit
    }
    if end_time:
        params["endTime"] = end_time
    
    with httpx.Client() as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()

def collect_all():
    print(f"--- Starting Institutional Data Collection ---")
    all_dfs = []
    
    for symbol in SYMBOLS:
        for tf in TIMEFRAMES:
            print(f"Collecting {BARS_PER_COMBO} bars for {symbol} @ {tf}...")
            tf_dfs = []
            last_end_time = None
            
            for i in range(BARS_PER_COMBO // LIMIT):
                try:
                    data = fetch_klines(symbol, tf, limit=LIMIT, end_time=last_end_time)
                    if not data:
                        break
                    
                    df = pd.DataFrame(data, columns=[
                        "open_time", "open", "high", "low", "close", "volume",
                        "close_time", "quote_volume", "count", "taker_buy_volume",
                        "taker_buy_quote_volume", "ignore"
                    ])
                    
                    # Convert types
                    for col in ["open", "high", "low", "close", "volume"]:
                        df[col] = df[col].astype(float)
                    
                    tf_dfs.append(df)
                    
                    # Update last_end_time for pagination (overlap by 1ms to get previous)
                    last_end_time = int(df["open_time"].min()) - 1
                    
                    time.sleep(0.1) # Respect rate limits
                except Exception as e:
                    print(f"Error fetching {symbol} {tf}: {e}")
                    break
            
            if tf_dfs:
                combined_tf = pd.concat(tf_dfs).drop_duplicates(subset="open_time").sort_values("open_time")
                combined_tf["symbol"] = symbol
                combined_tf["timeframe"] = tf
                all_dfs.append(combined_tf)

    if all_dfs:
        final_df = pd.concat(all_dfs)
        output_path = DATA_DIR / "binance_institutional_v8.csv"
        final_df.to_csv(output_path, index=False)
        print(f"--- SUCCESS: Collected {len(final_df)} total samples ---")
        print(f"Dataset saved to: {output_path}")
    else:
        print("--- FAILURE: No data collected ---")

if __name__ == "__main__":
    collect_all()
