"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Pure Mamba Forecasting Model
  Complete architecture for financial time series forecasting
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
from typing import Optional, Dict, Tuple
from ..types import MambaConfig, DataBatch, ModelOutput, ForecastingMode
from ..embeddings.embeddings import (
    FinancialFeatureEmbedding,
    TemporalPositionalEmbedding,
    MarketStateEmbedding,
    MultimodalEmbedding,
)
from ..normalization.normalizers import FinancialRobustScaler, AdaptiveMarketNormalizer
from ..forecasting_heads.heads import (
    RegressionHead,
    ClassificationHead,
    MultiTaskHead,
)
from .mamba_block import MambaStack


class FinancialMambaModel(nn.Module):
    """
    Pure Mamba model optimized for financial time series forecasting.
    
    Architecture:
    1. Input normalization (robust scaler)
    2. Feature embedding (OHLCV + indicators + multimodal)
    3. Positional encoding (temporal)
    4. Mamba blocks (selective SSM)
    5. Forecasting heads (direction, magnitude, confidence)
    
    Key features:
    - Long-context support (up to 2000+ candles)
    - CUDA-optimized with gradient checkpointing
    - Multi-task learning heads
    - Regime-aware modeling
    - Market state embeddings
    """
    
    def __init__(self, config: MambaConfig):
        super().__init__()
        self.config = config
        self.device_str = config.device
        
        # 1. Input normalization
        self.input_normalizer = FinancialRobustScaler(eps=1e-8)
        
        if config.normalize_input:
            if config.robust_scaler:
                self.normalizer = FinancialRobustScaler()
            else:
                self.normalizer = AdaptiveMarketNormalizer()
        else:
            self.normalizer = None
        
        # 2. Embedding layers
        self.feature_embedding = FinancialFeatureEmbedding(
            input_dim=config.n_features,
            d_model=config.d_model,
            dropout=config.dropout_rate,
        )
        
        # Positional encoding
        self.pos_embedding = TemporalPositionalEmbedding(
            d_model=config.d_model,
            max_seq_len=max(config.seq_len, 2048),
        )
        
        # Market state embeddings (if enabled)
        if config.embed_market_state:
            self.market_state_embedding = MarketStateEmbedding(config.d_model)
        
        # 3. Mamba stack
        self.mamba_stack = MambaStack(
            d_model=config.d_model,
            n_layers=config.n_layers,
            d_state=config.d_state,
            d_conv=config.d_conv,
            expand=config.expand,
            dropout=config.dropout_rate,
            use_gradient_checkpoint=config.use_gradient_checkpoint,
        )
        
        # 4. Forecasting heads based on mode
        if config.forecasting_mode == ForecastingMode.REGRESSION:
            self.head = RegressionHead(
                d_model=config.d_model,
                n_horizons=len(config.supported_horizons),
                dropout=config.dropout_rate,
            )
        elif config.forecasting_mode == ForecastingMode.CLASSIFICATION:
            self.head = ClassificationHead(
                d_model=config.d_model,
                n_horizons=len(config.supported_horizons),
                n_classes=3,
                dropout=config.dropout_rate,
            )
        else:  # MULTI_TASK
            self.head = MultiTaskHead(
                d_model=config.d_model,
                n_horizons=len(config.supported_horizons),
                dropout=config.dropout_rate,
                n_classes=3,
            )
        
        # Initialize weights
        self._init_weights()
    
    def _init_weights(self):
        """Initialize model weights using Xavier initialization."""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.LayerNorm):
                nn.init.ones_(module.weight)
                nn.init.zeros_(module.bias)
    
    def forward(
        self,
        batch: DataBatch,
        return_attention: bool = False,
    ) -> ModelOutput:
        """
        Forward pass through the model.
        
        Args:
            batch: DataBatch with prices, indicators, etc.
            return_attention: Whether to return attention weights
        
        Returns:
            ModelOutput with predictions
        """
        device = next(self.parameters()).device
        batch = batch.to(device.type if isinstance(device, torch.device) else device)
        
        # 1. Normalization
        x = batch.prices  # (batch, seq_len, n_features)
        
        if self.normalizer is not None:
            x = self.normalizer(x, batch.prices)
        
        # 2. Embedding
        x = self.feature_embedding(x)  # (batch, seq_len, d_model)
        x = self.pos_embedding(x)  # Add positional encoding
        
        # 3. Market state embedding (optional)
        if hasattr(self, 'market_state_embedding') and batch.regime is not None:
            # Extract market state signals from batch if available
            # (This would require computing trend, momentum, volatility, liquidity)
            # For now, we skip this to keep the batch interface simple
            pass
        
        # 4. Mamba processing
        x = self.mamba_stack(x)  # (batch, seq_len, d_model)
        
        # 5. Forecasting head
        if self.config.forecasting_mode == ForecastingMode.REGRESSION:
            head_output = self.head(x)
            
            output = ModelOutput(
                direction_logits=torch.zeros(batch.prices.shape[0], len(self.config.supported_horizons), 2, device=device),
                returns_pred=head_output["returns"],
                volatility_pred=head_output["volatility"],
                confidence=head_output["confidence"],
                attention_weights=None,
                hidden_states=x if return_attention else None,
            )
        
        elif self.config.forecasting_mode == ForecastingMode.CLASSIFICATION:
            head_output = self.head(x)
            
            output = ModelOutput(
                direction_logits=head_output["logits"],
                returns_pred=torch.zeros(batch.prices.shape[0], len(self.config.supported_horizons), 1, device=device),
                volatility_pred=torch.zeros(batch.prices.shape[0], len(self.config.supported_horizons), 1, device=device),
                confidence=head_output["confidence"],
                attention_weights=None,
                hidden_states=x if return_attention else None,
            )
        
        else:  # MULTI_TASK
            head_output = self.head(x)
            
            output = ModelOutput(
                direction_logits=head_output["direction_logits"],
                returns_pred=head_output["returns"],
                volatility_pred=head_output["volatility"],
                confidence=head_output["confidence"],
                attention_weights=None,
                hidden_states=x if return_attention else None,
            )
        
        return output
    
    def encode(self, batch: DataBatch) -> torch.Tensor:
        """
        Get encoded representation (hidden states) without head predictions.
        Useful for fine-tuning or analysis.
        
        Returns: (batch, seq_len, d_model)
        """
        device = next(self.parameters()).device
        batch = batch.to(device.type if isinstance(device, torch.device) else device)
        
        x = batch.prices
        
        if self.normalizer is not None:
            x = self.normalizer(x, batch.prices)
        
        x = self.feature_embedding(x)
        x = self.pos_embedding(x)
        x = self.mamba_stack(x)
        
        return x
    
    def to_inference_mode(self):
        """Set model to inference mode (eval + no grad)."""
        self.eval()
        for param in self.parameters():
            param.requires_grad_(False)
    
    def count_parameters(self) -> int:
        """Count trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
    
    @torch.no_grad()
    def get_memory_usage(self, batch_size: int, seq_len: int) -> Dict[str, float]:
        """
        Estimate memory usage (MB) for given batch size and sequence length.
        """
        # Create dummy batch
        dummy_batch = DataBatch(
            prices=torch.randn(batch_size, seq_len, self.config.n_features),
        )
        
        # Forward pass to estimate
        device = next(self.parameters()).device
        dummy_batch = dummy_batch.to(device.type if isinstance(device, torch.device) else device)
        
        # Get model output
        output = self(dummy_batch)
        
        # Estimate memory
        model_params_mb = (self.count_parameters() * 4) / (1024 ** 2)  # 4 bytes per float32
        
        # Activation memory (rough estimate)
        activation_mb = (batch_size * seq_len * self.config.d_model * 4) / (1024 ** 2)
        
        # Gradient memory (roughly same as activation during training)
        gradient_mb = activation_mb
        
        return {
            "model_parameters_mb": model_params_mb,
            "activation_memory_mb": activation_mb,
            "gradient_memory_mb": gradient_mb,
            "total_mb": model_params_mb + activation_mb + gradient_mb,
        }
