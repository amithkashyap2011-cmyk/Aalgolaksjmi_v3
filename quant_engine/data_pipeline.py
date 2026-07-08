"""
Live market-data pipeline for continuous model training.

Fetches real historical candles from Binance's public REST API (the same
`/api/v3/klines` endpoint the TS side uses — see binanceService.ts:387) and
derives the exact same feature set the live inference path builds, so a
model trained here sees data statistically identical to what it will be
asked to score in production:

  - CNN's 12-dim vector mirrors CNNPredictor.ts:88-101 feature-for-feature
    (open, high, low, close, volume, ret_1, vol_1, dist_ma, hi_low, std_14,
    ma_fast/9, ma_slow/21).
  - The "Market" block of PPO's 32-dim state vector mirrors the RSI/ADX/ATR/
    MACD-histogram/close-over-EMA200 slots in
    PPOExecutionPredictor.ts:143-150. The regime / order-flow / smart-money
    / CNN-signal / risk blocks in that vector depend on order-book,
    liquidation and funding-rate data this pipeline does not have, so they
    stay zero-filled here exactly as the old DummyEnv padding did.
"""
import logging
import time
from typing import Dict, List

import httpx
import numpy as np
import pandas as pd

logger = logging.getLogger("DataPipeline")

BINANCE_BASE = "https://api.binance.com"

SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT"]
INTERVAL = "5m"
KLINE_LIMIT = 1500

# Canonical CNN feature order — must match CNNPredictor.ts's assembly order
# and feature_schema.json's FEATURE_NAMES exactly.
CNN_FEATURE_COLS = ["open", "high", "low", "close", "volume",
                    "ret_1", "vol_1", "dist_ma", "hi_low", "std_14", "ma_fast", "ma_slow"]
SEQ_LEN = 64

# Indices into CNN_FEATURE_COLS for the within-window stationarizing
# transform (see stationarize_windows).
_PRICE_IDX = [0, 1, 2, 3, 10, 11]   # open, high, low, close, ma_fast, ma_slow
_VOLUME_IDX = 4
_CLOSE_IDX = 3

KLINE_COLUMNS = [
    "open_time", "open", "high", "low", "close", "volume",
    "close_time", "quote_volume", "trades", "taker_base", "taker_quote", "ignore",
]


def fetch_klines(symbol: str, interval: str = INTERVAL, limit: int = KLINE_LIMIT) -> pd.DataFrame:
    """Real historical candles — no synthetic/mock data, no bundled CSV."""
    url = f"{BINANCE_BASE}/api/v3/klines"
    params = {"symbol": symbol, "interval": interval, "limit": limit}
    with httpx.Client(timeout=15.0) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        raw = resp.json()

    df = pd.DataFrame(raw, columns=KLINE_COLUMNS)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(np.float64)
    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms")
    df["symbol"] = symbol
    return df[["symbol", "timestamp", "open", "high", "low", "close", "volume"]]


def fetch_klines_paginated(symbol: str, interval: str = INTERVAL,
                           total_bars: int = 6000) -> pd.DataFrame:
    """Fetch more history than one request allows by paging backwards with
    endTime. Spot /api/v3/klines silently caps limit at 1000, so a single
    limit=1500 request never returned more than 1000 bars anyway."""
    per_request = 1000
    frames: List[pd.DataFrame] = []
    end_time: int | None = None
    with httpx.Client(timeout=15.0) as client:
        while sum(len(f) for f in frames) < total_bars:
            params: dict = {"symbol": symbol, "interval": interval, "limit": per_request}
            if end_time is not None:
                params["endTime"] = end_time
            resp = client.get(f"{BINANCE_BASE}/api/v3/klines", params=params)
            resp.raise_for_status()
            raw = resp.json()
            if not raw:
                break
            page = pd.DataFrame(raw, columns=KLINE_COLUMNS)
            frames.append(page)
            end_time = int(page["open_time"].iloc[0]) - 1
            if len(raw) < per_request:
                break  # reached the start of the symbol's history
            time.sleep(0.15)  # stay well under public rate limits

    if not frames:
        return pd.DataFrame(columns=["symbol", "timestamp", "open", "high", "low", "close", "volume"])

    df = pd.concat(frames, ignore_index=True)
    df = df.drop_duplicates(subset="open_time").sort_values("open_time").tail(total_bars)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(np.float64)
    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms")
    df["symbol"] = symbol
    return df[["symbol", "timestamp", "open", "high", "low", "close", "volume"]].reset_index(drop=True)


def stationarize_windows(windows: np.ndarray) -> np.ndarray:
    """Make raw price/volume columns stationary *within each window* so they
    stop encoding symbol identity (BTC at ~60k vs SHIB at ~0.00002 pooled
    through one global z-score just told the model which coin it was).

    windows: (N, seq_len, F) in CNN_FEATURE_COLS order.
      - price-level columns -> ratio to the window's final close, minus 1
      - volume              -> ratio to the window's mean volume, minus 1
      - derived columns (ret_1, vol_1, dist_ma, hi_low, std_14) are already
        stationary and pass through untouched.
    Used identically at training and inference — keep both call sites on
    this one implementation."""
    out = windows.astype(np.float32).copy()
    last_close = out[:, -1, _CLOSE_IDX][:, None, None]          # (N,1,1)
    last_close = np.where(np.abs(last_close) < 1e-12, 1e-12, last_close)
    out[:, :, _PRICE_IDX] = out[:, :, _PRICE_IDX] / last_close - 1.0
    mean_vol = out[:, :, _VOLUME_IDX].mean(axis=1)[:, None]      # (N,1)
    mean_vol = np.where(np.abs(mean_vol) < 1e-12, 1e-12, mean_vol)
    out[:, :, _VOLUME_IDX] = out[:, :, _VOLUME_IDX] / mean_vol - 1.0
    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)


def build_cnn_windows(feature_frame: pd.DataFrame, seq_len: int = SEQ_LEN) -> tuple:
    """Sliding real-history windows from one symbol's feature frame (rows
    must be chronological, warmup NaNs already dropped).

    Returns (windows, end_rows): windows[j] covers rows j..j+seq_len-1
    stationarized, end_rows[j] is the absolute positional index of the
    window's final row in feature_frame — the row whose label/prediction
    the window belongs to."""
    from numpy.lib.stride_tricks import sliding_window_view

    feats = feature_frame[CNN_FEATURE_COLS].values.astype(np.float32)
    n = len(feats)
    if n < seq_len:
        return np.empty((0, seq_len, feats.shape[1]), dtype=np.float32), np.empty(0, dtype=np.int64)
    wins = sliding_window_view(feats, (seq_len, feats.shape[1]))[:, 0]   # (n-seq_len+1, seq, F)
    end_rows = np.arange(seq_len - 1, n, dtype=np.int64)
    return stationarize_windows(wins), end_rows


def add_cnn_features(df: pd.DataFrame) -> pd.DataFrame:
    """Adds the 7 derived CNN features on top of raw OHLCV, matching
    CNNPredictor.ts's ret_1/vol_1/dist_ma/hi_low/std_14/ma_fast/ma_slow."""
    df = df.copy()
    df["ret_1"] = df["close"] / df["close"].shift(1) - 1
    df["vol_1"] = df["volume"] / df["volume"].shift(1) - 1
    df["ma_fast"] = df["close"].rolling(9, min_periods=9).mean()
    df["ma_slow"] = df["close"].rolling(21, min_periods=21).mean()
    df["dist_ma"] = df["close"] / df["ma_slow"] - 1
    df["hi_low"] = df["high"] / df["low"].replace(0, np.nan) - 1
    roll14 = df["close"].rolling(14, min_periods=14)
    df["std_14"] = roll14.std() / roll14.mean()
    return df


def add_ppo_market_features(df: pd.DataFrame) -> pd.DataFrame:
    """RSI(14), ADX(14), ATR(14), MACD histogram(12,26,9), EMA200 — the
    only slots of the 32-dim PPO state vector this pipeline can compute
    from plain OHLCV candles."""
    df = df.copy()
    close, high, low = df["close"], df["high"], df["low"]

    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14, min_periods=14).mean()
    loss = (-delta.clip(upper=0)).rolling(14, min_periods=14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi"] = 100 - (100 / (1 + rs))

    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    df["atr"] = tr.rolling(14, min_periods=14).mean()

    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    atr_safe = df["atr"].replace(0, np.nan)
    plus_di = 100 * pd.Series(plus_dm, index=df.index).rolling(14, min_periods=14).mean() / atr_safe
    minus_di = 100 * pd.Series(minus_dm, index=df.index).rolling(14, min_periods=14).mean() / atr_safe
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    df["adx"] = dx.rolling(14, min_periods=14).mean()

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    df["macd_hist"] = macd - signal

    df["ema200"] = close.ewm(span=200, adjust=False).mean()
    return df


def build_symbol_dataset(symbol: str, interval: str = INTERVAL, limit: int = KLINE_LIMIT) -> pd.DataFrame:
    df = fetch_klines(symbol, interval, limit)
    df = add_cnn_features(df)
    df = add_ppo_market_features(df)
    return df


def build_training_universe(symbols: List[str] = SYMBOLS, interval: str = INTERVAL,
                             limit: int = KLINE_LIMIT) -> Dict[str, pd.DataFrame]:
    """Fetch + feature-engineer every symbol in the training universe.
    Best-effort: a single symbol failing (rate limit, network blip) doesn't
    abort the whole training cycle."""
    out: Dict[str, pd.DataFrame] = {}
    for sym in symbols:
        try:
            out[sym] = build_symbol_dataset(sym, interval, limit)
            time.sleep(0.2)  # stay well under Binance's public rate limits
        except Exception as e:
            logger.warning(f"[DataPipeline] Failed to fetch {sym}: {e}")
    return out


def combined_cnn_frame(universe: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Concatenate all symbols' CNN feature columns, dropping warmup NaNs.
    Forward-return labeling happens per-symbol (via groupby) upstream in
    train_cnn.py, never across a symbol boundary."""
    cnn_cols = ["symbol", "timestamp", "open", "high", "low", "close", "volume",
                "ret_1", "vol_1", "dist_ma", "hi_low", "std_14", "ma_fast", "ma_slow"]
    frames = [df[cnn_cols] for df in universe.values() if not df.empty]
    if not frames:
        return pd.DataFrame(columns=cnn_cols)
    combined = pd.concat(frames, ignore_index=True)
    return combined.dropna(subset=cnn_cols[2:])
