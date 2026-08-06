"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Custom Trading Loss Functions
  Optimizes for trading metrics: directional accuracy, profitability, risk
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional


class DirectionalLoss(nn.Module):
    """
    Cross-entropy loss with trading-specific weighting.
    Rewards correct direction predictions, penalizes wrong direction.
    """
    
    def __init__(self, reduction: str = "mean"):
        super().__init__()
        self.reduction = reduction
    
    def forward(
        self,
        predictions: torch.Tensor,  # (batch, horizons, 2) logits
        targets: torch.Tensor        # (batch, horizons) 0/1
    ) -> torch.Tensor:
        """
        predictions: logits for LONG (0) vs SHORT (1)
        targets: ground truth direction (0 = LONG, 1 = SHORT)
        """
        return F.cross_entropy(predictions, targets, reduction=self.reduction)


class QuantileLoss(nn.Module):
    """
    Quantile loss for predicting confidence intervals.
    Useful for risk-adjusted predictions.
    
    Loss = (q - 1) * max(0, y - pred) + q * max(0, pred - y)
    """
    
    def __init__(self, q: float = 0.5):  # 0.5 = median regression
        super().__init__()
        assert 0 < q < 1, "Quantile must be in (0, 1)"
        self.q = q
    
    def forward(self, predictions: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        predictions: (batch, horizons, 1)
        targets: (batch, horizons, 1)
        """
        error = targets - predictions
        return torch.mean(
            torch.where(
                error >= 0,
                self.q * error,
                (self.q - 1) * error
            )
        )


class HuberLoss(nn.Module):
    """
    Huber loss for robust regression.
    Less sensitive to outliers than MSE.
    
    L = 0.5 * x^2 if |x| <= delta
      = delta * (|x| - 0.5 * delta) otherwise
    """
    
    def __init__(self, delta: float = 1.0):
        super().__init__()
        self.delta = delta
    
    def forward(self, predictions: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        predictions, targets: (batch, horizons, 1)
        """
        error = torch.abs(predictions - targets)
        quadratic = torch.minimum(error, torch.full_like(error, self.delta))
        linear = error - quadratic
        return torch.mean(0.5 * quadratic ** 2 + self.delta * linear)


class ProfitableTradingLoss(nn.Module):
    """
    Custom loss optimized for trading profitability.
    Rewards:
    - Correct direction
    - Magnitude estimation accuracy
    - Confidence calibration
    
    Penalizes:
    - Wrong direction (worse than no prediction)
    - Overconfident wrong predictions
    - Large estimation errors
    """
    
    def __init__(
        self,
        direction_weight: float = 0.5,
        magnitude_weight: float = 0.3,
        confidence_weight: float = 0.2,
        wrong_direction_penalty: float = 2.0
    ):
        super().__init__()
        self.direction_weight = direction_weight
        self.magnitude_weight = magnitude_weight
        self.confidence_weight = confidence_weight
        self.wrong_direction_penalty = wrong_direction_penalty
    
    def forward(
        self,
        direction_logits: torch.Tensor,      # (batch, horizons, 2)
        magnitude_pred: torch.Tensor,         # (batch, horizons, 1)
        confidence_pred: torch.Tensor,        # (batch, horizons, 1)
        direction_targets: torch.Tensor,      # (batch, horizons)
        magnitude_targets: torch.Tensor,      # (batch, horizons, 1)
    ) -> torch.Tensor:
        """
        Compute trading-aware loss.
        """
        # 1. Directional loss
        direction_loss = F.cross_entropy(direction_logits, direction_targets)
        
        # Get predicted direction (argmax)
        pred_direction = torch.argmax(direction_logits, dim=-1)
        direction_correct = (pred_direction == direction_targets).float()
        
        # Wrong direction penalty: 2x loss for incorrect predictions
        direction_penalty = (1 - direction_correct) * self.wrong_direction_penalty
        direction_loss = direction_loss * (1 + direction_penalty.mean())
        
        # 2. Magnitude loss (only penalize if direction is correct)
        magnitude_loss = F.smooth_l1_loss(magnitude_pred, magnitude_targets, reduction="none")
        magnitude_loss = magnitude_loss * direction_correct.unsqueeze(-1)  # Zero out wrong direction
        magnitude_loss = magnitude_loss.mean()
        
        # 3. Confidence loss (calibration)
        # Penalize overconfidence when wrong
        confidence_targets = direction_correct.unsqueeze(-1)
        confidence_loss = F.binary_cross_entropy(
            torch.sigmoid(confidence_pred),
            confidence_targets,
            reduction="mean"
        )
        
        # Total loss
        total_loss = (
            self.direction_weight * direction_loss +
            self.magnitude_weight * magnitude_loss +
            self.confidence_weight * confidence_loss
        )
        
        return total_loss


class SharpeRatioLoss(nn.Module):
    """
    Loss based on Sharpe ratio of predicted returns.
    Encourages predictions that lead to high Sharpe ratio strategies.
    
    Sharpe = mean(returns) / std(returns)
    """
    
    def __init__(self, risk_free_rate: float = 0.0):
        super().__init__()
        self.risk_free_rate = risk_free_rate
    
    def forward(
        self,
        predictions: torch.Tensor,  # (batch, horizons, 1) - predicted returns
        actuals: torch.Tensor        # (batch, horizons, 1) - actual returns
    ) -> torch.Tensor:
        """
        Minimize: -(Sharpe ratio), i.e., maximize Sharpe ratio
        """
        # Compute actual strategy returns: prediction * actual
        strategy_returns = predictions * actuals
        
        # Compute mean and std per batch
        mean_return = torch.mean(strategy_returns, dim=1, keepdim=True)
        std_return = torch.std(strategy_returns, dim=1, keepdim=True) + 1e-8
        
        # Sharpe ratio
        sharpe = (mean_return - self.risk_free_rate) / std_return
        
        # Loss: negative Sharpe (we want to maximize)
        loss = -sharpe.mean()
        
        return loss


class ProfitFactorLoss(nn.Module):
    """
    Loss based on Profit Factor = sum(wins) / sum(losses).
    Higher profit factor = better strategy.
    """
    
    def __init__(self, min_profit_factor: float = 1.5):
        super().__init__()
        self.min_profit_factor = min_profit_factor
    
    def forward(
        self,
        predictions: torch.Tensor,  # (batch, horizons, 1)
        actuals: torch.Tensor        # (batch, horizons, 1)
    ) -> torch.Tensor:
        """
        Minimize: -(Profit Factor)
        """
        # Strategy returns
        strategy_returns = predictions * actuals
        
        # Wins and losses
        wins = torch.clamp(strategy_returns, min=0)
        losses = torch.clamp(-strategy_returns, min=0)
        
        # Profit factor
        total_wins = torch.sum(wins, dim=1)
        total_losses = torch.sum(losses, dim=1) + 1e-8
        profit_factor = total_wins / total_losses
        
        # Loss: penalize if profit factor < target
        loss = F.relu(self.min_profit_factor - profit_factor).mean()
        
        return loss


class DrawdownAwareLoss(nn.Module):
    """
    Loss that penalizes strategies with large drawdowns.
    Encourages smoother, less volatile strategies.
    """
    
    def __init__(self, max_drawdown_pct: float = 0.15):
        super().__init__()
        self.max_drawdown_pct = max_drawdown_pct
    
    def forward(self, predictions: torch.Tensor, actuals: torch.Tensor) -> torch.Tensor:
        """
        predictions, actuals: (batch, horizons, 1)
        """
        # Cumulative returns
        returns = predictions * actuals
        cum_returns = torch.cumprod(1 + returns, dim=1)
        
        # Running max
        running_max, _ = torch.max(cum_returns, dim=1, keepdim=True)
        
        # Drawdown at each point
        drawdown = (cum_returns - running_max) / running_max
        max_drawdown = torch.min(drawdown, dim=1)[0]  # Most negative value
        
        # Penalize if max drawdown exceeds threshold
        drawdown_loss = F.relu(-max_drawdown - self.max_drawdown_pct).mean()
        
        return drawdown_loss


class DirectionalAccuracyLoss(nn.Module):
    """
    Loss optimized for directional accuracy.
    Useful as a standalone loss or combined with others.
    """
    
    def __init__(self, focal_gamma: float = 2.0):
        super().__init__()
        self.focal_gamma = focal_gamma
    
    def forward(
        self,
        logits: torch.Tensor,   # (batch, horizons, 2)
        targets: torch.Tensor    # (batch, horizons)
    ) -> torch.Tensor:
        """
        Focal loss for directional prediction.
        Focuses on hard examples.
        """
        # Cross entropy
        ce_loss = F.cross_entropy(logits, targets, reduction="none")
        
        # Probability of correct class
        p = torch.softmax(logits, dim=-1)
        p_correct = p.gather(-1, targets.unsqueeze(-1)).squeeze(-1)
        
        # Focal loss: CE * (1 - p)^gamma
        focal_weight = (1 - p_correct) ** self.focal_gamma
        focal_loss = (focal_weight * ce_loss).mean()
        
        return focal_loss


class CombinedTradingLoss(nn.Module):
    """
    Combines multiple trading objectives:
    - Direction accuracy
    - Return magnitude
    - Sharpe ratio
    - Drawdown control
    """
    
    def __init__(
        self,
        direction_weight: float = 0.4,
        magnitude_weight: float = 0.3,
        sharpe_weight: float = 0.2,
        drawdown_weight: float = 0.1,
    ):
        super().__init__()
        self.direction_weight = direction_weight
        self.magnitude_weight = magnitude_weight
        self.sharpe_weight = sharpe_weight
        self.drawdown_weight = drawdown_weight
        
        self.direction_loss = DirectionalAccuracyLoss()
        self.magnitude_loss = nn.SmoothL1Loss()
        self.sharpe_loss = SharpeRatioLoss()
        self.drawdown_loss = DrawdownAwareLoss()
    
    def forward(
        self,
        direction_logits: torch.Tensor,
        magnitude_pred: torch.Tensor,
        direction_targets: torch.Tensor,
        magnitude_targets: torch.Tensor,
        actual_returns: torch.Tensor,
    ) -> torch.Tensor:
        """
        Compute combined loss.
        """
        loss = (
            self.direction_weight * self.direction_loss(direction_logits, direction_targets) +
            self.magnitude_weight * self.magnitude_loss(magnitude_pred, magnitude_targets) +
            self.sharpe_weight * self.sharpe_loss(magnitude_pred, actual_returns) +
            self.drawdown_weight * self.drawdown_loss(magnitude_pred, actual_returns)
        )
        
        return loss
