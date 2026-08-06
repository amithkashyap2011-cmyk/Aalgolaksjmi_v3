"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Financial Normalization Layers
  Handles outliers, flash crashes, and extreme volatility
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Optional, Tuple


class FinancialRobustScaler(nn.Module):
    """
    Robust scaler for financial data that resists outliers and flash crashes.
    Uses IQR (Interquartile Range) method instead of standard deviation.
    
    Formula: (X - median) / IQR
    """
    
    def __init__(self, eps: float = 1e-8):
        super().__init__()
        self.eps = eps
        self.register_buffer("median", torch.tensor(0.0))
        self.register_buffer("iqr", torch.tensor(1.0))
    
    def fit(self, X: torch.Tensor) -> "FinancialRobustScaler":
        """
        Fit scaler on training data.
        X shape: (batch_size, seq_len, features) or (n_samples, features)
        """
        # Flatten to (n_samples, features)
        if X.ndim == 3:
            X_flat = X.reshape(-1, X.shape[-1])
        else:
            X_flat = X
        
        # Compute per-feature median and IQR
        q1 = torch.quantile(X_flat, 0.25, dim=0)
        q3 = torch.quantile(X_flat, 0.75, dim=0)
        median = torch.quantile(X_flat, 0.5, dim=0)
        
        iqr = q3 - q1
        iqr = torch.clamp(iqr, min=self.eps)  # Avoid division by zero
        
        self.register_buffer("median", median)
        self.register_buffer("iqr", iqr)
        
        return self
    
    def forward(self, X: torch.Tensor) -> torch.Tensor:
        """Normalize using robust scaling."""
        return (X - self.median) / (self.iqr + self.eps)
    
    def inverse(self, X: torch.Tensor) -> torch.Tensor:
        """Denormalize."""
        return X * (self.iqr + self.eps) + self.median


class AdaptiveMarketNormalizer(nn.Module):
    """
    Adaptive normalizer that adjusts scaling based on market volatility.
    Scales aggressively during low volatility, conservatively during high volatility.
    """
    
    def __init__(self, eps: float = 1e-8, volatility_window: int = 20):
        super().__init__()
        self.eps = eps
        self.volatility_window = volatility_window
        self.scaler = FinancialRobustScaler(eps=eps)
    
    def compute_volatility(self, prices: torch.Tensor) -> torch.Tensor:
        """
        Compute volatility (standard deviation of returns) over window.
        prices: (batch_size, seq_len, 1) or (..., 1)
        Returns: volatility scalar
        """
        if prices.shape[-1] != 1:
            prices = prices[..., :1]  # Take close price only
        
        # Compute returns
        returns = torch.diff(torch.log(prices + self.eps), dim=-2)
        
        # Compute rolling volatility (std of returns)
        vol = torch.std(returns, dim=-2, keepdim=True)
        vol = torch.clamp(vol, min=self.eps)
        
        return vol
    
    def forward(
        self,
        X: torch.Tensor,
        prices: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Normalize adaptively based on volatility.
        
        Args:
            X: Input features (..., features)
            prices: Optional price data to compute volatility
        
        Returns:
            Normalized features
        """
        # Base robust scaling
        X_normalized = self.scaler(X)
        
        # If prices provided, apply volatility-aware damping
        if prices is not None:
            vol = self.compute_volatility(prices)
            
            # Volatility damping factor: compress scaling during high vol
            # vol_factor = 1 / (1 + vol) -> ranges 0 to 1
            vol_factor = 1.0 / (1.0 + vol)
            
            # Apply damping: reduce extreme values during high volatility
            X_normalized = X_normalized * (0.5 + 0.5 * vol_factor)
        
        return X_normalized


class VolatilityAwareNormalizer(nn.Module):
    """
    Normalizer that explicitly models volatility regimes.
    Separates trend from volatility, normalizing each independently.
    """
    
    def __init__(self, eps: float = 1e-8):
        super().__init__()
        self.eps = eps
        self.trend_scaler = FinancialRobustScaler(eps=eps)
        self.vol_scaler = FinancialRobustScaler(eps=eps)
    
    def decompose_trend_volatility(
        self,
        prices: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Decompose price series into trend and volatility.
        
        Returns:
            trend: Detrended prices
            volatility: Volatility estimate
        """
        # Compute returns
        returns = torch.diff(torch.log(prices + self.eps), dim=-2)
        
        # Trend: MA of prices
        kernel_size = 5
        trend = torch.nn.functional.avg_pool1d(
            prices.transpose(-2, -1),
            kernel_size=kernel_size,
            stride=1,
            padding=kernel_size // 2
        ).transpose(-2, -1)
        
        # Volatility: rolling std of returns
        vol_sq = torch.pow(returns, 2)
        vol = torch.sqrt(
            torch.nn.functional.avg_pool1d(
                vol_sq.transpose(-2, -1),
                kernel_size=10,
                stride=1,
                padding=5
            ).transpose(-2, -1) + self.eps
        )
        
        return trend, vol
    
    def forward(self, X: torch.Tensor, prices: Optional[torch.Tensor] = None) -> torch.Tensor:
        """
        Normalize with volatility decomposition.
        """
        if prices is None:
            # Fallback to simple robust scaling
            return self.trend_scaler(X)
        
        # Decompose
        trend, volatility = self.decompose_trend_volatility(prices)
        
        # Normalize components
        X_trend_norm = self.trend_scaler(trend)
        X_vol_norm = self.vol_scaler(volatility)
        
        # Combine: normalized trend + volatility signal
        # Normalize volatility to [0, 1] range
        vol_normalized = torch.clamp(X_vol_norm, 0, 1)
        
        # Blend: trend dominates, but volatility provides additional signal
        X_normalized = X_trend_norm + 0.1 * vol_normalized
        
        return X_normalized


class OutlierDetector(nn.Module):
    """
    Detects and dampens outliers (flash crashes, pump-and-dumps).
    Uses modified Z-score method resistant to outliers.
    """
    
    def __init__(self, threshold: float = 3.5, eps: float = 1e-8):
        super().__init__()
        self.threshold = threshold  # Modified Z-score threshold
        self.eps = eps
    
    def forward(self, X: torch.Tensor, dampening: bool = True) -> torch.Tensor:
        """
        Detect and optionally dampen outliers.
        
        Args:
            X: Input tensor
            dampening: If True, dampen outliers instead of masking
        
        Returns:
            Tensor with detected/dampened outliers
        """
        # Flatten for computation
        shape = X.shape
        X_flat = X.reshape(-1, X.shape[-1])
        
        # Compute median and MAD (Median Absolute Deviation)
        median = torch.median(X_flat, dim=0)[0]
        mad = torch.median(torch.abs(X_flat - median), dim=0)[0]
        
        # Modified Z-score
        z_scores = 0.6745 * (X_flat - median) / (mad + self.eps)
        
        # Detect outliers
        outlier_mask = torch.abs(z_scores) > self.threshold
        
        if dampening:
            # Dampen outliers: clip to ±threshold
            z_scores = torch.clamp(z_scores, -self.threshold, self.threshold)
            X_flat = (z_scores / 0.6745) * (mad + self.eps) + median
        else:
            # Replace with median
            X_flat[outlier_mask] = median.expand_as(X_flat)[outlier_mask]
        
        return X_flat.reshape(shape)


class FlashCrashDetector(nn.Module):
    """
    Detects flash crash events (sudden large moves followed by recovery).
    Returns crash indicator and recovery estimate.
    """
    
    def __init__(
        self,
        move_threshold: float = 0.05,  # 5% move
        recovery_window: int = 5,       # Check recovery within 5 candles
        eps: float = 1e-8
    ):
        super().__init__()
        self.move_threshold = move_threshold
        self.recovery_window = recovery_window
        self.eps = eps
    
    def forward(self, prices: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Detect flash crashes.
        
        Args:
            prices: (batch_size, seq_len, 1) or (..., seq_len, 1)
        
        Returns:
            crash_mask: Boolean mask of crash candles
            recovery_est: Estimated recovery price
        """
        # Compute returns
        log_returns = torch.diff(torch.log(prices + self.eps), dim=-2)
        
        # Detect large moves
        large_move_mask = torch.abs(log_returns) > self.move_threshold
        
        # Check if followed by partial recovery (mean reversion)
        crash_mask = torch.zeros_like(large_move_mask)
        recovery_est = torch.zeros_like(prices)
        
        for i in range(large_move_mask.shape[-2] - self.recovery_window):
            if large_move_mask[..., i, :].any():
                # Found a large move, check next window
                future_moves = log_returns[..., i+1:i+1+self.recovery_window, :]
                
                # Crash if followed by opposite moves (recovery)
                mean_future_move = torch.mean(future_moves, dim=-2, keepdim=True)
                if torch.sign(mean_future_move) == -torch.sign(log_returns[..., i:i+1, :]):
                    crash_mask[..., i, :] = True
                    # Estimate recovery price
                    recovery_est[..., i, :] = prices[..., i + self.recovery_window, :]
        
        return crash_mask, recovery_est


class MarketMicrostructureNormalizer(nn.Module):
    """
    Normalizes features for market microstructure:
    - Bid-ask spread
    - Order flow imbalance
    - Market impact
    """
    
    def __init__(self, eps: float = 1e-8):
        super().__init__()
        self.eps = eps
        self.scaler = FinancialRobustScaler(eps=eps)
    
    def forward(
        self,
        bid_ask: torch.Tensor,
        order_imbalance: torch.Tensor,
        volumes: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Normalize microstructure features.
        
        Returns:
            normalized_spread
            normalized_imbalance
            normalized_impact
        """
        # Normalize spread
        spread_norm = self.scaler(bid_ask)
        
        # Normalize imbalance (already bounded [-1, 1], but apply scaler anyway)
        imbalance_norm = order_imbalance  # Keep as-is, already normalized
        
        # Market impact: spread * volume
        market_impact = bid_ask * volumes
        impact_norm = self.scaler(market_impact)
        
        return spread_norm, imbalance_norm, impact_norm
