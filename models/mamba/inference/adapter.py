"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Mamba Inference Adapter
  Integration with AALGO TypeScript server
═══════════════════════════════════════════════════════════════════════════════
"""

import json
import torch
import numpy as np
from typing import Dict, Optional, List
from pathlib import Path
from ..types import MambaConfig, DataBatch, ModelOutput, ForecastingMode
from ..pure_mamba.model import FinancialMambaModel


class MambaInferenceAdapter:
    """
    Adapter for running Mamba predictions as a microservice.
    Compatible with existing dlModelService.ts interface.
    """
    
    def __init__(
        self,
        model_path: str,
        config: Optional[MambaConfig] = None,
        device: str = "cuda" if torch.cuda.is_available() else "cpu",
    ):
        """
        Initialize adapter.
        
        Args:
            model_path: Path to saved checkpoint
            config: Model config (loaded from checkpoint if not provided)
            device: torch device
        """
        self.device = device
        self.model_path = Path(model_path)
        
        # Load checkpoint
        if not self.model_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {model_path}")
        
        try:
            checkpoint = torch.load(model_path, map_location=device, weights_only=False)
        except TypeError:
            checkpoint = torch.load(model_path, map_location=device)
        
        # Load or use provided config
        if config is None:
            if "config" in checkpoint:
                config_dict = checkpoint["config"]
                config = MambaConfig(**config_dict)
            else:
                config = MambaConfig()
        
        self.config = config
        
        # Create and load model
        self.model = FinancialMambaModel(config)
        
        if "model_state_dict" in checkpoint:
            self.model.load_state_dict(checkpoint["model_state_dict"])
        else:
            self.model.load_state_dict(checkpoint)
        
        self.model = self.model.to(device)
        self.model.eval()
        
        print(f"✓ Loaded Mamba model from {model_path}")
        print(f"  Parameters: {self.model.count_parameters():,}")
        print(f"  Device: {device}")
        print(f"  Mode: {config.forecasting_mode.value}")
    
    def predict(self, window: List[List[float]]) -> Dict[str, float]:
        """
        Make prediction from sequence window.
        
        Input format (compatible with dlModelService.ts):
        {
            "window": [
                [o1, h1, l1, c1, v1, ...52 features...],
                [o2, h2, l2, c2, v2, ...],
                ...
                [on, hn, ln, cn, vn, ...]
            ]
        }
        
        Returns (compatible with DLPrediction):
        {
            "directionScore": 0.65,
            "predictedMove": 0.012,
            "confidence": 0.78,
            "attentionWeights": [...],
            "modelName": "mamba-v1"
        }
        """
        try:
            # Convert to tensor
            x = torch.tensor(window, dtype=torch.float32, device=self.device)  # (seq_len, features)
            
            if x.ndim == 2:
                x = x.unsqueeze(0)  # (1, seq_len, features)
            
            # Create batch
            batch = DataBatch(prices=x)
            
            # Predict
            with torch.no_grad():
                output = self.model(batch, return_attention=False)
            
            # Extract predictions for 1-candle horizon (index 0)
            direction_logits = output.direction_logits[0, 0, :]  # (2,) or (3,)
            returns_pred = output.returns_pred[0, 0, 0].item()
            confidence = output.confidence[0, 0, 0].item()
            
            # Convert direction logits to probability
            if len(direction_logits) == 2:
                # Binary: LONG vs SHORT
                probs = torch.softmax(direction_logits, dim=0)
                prob_long = float(probs[0].item())
                prob_short = float(probs[1].item())
                prob_hold = 0.0
                direction_score = prob_long  # P(LONG)
                direction = "LONG" if prob_long > 0.55 else ("SHORT" if prob_short > 0.55 else "HOLD")
            else:
                # 3-class: LONG, SHORT, SIDEWAYS
                probs = torch.softmax(direction_logits, dim=0)
                prob_long = float(probs[0].item())
                prob_short = float(probs[1].item())
                prob_hold = float(probs[2].item())
                direction_score = prob_long - prob_short + 0.5  # Normalize to [0, 1]
                direction_score = max(0.0, min(1.0, direction_score))
                if prob_long > prob_short and prob_long > prob_hold:
                    direction = "LONG"
                elif prob_short > prob_long and prob_short > prob_hold:
                    direction = "SHORT"
                else:
                    direction = "HOLD"
            
            return {
                "direction": direction,
                "probLong": float(prob_long),
                "probShort": float(prob_short),
                "probHold": float(prob_hold),
                "directionScore": float(direction_score),
                "predictedMove": float(returns_pred),
                "confidence": float(confidence),
                "attentionWeights": None,
                "modelName": "mamba-v1",
            }
        
        except Exception as e:
            print(f"✗ Prediction error: {e}")
            # Return neutral stub on error
            return {
                "direction": "HOLD",
                "probLong": 0.3333,
                "probShort": 0.3333,
                "probHold": 0.3334,
                "directionScore": 0.5,
                "predictedMove": 0.0,
                "confidence": 0.0,
                "attentionWeights": None,
                "modelName": "mamba-v1-error",
                "error": str(e)
            }
    
    def predict_multi_horizon(self, window: List[List[float]]) -> Dict[int, Dict]:
        """
        Make predictions for all supported horizons.
        
        Returns:
        {
            1: {"direction": 0.65, "magnitude": 0.012, "confidence": 0.78},
            3: {"direction": 0.62, "magnitude": 0.035, "confidence": 0.71},
            ...
        }
        """
        try:
            x = torch.tensor(window, dtype=torch.float32, device=self.device)
            if x.ndim == 2:
                x = x.unsqueeze(0)
            
            batch = DataBatch(prices=x)
            
            with torch.no_grad():
                output = self.model(batch)
            
            results = {}
            for i, horizon in enumerate(self.config.supported_horizons):
                direction_logits = output.direction_logits[0, i, :]
                probs = torch.softmax(direction_logits, dim=0)
                direction_score = probs[0].item()  # P(LONG)
                
                magnitude = output.returns_pred[0, i, 0].item()
                confidence = output.confidence[0, i, 0].item()
                
                results[horizon.value] = {
                    "direction": float(direction_score),
                    "magnitude": float(magnitude),
                    "confidence": float(confidence),
                }
            
            return results
        
        except Exception as e:
            print(f"✗ Multi-horizon prediction error: {e}")
            return {}
    
    def get_embeddings(self, window: List[List[float]]) -> np.ndarray:
        """
        Get model embeddings (hidden states) for analysis.
        
        Returns: (seq_len, d_model)
        """
        try:
            x = torch.tensor(window, dtype=torch.float32, device=self.device)
            if x.ndim == 2:
                x = x.unsqueeze(0)
            
            batch = DataBatch(prices=x)
            
            with torch.no_grad():
                embeddings = self.model.encode(batch)
            
            return embeddings[0].cpu().numpy()  # (seq_len, d_model)
        
        except Exception as e:
            print(f"✗ Embedding error: {e}")
            return np.array([])
    
    def health_check(self) -> Dict[str, any]:
        """
        Health check for the adapter.
        
        Returns:
        {
            "status": "healthy" | "degraded" | "error",
            "model_loaded": true,
            "device": "cuda" | "cpu",
            "parameters": 12345,
            "memory_mb": 250.5
        }
        """
        try:
            # Test prediction with dummy data
            dummy = torch.randn(1, 60, self.config.n_features, device=self.device)
            batch = DataBatch(prices=dummy)
            
            with torch.no_grad():
                output = self.model(batch)
            
            # Estimate memory (rough)
            total_params = self.model.count_parameters()
            memory_mb = (total_params * 4) / (1024 ** 2)
            
            return {
                "status": "healthy",
                "model_loaded": True,
                "device": self.device,
                "parameters": total_params,
                "memory_mb": float(memory_mb),
                "config": {
                    "d_model": self.config.d_model,
                    "n_layers": self.config.n_layers,
                    "seq_len": self.config.seq_len,
                    "mode": self.config.forecasting_mode.value,
                }
            }
        
        except Exception as e:
            return {
                "status": "error",
                "model_loaded": False,
                "device": self.device,
                "error": str(e),
            }


class MambaService:
    """
    Standalone service wrapper for Flask/FastAPI integration.
    """
    
    def __init__(self, model_path: str, config: Optional[MambaConfig] = None):
        self.adapter = MambaInferenceAdapter(model_path, config)
    
    def predict(self, request_data: Dict) -> Dict:
        """
        HTTP-compatible prediction endpoint.
        
        Request: {"window": [[...], [...], ...]}
        Response: DLPrediction JSON
        """
        if "window" not in request_data:
            return {"error": "Missing 'window' in request"}
        
        window = request_data["window"]
        return self.adapter.predict(window)
    
    def health(self) -> Dict:
        """Health check endpoint."""
        return self.adapter.health_check()


# Example usage for testing
if __name__ == "__main__":
    # Create dummy config
    config = MambaConfig(
        d_model=384,
        n_layers=8,
        seq_len=240,
        forecasting_mode=ForecastingMode.MULTI_TASK,
    )
    
    # Create dummy model (for testing)
    model = FinancialMambaModel(config)
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {k: v for k, v in config.__dict__.items() 
                  if k not in ['dtype', 'device']},
    }, "/tmp/mamba_test.pt")
    
    # Load via adapter
    adapter = MambaInferenceAdapter("/tmp/mamba_test.pt")
    
    # Test prediction
    dummy_window = [[0.5] * 52 for _ in range(240)]
    result = adapter.predict(dummy_window)
    print(f"Prediction: {result}")
    
    # Health check
    health = adapter.health_check()
    print(f"Health: {health}")
