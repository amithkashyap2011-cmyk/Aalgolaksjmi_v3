"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Mamba-Based Forecasting Models
  Core Type Definitions & Constants
═══════════════════════════════════════════════════════════════════════════════
"""

from dataclasses import dataclass, field
from typing import Literal, Optional, Dict, List, Tuple, Any
from enum import Enum
import torch
import numpy as np


class ForecastingMode(Enum):
    """Forecasting task modes."""
    REGRESSION = "regression"          # Predict future close/return/volatility
    CLASSIFICATION = "classification"  # Predict LONG/SHORT/SIDEWAYS
    MULTI_TASK = "multi_task"         # Multi-task learning (direction + magnitude + confidence)


class ForecastHorizon(Enum):
    """Supported forecast horizons (in candles)."""
    H1 = 1
    H3 = 3
    H5 = 5
    H10 = 10
    H20 = 20
    H50 = 50


class MarketRegime(Enum):
    """Market regimes for regime-aware modeling."""
    STRONG_BULL = "strong_bull"
    BULL = "bull"
    SIDEWAYS = "sideways"
    BEAR = "bear"
    STRONG_BEAR = "strong_bear"
    HIGH_VOLATILITY = "high_volatility"
    LOW_VOLATILITY = "low_volatility"
    CORRELATION_SHOCK = "correlation_shock"


@dataclass
class MambaConfig:
    """Configuration for Mamba-based forecasting models."""
    
    # Model architecture
    d_model: int = 384                 # Model dimension (SSM state size)
    n_layers: int = 8                  # Number of Mamba blocks
    d_state: int = 16                  # SSM state dimension (typically d_model // 2)
    d_conv: int = 4                    # Convolution kernel size in SSM
    expand: int = 2                    # Expansion factor for SSM inner dimension
    
    # Input/output
    seq_len: int = 240                 # Input sequence length (candles)
    output_horizon: int = 1            # Forecast horizon (candles ahead)
    n_features: int = 52               # Feature dimension (OHLCV + indicators + derivatives)
    
    # Forecasting heads
    forecasting_mode: ForecastingMode = ForecastingMode.MULTI_TASK
    supported_horizons: List[ForecastHorizon] = field(
        default_factory=lambda: [
            ForecastHorizon.H1, ForecastHorizon.H3, ForecastHorizon.H5,
            ForecastHorizon.H10, ForecastHorizon.H20, ForecastHorizon.H50
        ]
    )
    
    # Training
    dtype: torch.dtype = torch.float32  # Precision (float32, float16, bfloat16)
    use_amp: bool = True                # Automatic mixed precision
    use_gradient_checkpoint: bool = True  # Memory optimization
    use_compile: bool = False           # PyTorch 2.0 compilation
    
    # Normalization
    normalize_input: bool = True
    robust_scaler: bool = True         # Use robust scaler instead of standard
    
    # Market awareness
    use_regime_embeddings: bool = True
    embed_regime: bool = True
    embed_market_state: bool = True
    
    # Regularization
    dropout_rate: float = 0.1
    weight_decay: float = 1e-4
    layer_norm_eps: float = 1e-6
    
    # Device
    device: str = "cuda" if torch.cuda.is_available() else "cpu"


@dataclass
class HybridMambaConfig(MambaConfig):
    """Configuration for Hybrid Mamba-Transformer model."""
    
    # Mamba component
    mamba_layers: int = 6              # Number of Mamba blocks
    
    # Sparse attention component
    use_sparse_attention: bool = True
    attention_layers: int = 2          # Number of sparse attention layers
    num_heads: int = 8                 # Attention heads
    head_dim: int = 48                 # Dimension per head
    
    # Cross-time attention
    use_cross_time_attention: bool = True
    cross_time_heads: int = 4
    
    # Adaptive gating (when to activate attention)
    use_adaptive_gating: bool = True
    gate_threshold: float = 0.5        # Gating activation threshold


@dataclass
class DataBatch:
    """Single batch of training/inference data."""
    
    # Input sequence: (batch_size, seq_len, n_features)
    prices: torch.Tensor
    
    # Optional technical indicators
    indicators: Optional[torch.Tensor] = None  # (batch_size, seq_len, n_indicators)
    
    # Optional order flow / market microstructure
    order_flow: Optional[torch.Tensor] = None  # (batch_size, seq_len, n_flow_features)
    
    # Derivatives data
    funding_rates: Optional[torch.Tensor] = None  # (batch_size, seq_len, 1)
    open_interest: Optional[torch.Tensor] = None  # (batch_size, seq_len, 1)
    liquidations: Optional[torch.Tensor] = None  # (batch_size, seq_len, 1)
    
    # On-chain metrics
    onchain_data: Optional[torch.Tensor] = None  # (batch_size, seq_len, n_onchain)
    
    # Sentiment data
    sentiment: Optional[torch.Tensor] = None     # (batch_size, seq_len, n_sentiment)
    
    # Market regime (for regime-aware modeling)
    regime: Optional[torch.Tensor] = None        # (batch_size, 1) or (batch_size,)
    
    # Targets
    targets_direction: Optional[torch.Tensor] = None  # (batch_size, n_horizons) - 0/1
    targets_magnitude: Optional[torch.Tensor] = None  # (batch_size, n_horizons) - returns %
    targets_volatility: Optional[torch.Tensor] = None  # (batch_size, n_horizons)
    
    # Metadata
    symbols: Optional[List[str]] = None
    timestamps: Optional[np.ndarray] = None
    
    def to(self, device: str) -> "DataBatch":
        """Move batch to device."""
        return DataBatch(
            prices=self.prices.to(device),
            indicators=self.indicators.to(device) if self.indicators is not None else None,
            order_flow=self.order_flow.to(device) if self.order_flow is not None else None,
            funding_rates=self.funding_rates.to(device) if self.funding_rates is not None else None,
            open_interest=self.open_interest.to(device) if self.open_interest is not None else None,
            liquidations=self.liquidations.to(device) if self.liquidations is not None else None,
            onchain_data=self.onchain_data.to(device) if self.onchain_data is not None else None,
            sentiment=self.sentiment.to(device) if self.sentiment is not None else None,
            regime=self.regime.to(device) if self.regime is not None else None,
            targets_direction=self.targets_direction.to(device) if self.targets_direction is not None else None,
            targets_magnitude=self.targets_magnitude.to(device) if self.targets_magnitude is not None else None,
            targets_volatility=self.targets_volatility.to(device) if self.targets_volatility is not None else None,
            symbols=self.symbols,
            timestamps=self.timestamps,
        )


@dataclass
class ModelOutput:
    """Output from Mamba model."""
    
    # Predictions per horizon
    direction_logits: torch.Tensor      # (batch_size, n_horizons, 2) - LONG/SHORT logits
    returns_pred: torch.Tensor          # (batch_size, n_horizons, 1) - predicted returns %
    volatility_pred: torch.Tensor       # (batch_size, n_horizons, 1) - predicted volatility
    confidence: torch.Tensor            # (batch_size, n_horizons, 1) - prediction confidence
    
    # Optional attention weights for interpretability
    attention_weights: Optional[Dict[str, torch.Tensor]] = None
    
    # Optional hidden states
    hidden_states: Optional[torch.Tensor] = None


@dataclass
class TrainingMetrics:
    """Training metrics for monitoring."""
    
    epoch: int
    step: int
    loss: float
    direction_accuracy: float
    direction_f1: float
    returns_mae: float
    returns_mape: float
    returns_rmse: float
    volatility_mae: float
    sharpe_ratio: float
    profit_factor: float
    
    # Per-horizon metrics
    per_horizon_accuracy: Dict[int, float] = field(default_factory=dict)
    per_horizon_mae: Dict[int, float] = field(default_factory=dict)
    
    # Learning rate
    learning_rate: float = 0.0
    
    # Time
    batch_time_ms: float = 0.0
    throughput_samples_per_sec: float = 0.0


# Feature engineering constants
OHLCV_FEATURES = ["open", "high", "low", "close", "volume"]

TECHNICAL_INDICATORS = [
    "rsi_14", "macd_line", "macd_signal", "macd_histogram",
    "atr_14", "adx_14", "vwap", "obv", "cci", "mfi",
    "roc", "momentum", "ema_9", "ema_21", "ema_55",
    "sma_200", "bb_upper", "bb_middle", "bb_lower",
    "supertrend_up", "supertrend_down", "stoch_rsi"
]

ORDER_FLOW_FEATURES = [
    "bid_ask_imbalance", "delta_volume", "market_pressure",
    "buy_volume", "sell_volume", "volume_ratio"
]

DERIVATIVES_FEATURES = [
    "funding_rate", "open_interest", "liquidation_volume",
    "liquidation_ratio"
]

SENTIMENT_FEATURES = [
    "fear_greed_index", "news_sentiment", "social_sentiment",
    "whale_activity_score", "exchange_flow"
]

ONCHAIN_FEATURES = [
    "active_addresses", "transaction_volume", "miner_revenue",
    "exchange_inflow", "exchange_outflow", "whale_transactions"
]

# Feature counts
N_OHLCV = len(OHLCV_FEATURES)
N_TECHNICAL = len(TECHNICAL_INDICATORS)
N_ORDER_FLOW = len(ORDER_FLOW_FEATURES)
N_DERIVATIVES = len(DERIVATIVES_FEATURES)
N_SENTIMENT = len(SENTIMENT_FEATURES)
N_ONCHAIN = len(ONCHAIN_FEATURES)

# Default total feature dimension
DEFAULT_N_FEATURES = N_OHLCV + N_TECHNICAL + N_ORDER_FLOW + N_DERIVATIVES + N_SENTIMENT + N_ONCHAIN

# Supported sequence lengths (in candles)
SUPPORTED_SEQ_LENGTHS = [60, 120, 240, 500, 1000, 2000]

# Forecast horizon names
HORIZON_NAMES = {
    1: "1-candle",
    3: "3-candle",
    5: "5-candle",
    10: "10-candle",
    20: "20-candle",
    50: "50-candle",
}
