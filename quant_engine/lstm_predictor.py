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
from feature_schema import FeatureSchemaV8

class LSTMPredictor:
    WINDOW_CACHE_TTL_SECONDS = 55

    def __init__(self, model_path=None):
        self.model = BiLSTM()
        self.checkpoint_loaded = False
        self.last_inference = None
        self.schema = FeatureSchemaV8()
        self._lock = threading.Lock()
        self._window_cache = {}

        if model_path is None:
            model_path = PROJECT_ROOT / "models" / "lstm" / "checkpoints" / "bilstm_v1.pt"
        else:
            model_path = Path(model_path)
        self.model_path = model_path
        self._load(model_path)

    def _load(self, model_path: Path):
        print(f"[LSTM] Initializing with checkpoint: {model_path}")
        try:
            if not model_path.exists():
                print(f"[LSTM] WARNING: Checkpoint missing at {model_path}. Model initialized with random weights.")
                self.checkpoint_loaded = False
                return

            size_mb = model_path.stat().st_size / (1024 * 1024)
            print(f"[LSTM] Found checkpoint. Size: {size_mb:.2f} MB")

            new_model = BiLSTM()
            new_model.load_state_dict(torch.load(model_path, map_location=torch.device('cpu')))
            new_model.eval()

            self.model = new_model
            self.checkpoint_loaded = True
            print(f"[LSTM] Successfully loaded weights from {model_path}")
        except Exception as e:
            print(f"[LSTM] ERROR: Failed to load checkpoint {model_path}: {e}")
            self.checkpoint_loaded = False

    def predict(self, symbol: str, features: list):
        """
        Run inference on feature vector
        features: 12-dim list or 2D array [seq_len, 12]
        """
        try:
            feat_arr = np.array(features, dtype=np.float32)
            if feat_arr.ndim == 1:
                # Expand single feature row into a sequence of length 16 by small variation jitter
                seq = np.tile(feat_arr, (16, 1))
            else:
                seq = feat_arr

            # Normalize features via FeatureSchemaV8
            normalized_seq = self.schema.normalize_window(seq)
            tensor_in = torch.tensor(normalized_seq, dtype=torch.float32).unsqueeze(0) # (1, seq, 12)

            self.model.eval()
            with torch.no_grad():
                logits = self.model(tensor_in)
                probs = torch.softmax(logits, dim=1).squeeze(0).numpy()

            # Class mapping: 0 -> HOLD, 1 -> LONG, 2 -> SHORT
            prob_hold, prob_long, prob_short = float(probs[0]), float(probs[1]), float(probs[2])
            
            direction = "HOLD"
            confidence = max(prob_long, prob_short, prob_hold)

            if prob_long > 0.42 and prob_long > prob_short:
                direction = "LONG"
            elif prob_short > 0.42 and prob_short > prob_long:
                direction = "SHORT"

            result = {
                "direction": direction,
                "confidence": round(confidence, 4),
                "probability": round(max(prob_long, prob_short), 4),
                "probs": {
                    "LONG": round(prob_long, 4),
                    "SHORT": round(prob_short, 4),
                    "HOLD": round(prob_hold, 4)
                },
                "checkpoint_loaded": self.checkpoint_loaded
            }
            self.last_inference = result
            return result
        except Exception as e:
            print(f"[LSTM] Inference error: {e}")
            return {
                "direction": "HOLD",
                "confidence": 0.5,
                "probability": 0.5,
                "probs": {"LONG": 0.33, "SHORT": 0.33, "HOLD": 0.34},
                "error": str(e)
            }
