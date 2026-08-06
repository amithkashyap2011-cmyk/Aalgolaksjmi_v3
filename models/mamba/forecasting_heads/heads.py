"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Forecasting Heads
  Multi-horizon, multi-task prediction heads
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple


class PriceHead(nn.Module):
    """
    Predicts future close prices across multiple horizons.
    Outputs absolute price predictions.
    """
    
    def __init__(
        self,
        d_model: int,
        n_horizons: int = 6,
        hidden_dim: Optional[int] = None,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.n_horizons = n_horizons
        hidden_dim = hidden_dim or d_model * 2
        
        self.mlp = nn.Sequential(
            nn.Linear(d_model, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Per-horizon price predictions
        self.price_projections = nn.ModuleList([
            nn.Linear(hidden_dim // 2, 1)
            for _ in range(n_horizons)
        ])
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        Returns: (batch_size, n_horizons, 1)
        """
        if x.ndim == 3:
            # Take last timestep
            x = x[:, -1, :]
        
        # MLP
        hidden = self.mlp(x)  # (batch, hidden_dim // 2)
        
        # Project to horizons
        prices = []
        for proj in self.price_projections:
            price = proj(hidden)  # (batch, 1)
            prices.append(price)
        
        prices = torch.cat(prices, dim=-1).unsqueeze(-1)  # (batch, n_horizons, 1)
        
        return prices


class ReturnHead(nn.Module):
    """
    Predicts percentage returns across multiple horizons.
    Outputs log-returns that are scale-invariant.
    """
    
    def __init__(
        self,
        d_model: int,
        n_horizons: int = 6,
        hidden_dim: Optional[int] = None,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.n_horizons = n_horizons
        hidden_dim = hidden_dim or d_model * 2
        
        self.mlp = nn.Sequential(
            nn.Linear(d_model, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Per-horizon return predictions
        self.return_projections = nn.ModuleList([
            nn.Linear(hidden_dim // 2, 1)
            for _ in range(n_horizons)
        ])
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        Returns: (batch_size, n_horizons, 1) - log returns
        """
        if x.ndim == 3:
            x = x[:, -1, :]
        
        hidden = self.mlp(x)
        
        returns = []
        for proj in self.return_projections:
            ret = proj(hidden)
            # Tanh to bound returns to [-1, 1]
            ret = torch.tanh(ret)
            returns.append(ret)
        
        returns = torch.cat(returns, dim=-1).unsqueeze(-1)  # (batch, n_horizons, 1)
        
        return returns


class DirectionHead(nn.Module):
    """
    Predicts market direction (LONG/SHORT/SIDEWAYS) across multiple horizons.
    Outputs logits for classification.
    """
    
    def __init__(
        self,
        d_model: int,
        n_horizons: int = 6,
        n_classes: int = 3,  # LONG, SHORT, SIDEWAYS
        hidden_dim: Optional[int] = None,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.n_horizons = n_horizons
        self.n_classes = n_classes
        hidden_dim = hidden_dim or d_model * 2
        
        self.mlp = nn.Sequential(
            nn.Linear(d_model, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Per-horizon direction predictions
        self.direction_projections = nn.ModuleList([
            nn.Linear(hidden_dim // 2, n_classes)
            for _ in range(n_horizons)
        ])
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        Returns: (batch_size, n_horizons, n_classes) - logits
        """
        if x.ndim == 3:
            x = x[:, -1, :]
        
        hidden = self.mlp(x)
        
        logits = []
        for proj in self.direction_projections:
            logit = proj(hidden)  # (batch, n_classes)
            logits.append(logit)
        
        logits = torch.stack(logits, dim=1)  # (batch, n_horizons, n_classes)
        
        return logits


class VolatilityHead(nn.Module):
    """
    Predicts future volatility (standard deviation of returns).
    Useful for risk management and sizing.
    """
    
    def __init__(
        self,
        d_model: int,
        n_horizons: int = 6,
        hidden_dim: Optional[int] = None,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.n_horizons = n_horizons
        hidden_dim = hidden_dim or d_model * 2
        
        self.mlp = nn.Sequential(
            nn.Linear(d_model, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Per-horizon volatility predictions
        self.vol_projections = nn.ModuleList([
            nn.Linear(hidden_dim // 2, 1)
            for _ in range(n_horizons)
        ])
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        Returns: (batch_size, n_horizons, 1) - volatility (std)
        """
        if x.ndim == 3:
            x = x[:, -1, :]
        
        hidden = self.mlp(x)
        
        vols = []
        for proj in self.vol_projections:
            vol = proj(hidden)
            # Softplus to ensure positive
            vol = F.softplus(vol)
            vols.append(vol)
        
        vols = torch.cat(vols, dim=-1).unsqueeze(-1)  # (batch, n_horizons, 1)
        
        return vols


class ConfidenceHead(nn.Module):
    """
    Predicts model confidence in its predictions.
    Useful for adaptive position sizing.
    """
    
    def __init__(
        self,
        d_model: int,
        n_horizons: int = 6,
        hidden_dim: Optional[int] = None,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.n_horizons = n_horizons
        hidden_dim = hidden_dim or d_model * 2
        
        self.mlp = nn.Sequential(
            nn.Linear(d_model, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Per-horizon confidence predictions
        self.conf_projections = nn.ModuleList([
            nn.Linear(hidden_dim // 2, 1)
            for _ in range(n_horizons)
        ])
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        Returns: (batch_size, n_horizons, 1) - confidence [0, 1]
        """
        if x.ndim == 3:
            x = x[:, -1, :]
        
        hidden = self.mlp(x)
        
        confs = []
        for proj in self.conf_projections:
            conf = proj(hidden)
            # Sigmoid to [0, 1]
            conf = torch.sigmoid(conf)
            confs.append(conf)
        
        confs = torch.cat(confs, dim=-1).unsqueeze(-1)  # (batch, n_horizons, 1)
        
        return confs


class RegressionHead(nn.Module):
    """
    Combined head for regression tasks:
    - Price prediction
    - Return prediction
    - Volatility prediction
    """
    
    def __init__(
        self,
        d_model: int,
        n_horizons: int = 6,
        hidden_dim: Optional[int] = None,
        dropout: float = 0.1
    ):
        super().__init__()
        self.price_head = PriceHead(d_model, n_horizons, hidden_dim, dropout)
        self.return_head = ReturnHead(d_model, n_horizons, hidden_dim, dropout)
        self.vol_head = VolatilityHead(d_model, n_horizons, hidden_dim, dropout)
        self.confidence_head = ConfidenceHead(d_model, n_horizons, hidden_dim, dropout)
    
    def forward(self, x: torch.Tensor) -> Dict[str, torch.Tensor]:
        """
        x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        Returns: dict with keys: price, returns, volatility, confidence
        """
        return {
            "price": self.price_head(x),
            "returns": self.return_head(x),
            "volatility": self.vol_head(x),
            "confidence": self.confidence_head(x),
        }


class ClassificationHead(nn.Module):
    """
    Classification head for direction prediction.
    Outputs probability distributions over directions.
    """
    
    def __init__(
        self,
        d_model: int,
        n_horizons: int = 6,
        n_classes: int = 3,
        hidden_dim: Optional[int] = None,
        dropout: float = 0.1
    ):
        super().__init__()
        self.direction_head = DirectionHead(d_model, n_horizons, n_classes, hidden_dim, dropout)
        self.confidence_head = ConfidenceHead(d_model, n_horizons, hidden_dim, dropout)
    
    def forward(self, x: torch.Tensor) -> Dict[str, torch.Tensor]:
        """
        x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        Returns: dict with keys: logits, probabilities, confidence
        """
        logits = self.direction_head(x)  # (batch, n_horizons, n_classes)
        probs = F.softmax(logits, dim=-1)
        conf = self.confidence_head(x)  # (batch, n_horizons, 1)
        
        return {
            "logits": logits,
            "probabilities": probs,
            "confidence": conf,
        }


class MultiTaskHead(nn.Module):
    """
    Multi-task learning head that predicts simultaneously:
    - Direction
    - Return magnitude
    - Volatility
    - Confidence
    """
    
    def __init__(
        self,
        d_model: int,
        n_horizons: int = 6,
        hidden_dim: Optional[int] = None,
        dropout: float = 0.1,
        n_classes: int = 3
    ):
        super().__init__()
        self.n_horizons = n_horizons
        
        # Shared backbone
        hidden_dim = hidden_dim or d_model * 2
        self.backbone = nn.Sequential(
            nn.Linear(d_model, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Task-specific heads
        self.direction_head = DirectionHead(hidden_dim, n_horizons, n_classes, hidden_dim, dropout)
        self.return_head = ReturnHead(hidden_dim, n_horizons, hidden_dim, dropout)
        self.vol_head = VolatilityHead(hidden_dim, n_horizons, hidden_dim, dropout)
        self.confidence_head = ConfidenceHead(hidden_dim, n_horizons, hidden_dim, dropout)
    
    def forward(self, x: torch.Tensor) -> Dict[str, torch.Tensor]:
        """
        x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        Returns: dict with keys: direction_logits, returns, volatility, confidence
        """
        if x.ndim == 3:
            x = x[:, -1, :]
        
        # Shared backbone
        features = self.backbone(x)  # (batch, hidden_dim)
        
        # Task predictions
        direction_logits = self.direction_head(features)
        returns = self.return_head(features)
        volatility = self.vol_head(features)
        confidence = self.confidence_head(features)
        
        return {
            "direction_logits": direction_logits,
            "direction_probs": F.softmax(direction_logits, dim=-1),
            "returns": returns,
            "volatility": volatility,
            "confidence": confidence,
        }
