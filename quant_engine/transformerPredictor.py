"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Transformer Microstructure Predictor (Track B)
  Research Component for AQEA v2.0
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import numpy as np
import logging
import os
from pathlib import Path
from research.models.transformer_micro import TransformerMicroModel

logger = logging.getLogger("AALGO-TRANSFORMER-MICRO")
PROJECT_ROOT = Path(__file__).resolve().parent.parent

class TransformerPredictor:
    """
    Track B: Transformer Microstructure Model.
    Predicts: Trend Continuation, Trend Exhaustion, Liquidity Traps.
    Inputs: Order Flow, Smart Money, Volume Profile, Liquidations, Funding.
    """

    def __init__(self, model_path=None, input_dim=20, d_model=64, nhead=4, num_layers=3):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = TransformerMicroModel(input_dim=input_dim, d_model=d_model, nhead=nhead, num_layers=num_layers).to(self.device)
        self.checkpoint_loaded = False
        self.last_inference = None

        if model_path is None:
            model_path = PROJECT_ROOT / "models" / "transformer" / "checkpoints" / "transformer_micro_v1.pt"
        else:
            model_path = Path(model_path)

        print(f"[Transformer] Initializing with checkpoint: {model_path}")

        try:
            if not model_path.exists():
                print(f"[Transformer] WARNING: Checkpoint missing at {model_path}. Size: N/A. Research model disabled.")
                return

            size_mb = model_path.stat().st_size / (1024 * 1024)
            print(f"[Transformer] Found checkpoint. Size: {size_mb:.2f} MB")

            self.model.load_state_dict(torch.load(model_path, map_location=self.device))
            self.model.eval()
            self.checkpoint_loaded = True
            print(f"[Transformer] Successfully loaded weights from {model_path}")
        except Exception as e:
            print(f"[Transformer] WARNING: Failed to load research model: {e}")
            # Non-blocking for research model

        # Directions specific to microstructure
        self.outcomes = ["CONTINUATION", "EXHAUSTION", "TRAP"]

    def predict(self, microstructure_data):
        """
        Runs inference on microstructure sequence.
        Expected shape: (seq_len, features)
        """
        if not self.checkpoint_loaded:
            raise RuntimeError("TRANSFORMER_MODEL_NOT_LOADED")

        try:
            seq = np.array(microstructure_data, dtype=np.float32)

            # Validation: Check for NaN or Inf
            if not np.isfinite(seq).all():
                return {
                    "outcome": "UNKNOWN",
                    "confidence": 0.0,
                    "error": "INVALID_FEATURES"
                }

            if len(seq.shape) == 2:
                seq = np.expand_dims(seq, axis=0)

            input_tensor = torch.FloatTensor(seq).to(self.device)

            with torch.no_grad():
                output = self.model(input_tensor)
                probs = torch.softmax(output, dim=1).cpu().numpy()[0]

            idx = np.argmax(probs)
            confidence = float(np.max(probs))

            self.last_inference = {
                "timestamp": np.datetime64('now').astype(str),
                "outcome": self.outcomes[idx],
                "confidence": confidence
            }

            return {
                "outcome": self.outcomes[idx],
                "confidence": confidence,
                "probabilities": {
                    "continuation": float(probs[0]),
                    "exhaustion": float(probs[1]),
                    "trap": float(probs[2])
                },
                "modelName": "transformer-micro-v1"
            }
        except Exception as e:
            logger.error(f"Transformer Micro inference error: {e}")
            return {
                "outcome": "UNKNOWN",
                "confidence": 0.0,
                "error": str(e)
            }

transformer_predictor = TransformerPredictor()
