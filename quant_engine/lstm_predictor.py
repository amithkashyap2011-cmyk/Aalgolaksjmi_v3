import time
import torch
import torch.nn as nn
import numpy as np
import os
import threading
from pathlib import Path

class BiLSTM(nn.Module):
    """
    AQEA Bi-Directional LSTM Sequence Neural Network
    Architecture:
    - Bi-LSTM (Input: 12 features, Hidden: 64, Layers: 2, Bidirectional: True)
    - BatchNorm1d
    - Dense (64) + ReLU + Dropout
    - Output (3 classes: LONG, SHORT, HOLD)
    """
    def __init__(self, input_features=12, hidden_dim=64, num_layers=2):
        super(BiLSTM, self).__init__()
        self.lstm = nn.LSTM(
            input_size=input_features,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=0.2 if num_layers > 1 else 0.0
        )
        self.bn = nn.BatchNorm1d(hidden_dim * 2)
        self.fc1 = nn.Linear(hidden_dim * 2, 64)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.3)
        self.fc2 = nn.Linear(64, 3)

    def forward(self, x):
        # x shape: (batch, seq_len, features)
        out, (hn, cn) = self.lstm(x)
        # Use final output step for prediction
        last_step = out[:, -1, :] # shape: (batch, hidden_dim * 2)
        x = self.bn(last_step)
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        logits = self.fc2(x)
        return logits

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LSTM_DIR = PROJECT_ROOT / "models" / "lstm"
V2_CHECKPOINT = LSTM_DIR / "checkpoints" / "bilstm_v2.pt"
V2_SCHEMA = LSTM_DIR / "lstm_schema.json"


class LSTMPredictor:
    """Serves the v2 Bi-LSTM (train_lstm.py): real 64-bar windows rebuilt here
    from live candles with the SAME data_pipeline code the CNN and training use.

    v1 (bilstm_v1.pt) was trained on random synthetic sequences and fed one
    feature row tiled 16 times; it collapsed to LONG at ~0.998 confidence
    (2026-09-27) and is no longer loaded. Until a v2 checkpoint passes the
    training promotion gate this returns a neutral HOLD at confidence 0."""
    WINDOW_CACHE_TTL_SECONDS = 55
    CLASSES = ("LONG", "SHORT", "HOLD")  # label ids 0/1/2 — same as train_cnn / train_lstm

    def __init__(self, model_path=None):
        self.model = None
        self.checkpoint_loaded = False
        self.last_inference = None
        self._lock = threading.Lock()
        self._window_cache = {}
        self.means = None
        self.stds = None
        self.model_path = Path(model_path) if model_path else V2_CHECKPOINT
        self._load(self.model_path)

    def _load(self, model_path: Path):
        print(f"[LSTM] Initializing with checkpoint: {model_path}")
        try:
            if not model_path.exists() or not V2_SCHEMA.exists():
                print(f"[LSTM] No v2 checkpoint/schema yet ({model_path.name}) — serving neutral HOLD until train_lstm.py promotes one.")
                self.checkpoint_loaded = False
                return
            import json
            schema = json.loads(V2_SCHEMA.read_text())
            means = np.array(schema["MEANS"], dtype=np.float32)
            stds = np.array(schema["STDS"], dtype=np.float32)
            new_model = BiLSTM(input_features=len(schema["FEATURE_NAMES"]), hidden_dim=64, num_layers=2)
            new_model.load_state_dict(torch.load(model_path, map_location=torch.device("cpu")))
            new_model.eval()
            # Swap stats together with the model, and only after the weights loaded:
            # a failed reload must keep the OLD stats paired with the OLD model.
            self.means, self.stds, self.model = means, stds, new_model
            self.checkpoint_loaded = True
            print(f"[LSTM] Loaded v2 weights from {model_path}")
        except Exception as e:
            print(f"[LSTM] ERROR: Failed to load checkpoint {model_path}: {e}")
            self.checkpoint_loaded = False

    def reload(self):
        """Hot-reload after training_worker promotes a new checkpoint."""
        with self._lock:
            self._window_cache = {}
            self._load(self.model_path)
            return self.checkpoint_loaded

    def _fetch_window(self, symbol: str) -> np.ndarray:
        """Same window construction as CNNPredictor._fetch_window / training."""
        from data_pipeline import (CNN_FEATURE_COLS, INTERVAL, SEQ_LEN,
                                   add_cnn_features, get_live_klines, stationarize_windows)
        cached = self._window_cache.get(symbol)
        now = time.monotonic()
        if cached is not None and now - cached[0] < self.WINDOW_CACHE_TTL_SECONDS:
            return cached[1]
        raw = get_live_klines(symbol, INTERVAL, SEQ_LEN + 40)
        feats = add_cnn_features(raw).dropna(subset=CNN_FEATURE_COLS).iloc[:-1]  # drop the forming candle
        if len(feats) < SEQ_LEN:
            raise RuntimeError(f"LSTM_WINDOW_INSUFFICIENT_HISTORY: {len(feats)} bars < {SEQ_LEN}")
        window = feats[CNN_FEATURE_COLS].values.astype(np.float32)[-SEQ_LEN:]
        window = stationarize_windows(window[None, :, :])[0]
        self._window_cache[symbol] = (now, window)
        return window

    @staticmethod
    def _neutral(reason: str) -> dict:
        return {"direction": "HOLD", "confidence": 0.0, "probability": 0.5,
                "probs": {"LONG": 0.3333, "SHORT": 0.3333, "HOLD": 0.3334}, "error": reason}

    def predict(self, symbol: str, features: list = None):
        """features is ignored — the real window is rebuilt from candles."""
        if not self.checkpoint_loaded or self.model is None:
            return self._neutral("LSTM_V2_NOT_TRAINED")
        if not symbol:
            return self._neutral("SYMBOL_REQUIRED_FOR_WINDOW")
        try:
            window = self._fetch_window(symbol)
        except Exception as e:
            return self._neutral(f"WINDOW_FETCH_FAILED: {e}")
        try:
            with self._lock, torch.no_grad():
                normalized = (window - self.means) / (self.stds + 1e-8)
                tensor_in = torch.from_numpy(normalized.astype(np.float32)).unsqueeze(0)  # (1, seq, F)
                probs = torch.softmax(self.model(tensor_in), dim=1).squeeze(0).numpy()
            p_long, p_short, p_hold = float(probs[0]), float(probs[1]), float(probs[2])
            idx = int(np.argmax(probs))
            result = {
                "direction": self.CLASSES[idx],
                "confidence": round(float(probs[idx]), 4),
                "probability": round(max(p_long, p_short), 4),
                "probs": {"LONG": round(p_long, 4), "SHORT": round(p_short, 4), "HOLD": round(p_hold, 4)},
                "checkpoint_loaded": True,
            }
            self.last_inference = result
            return result
        except Exception as e:
            print(f"[LSTM] Inference error: {e}")
            return self._neutral(str(e))


# Shared instance (served by main.py, hot-reloaded by training_scheduler.py).
lstm_predictor = LSTMPredictor()
