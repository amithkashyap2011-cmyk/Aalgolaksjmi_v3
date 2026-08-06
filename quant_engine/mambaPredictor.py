"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Mamba Predictor (Track A)
  Research Component for AQEA v2.0
═══════════════════════════════════════════════════════════════════════════════
"""

import sys
import os
import numpy as np
import torch
from pathlib import Path

# Add project root to path to allow importing from models.mamba
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from models.mamba.inference.adapter import MambaInferenceAdapter
from models.mamba.types import MambaConfig, ForecastingMode

class MambaPredictor:
    """
    Track A: Mamba State Space Model Predictor.
    Supports long-context (256-1024 bars) inference.
    """
    
    def __init__(self, model_path=None):
        self.checkpoint_loaded = False
        self.last_inference = None
        self.compatibility_report = None
        self.degraded_reason = None

        if model_path is None:
            model_path = PROJECT_ROOT / "models" / "mamba" / "checkpoints" / "mamba-research-v1.pt"
        else:
            model_path = Path(model_path)

        print(f"[Mamba] Initializing with checkpoint: {model_path}")

        try:
            if not model_path.exists():
                self.degraded_reason = "Checkpoint missing"
                print(f"[Mamba] WARNING: Checkpoint missing at {model_path}. Size: N/A. Research model disabled.")
                return
            
            size_mb = model_path.stat().st_size / (1024 * 1024)
            print(f"[Mamba] Found checkpoint. Size: {size_mb:.2f} MB")

            if size_mb < 5.0:
                self.degraded_reason = "stub checkpoint"
                print(f"[Mamba] WARNING: Checkpoint is a stub (< 5MB). Marking as DEGRADED. Inference disabled.")
                return

            # Inspect checkpoint keys for compatibility report
            self._generate_compatibility_report(model_path)
                
            self.adapter = MambaInferenceAdapter(str(model_path))
            self.checkpoint_loaded = True
            print(f"[Mamba] Successfully loaded checkpoint from {model_path}")
        except Exception as e:
            self.degraded_reason = f"Init error: {str(e)}"
            print(f"[Mamba] WARNING: Failed to initialize research model: {e}")
            # Non-blocking for research model

    def _generate_compatibility_report(self, path):
        """
        Inspects checkpoint keys and compares with expected model architecture.
        """
        try:
            checkpoint = torch.load(path, map_location='cpu')
            ck_keys = []
            if isinstance(checkpoint, dict):
                if 'model_state_dict' in checkpoint:
                    ck_keys = list(checkpoint['model_state_dict'].keys())
                else:
                    ck_keys = list(checkpoint.keys())
            
            # Expected patterns for FinancialMambaModel
            expected_patterns = [
                'feature_embedding',
                'pos_embedding',
                'mamba_stack.layers',
                'head'
            ]
            
            found_patterns = [p for p in expected_patterns if any(p in k for k in ck_keys)]
            missing_patterns = [p for p in expected_patterns if p not in found_patterns]
            
            self.compatibility_report = {
                "checkpointPath": str(path),
                "totalKeys": len(ck_keys),
                "foundArchitecturalComponents": found_patterns,
                "missingArchitecturalComponents": missing_patterns,
                "status": "COMPATIBLE" if not missing_patterns else "INCOMPATIBLE",
                "observation": "Checkpoint seems to be a Pure Mamba state_dict without financial embeddings." if 'layers.0.A_log' in ck_keys else "Standard FinancialMamba checkpoint."
            }
            
            print(f"[Mamba] Compatibility Report: {self.compatibility_report['status']}")
            if missing_patterns:
                print(f"[Mamba] Missing components: {missing_patterns}")
            if self.compatibility_report['observation']:
                print(f"[Mamba] Observation: {self.compatibility_report['observation']}")
                
        except Exception as e:
            self.compatibility_report = {"error": str(e)}

    def predict(self, sequence_data):
        """
        Runs inference on a sequence of feature vectors.
        Expected shape: (seq_len, features)
        """
        if not self.checkpoint_loaded:
             print(f"[Mamba] Warning: Inference requested but model is DEGRADED. Returning neutral.")
             return {
                "directionScore": 0.5,
                "predictedMove": 0.0,
                "confidence": 0.0,
                "error": "MODEL_DEGRADED"
            }
        
        # Validation: Check for NaN or Inf
        seq = np.array(sequence_data, dtype=np.float32)
        if not np.isfinite(seq).all():
             print(f"[Mamba] Warning: Invalid sequence data detected")
             return {
                "directionScore": 0.5,
                "predictedMove": 0.0,
                "confidence": 0.0,
                "error": "INVALID_FEATURES"
            }

        result = self.adapter.predict(sequence_data)
        
        self.last_inference = {
            "timestamp": np.datetime64('now').astype(str),
            "confidence": result.get("confidence", 0.0),
            "directionScore": result.get("directionScore", 0.5)
        }
        
        return result

# Global instance for easy integration
mamba_predictor = MambaPredictor()
