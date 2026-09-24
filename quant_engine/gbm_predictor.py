"""Shadow predictor for the gradient-boosted model trained by train_gbm.py.

Rebuilds the same stationarized window the CNN uses from completed candles
(same code path as training) and returns LONG / SHORT / HOLD probabilities.
Its votes are recorded by the server as SHADOW — they never place trades.
"""
import logging
import threading
import time

import joblib
import numpy as np

from data_pipeline import CNN_FEATURE_COLS, INTERVAL, SEQ_LEN, add_cnn_features, fetch_klines, get_live_klines, stationarize_windows
from train_gbm import CHECKPOINT_PATH, FORWARD_HORIZON, window_to_row

logger = logging.getLogger("GBMPredictor")
DIRECTIONS = ["LONG", "SHORT", "HOLD"]  # label order used in training


class GBMPredictor:
    WINDOW_CACHE_TTL_SECONDS = 30

    def __init__(self):
        self.model = None
        self.checkpoint_loaded = False
        self.last_inference = None
        self._cache: dict = {}
        self._lock = threading.Lock()
        self.reload()

    def reload(self) -> None:
        with self._lock:
            try:
                self.model = joblib.load(CHECKPOINT_PATH)
                self.checkpoint_loaded = True
                logger.info(f"[GBM] Loaded {CHECKPOINT_PATH}")
            except Exception as e:
                self.model, self.checkpoint_loaded = None, False
                logger.warning(f"[GBM] No checkpoint ({e}) — predictions return HOLD.")

    def _row(self, symbol: str) -> np.ndarray:
        cached = self._cache.get(symbol)
        now = time.monotonic()
        if cached and now - cached[0] < self.WINDOW_CACHE_TTL_SECONDS:
            return cached[1]
        raw = get_live_klines(symbol, INTERVAL, SEQ_LEN + 40)  # shared bar-aligned cache + backoff
        # Drop the still-forming candle: training only saw completed bars.
        feats = add_cnn_features(raw).dropna(subset=CNN_FEATURE_COLS).iloc[:-1]
        if len(feats) < SEQ_LEN:
            raise RuntimeError(f"GBM_INSUFFICIENT_HISTORY: {len(feats)} bars < {SEQ_LEN}")
        window = feats[CNN_FEATURE_COLS].values.astype(np.float32)[-SEQ_LEN:]
        row = window_to_row(stationarize_windows(window[None, :, :]))
        self._cache[symbol] = (now, row)
        return row

    def predict(self, symbol: str) -> dict:
        if not self.checkpoint_loaded:
            return {"direction": "HOLD", "probability": 0.0, "confidence": 0.0, "error": "GBM_MODEL_NOT_LOADED"}
        try:
            row = self._row(symbol)
        except Exception as e:
            return {"direction": "HOLD", "probability": 0.0, "confidence": 0.0, "error": f"WINDOW_FETCH_FAILED: {e}"}
        with self._lock:
            probs = self.model.predict_proba(row)[0]
            classes = list(self.model.classes_)
        p = {DIRECTIONS[int(c)]: float(probs[i]) for i, c in enumerate(classes)}
        for d in DIRECTIONS:
            p.setdefault(d, 0.0)
        direction = max(p, key=p.get)
        self.last_inference = {"timestamp": np.datetime64("now").astype(str), "symbol": symbol, "direction": direction}
        return {
            "direction": direction,
            "probability": p[direction],
            "confidence": p[direction],
            "probabilities": p,
            # Canonical 3-class fields the server's ModelInferenceBridge parses.
            "probLong": p["LONG"],
            "probShort": p["SHORT"],
            "probHold": p["HOLD"],
            "horizonBars": FORWARD_HORIZON,
            "modelName": "GBM_TREES_V1",
            "inferenceMode": "REAL_MODEL",
        }


gbm_predictor = GBMPredictor()
