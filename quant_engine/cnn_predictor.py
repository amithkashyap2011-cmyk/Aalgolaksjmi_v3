import time
import torch
import torch.nn as nn
import numpy as np
import os
import threading

class CNN1D(nn.Module):
    """
    AQEA 1D Convolutional Neural Network
    Architecture:
    - Conv1D (Filters: 64, Kernel: 3) + BN
    - Conv1D (Filters: 128, Kernel: 3) + BN
    - Conv1D (Filters: 256, Kernel: 3) + BN
    - Global Max Pooling
    - Dense (128)
    - Output (3 classes: LONG, SHORT, HOLD)
    """
    def __init__(self, input_features=12, seq_len=64):
        super(CNN1D, self).__init__()
        self.conv1 = nn.Conv1d(in_channels=input_features, out_channels=64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(64)
        self.conv2 = nn.Conv1d(in_channels=64, out_channels=128, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(128)
        self.conv3 = nn.Conv1d(in_channels=128, out_channels=256, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(256)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.3)
        self.pool = nn.AdaptiveMaxPool1d(1)
        self.fc1 = nn.Linear(256, 128)
        self.fc2 = nn.Linear(128, 3)

    def forward(self, x):
        # x shape: (batch, features, seq_len)
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.dropout(x)
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.dropout(x)
        x = self.relu(self.bn3(self.conv3(x)))
        x = self.pool(x).squeeze(2)
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x # Returns raw logits

from pathlib import Path
import os

PROJECT_ROOT = Path(__file__).resolve().parent.parent

from feature_schema import FeatureSchemaV8

class CNNPredictor:
    # Reuse a fetched window for this long before hitting Binance again —
    # bars are 5m, the trade scheduler ticks every 60s, so one fetch per
    # symbol per tick is plenty.
    WINDOW_CACHE_TTL_SECONDS = 55

    def __init__(self, model_path=None):
        self.model = CNN1D()
        self.checkpoint_loaded = False
        self.last_inference = None
        self.schema = FeatureSchemaV8()
        self._lock = threading.Lock()
        self._window_cache = {}  # symbol -> (fetched_at_monotonic, np.ndarray (seq, F))

        if model_path is None:
            # Standard path for AQEA V7.2
            model_path = PROJECT_ROOT / "models" / "cnn" / "checkpoints" / "cnn_1d_v1.pt"
        else:
            model_path = Path(model_path)
        self.model_path = model_path

        self._load(model_path)

    def _load(self, model_path: Path):
        print(f"[CNN] Initializing with checkpoint: {model_path}")

        try:
            if not model_path.exists():
                print(f"[CNN] WARNING: Checkpoint missing at {model_path}. Size: N/A. Model initialized with random weights.")
                self.checkpoint_loaded = False
                return

            size_mb = model_path.stat().st_size / (1024 * 1024)
            print(f"[CNN] Found checkpoint. Size: {size_mb:.2f} MB")

            new_model = CNN1D()
            new_model.load_state_dict(torch.load(model_path, map_location=torch.device('cpu')))
            new_model.eval()

            # Architecture Verification
            # Check model input layer weights to verify dimension
            in_weights = new_model.conv1.weight.shape[1]
            if in_weights != self.schema.DIMENSION:
                raise RuntimeError(f"AQEA_FEATURE_SCHEMA_ERROR: Model expects {in_weights} features, but schema defines {self.schema.DIMENSION}")

            self.model = new_model
            self.checkpoint_loaded = True
            print(f"[CNN] Successfully loaded weights from {model_path}")
            print(f"[CNN] Verification PASS: Input={in_weights}, Schema={self.schema.DIMENSION}")
        except Exception as e:
            print(f"[CNN] FATAL: Failed to load or verify model: {e}")
            if "AQEA_FEATURE_SCHEMA_ERROR" in str(e):
                 raise e

    def reload(self):
        """Hot-reload the checkpoint from disk after a training cycle
        promotes a new one — no process restart required."""
        with self._lock:
            FeatureSchemaV8.reload()  # MEANS/STDS may have been rewritten this cycle too
            self._load(self.model_path)
            return self.checkpoint_loaded

    def _fetch_window(self, symbol: str) -> np.ndarray:
        """Builds the real 64-bar stationarized feature window for a symbol
        from live Binance candles, via the SAME feature/window code training
        uses (data_pipeline) — so inference inputs are distributed exactly
        like training inputs. Cached per symbol for WINDOW_CACHE_TTL_SECONDS."""
        from data_pipeline import (CNN_FEATURE_COLS, INTERVAL, SEQ_LEN,
                                   add_cnn_features, fetch_klines,
                                   stationarize_windows)

        cached = self._window_cache.get(symbol)
        now = time.monotonic()
        if cached is not None and now - cached[0] < self.WINDOW_CACHE_TTL_SECONDS:
            return cached[1]

        # 64 bars + 21-bar ma_slow warmup + headroom; drop the final row —
        # it is the still-forming candle, and training only ever saw
        # completed bars.
        raw = fetch_klines(symbol, INTERVAL, SEQ_LEN + 40)
        feats = add_cnn_features(raw).dropna(subset=CNN_FEATURE_COLS).iloc[:-1]
        if len(feats) < SEQ_LEN:
            raise RuntimeError(f"CNN_WINDOW_INSUFFICIENT_HISTORY: {len(feats)} bars < {SEQ_LEN}")

        window = feats[CNN_FEATURE_COLS].values.astype(np.float32)[-SEQ_LEN:]
        window = stationarize_windows(window[None, :, :])[0]   # (seq, F)
        self._window_cache[symbol] = (now, window)
        return window

    def predict(self, ohlcv_latest, indicators_latest, symbol=None):
        if not self.checkpoint_loaded:
            raise RuntimeError("CNN_MODEL_NOT_LOADED")

        directions = ["LONG", "SHORT", "HOLD"]

        if symbol:
            # V2 path: real 64-bar history window. The single-bar features
            # the server sends are ignored — the window is rebuilt here from
            # the same candles with the same code training used.
            try:
                window = self._fetch_window(symbol)
            except Exception as e:
                return {
                    "direction": "HOLD",
                    "probability": 0.5,
                    "confidence": 0.0,
                    "error": f"WINDOW_FETCH_FAILED: {e}",
                }
            normalized = (window - self.schema.MEANS) / (self.schema.STDS + 1e-8)
            input_tensor = torch.from_numpy(normalized).unsqueeze(0).permute(0, 2, 1)
        else:
            # Legacy single-bar path for callers that don't pass a symbol.
            # 🛡️ V8.3 Feature Vector Assembly
            raw_features = np.array(ohlcv_latest + indicators_latest, dtype=np.float32)

            if len(raw_features) != self.schema.DIMENSION:
                 raise RuntimeError(f"AQEA_FEATURE_SCHEMA_ERROR: Received {len(raw_features)} features, expected {self.schema.DIMENSION}")

            # 🛡️ NORMALIZATION (Z-Score from Schema)
            features = self.schema.normalize(raw_features)

            # Validation: Check for NaN or Inf
            if not np.isfinite(features).all():
                return {
                    "direction": "HOLD",
                    "probability": 0.5,
                    "confidence": 0.0,
                    "error": "INVALID_FEATURES"
                }

            # Simulate 64-bar sequence for 1D CNN by repeating the current vector
            input_tensor = torch.tensor(features).repeat(1, 64, 1).permute(0, 2, 1)

        with torch.no_grad():
            output = self.model(input_tensor)
            probs = torch.softmax(output, dim=1).numpy()[0]

        # Mapping: 0:LONG, 1:SHORT, 2:HOLD
        idx = np.argmax(probs)

        confidence = float(np.max(probs))
        self.last_inference = {
            "timestamp": np.datetime64('now').astype(str),
            "direction": directions[idx],
            "confidence": confidence,
            "symbol": symbol,
            "mode": "window_v2" if symbol else "legacy_repeat"
        }

        return {
            "direction": directions[idx],
            "probability": float(probs[idx]),
            "confidence": confidence,
            "probs": {
                "LONG": round(float(probs[0]), 4),
                "SHORT": round(float(probs[1]), 4),
                "HOLD": round(float(probs[2]), 4)
            }
        }

    def debug_predict(self, ohlcv_latest, indicators_latest):
        """
        Exposes internal state for AQEA V8.3 Forensics.
        """
        raw_features = np.array(ohlcv_latest + indicators_latest, dtype=np.float32)
        if len(raw_features) != self.schema.DIMENSION:
             return {"error": f"Dimension mismatch: Received {len(raw_features)}, expected {self.schema.DIMENSION}"}
        
        norm_features = self.schema.normalize(raw_features)
        input_tensor = torch.tensor(norm_features).repeat(1, 64, 1).permute(0, 2, 1)
        
        with torch.no_grad():
            # Run manually to get logits
            x = self.model.relu(self.model.conv1(input_tensor))
            x = self.model.relu(self.model.conv2(x))
            x = self.model.pool(x).squeeze(2)
            x = self.model.relu(self.model.fc1(x))
            logits = self.model.fc2(x).numpy()[0]
            
            probs = torch.softmax(torch.tensor(logits).unsqueeze(0), dim=1).numpy()[0]
            
        directions = ["LONG", "SHORT", "HOLD"]
        idx = np.argmax(probs)
        
        return {
            "feature_names": self.schema.FEATURE_NAMES,
            "raw_input": raw_features.tolist(),
            "normalized_input": norm_features.tolist(),
            "raw_logits": logits.tolist(),
            "softmax_probs": probs.tolist(),
            "predicted_class": directions[idx],
            "checkpoint_loaded": self.checkpoint_loaded
        }

cnn_predictor = CNNPredictor()
