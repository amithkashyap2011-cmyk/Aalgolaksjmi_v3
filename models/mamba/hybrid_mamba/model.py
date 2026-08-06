"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Hybrid Mamba-Transformer Model
  Combines Mamba efficiency with sparse attention for regime detection
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math
from typing import Optional, Tuple
from ..types import MambaConfig, DataBatch, ModelOutput, ForecastingMode
from ..normalization.normalizers import FinancialRobustScaler, AdaptiveMarketNormalizer
from ..embeddings.embeddings import MultimodalEmbedding
from ..attention.sparse_attention import LocalAttention, SparseAttention, MultiHeadCrossTimeAttention
from ..pure_mamba.mamba_block import MambaBlock, ResidualMambaBlock
from ..forecasting_heads.heads import MultiTaskHead


class HybridMambaTransformerBlock(nn.Module):
    """
    Hybrid block combining Mamba and sparse attention with residual connections.
    
    Architecture:
    Input → Mamba Block → Residual Connect
         → Local Attention → Residual Connect
         → Output
    """
    
    def __init__(
        self,
        config: MambaConfig,
        use_attention: bool = True,
        attention_type: str = "local",
    ):
        """
        Args:
            config: Model configuration
            use_attention: Whether to use attention in this block
            attention_type: "local", "sparse", or "strided"
        """
        super().__init__()
        self.config = config
        self.use_attention = use_attention
        
        # Mamba branch (always present)
        self.mamba_block = ResidualMambaBlock(config)
        self.mamba_norm = nn.LayerNorm(config.d_model, eps=config.layer_norm_eps)
        
        # Sparse attention branch (optional, with gating)
        if use_attention:
            if attention_type == "local":
                self.attention = LocalAttention(
                    d_model=config.d_model,
                    n_heads=config.n_heads if hasattr(config, 'n_heads') else 8,
                    window_size=config.seq_len // 4,
                )
            elif attention_type == "sparse":
                self.attention = SparseAttention(
                    d_model=config.d_model,
                    n_heads=config.n_heads if hasattr(config, 'n_heads') else 8,
                    seq_len=config.seq_len,
                )
            else:  # strided
                self.attention = LocalAttention(
                    d_model=config.d_model,
                    n_heads=config.n_heads if hasattr(config, 'n_heads') else 8,
                    window_size=config.seq_len // 8,
                    use_striding=True,
                )
            
            self.attention_norm = nn.LayerNorm(config.d_model, eps=config.layer_norm_eps)
            
            # Adaptive gating: learns whether to activate attention
            self.attention_gate = nn.Sequential(
                nn.Linear(config.d_model, config.d_model // 4),
                nn.GELU(),
                nn.Linear(config.d_model // 4, 1),
                nn.Sigmoid(),
            )
        
        # Feed-forward after attention
        self.ffn = nn.Sequential(
            nn.Linear(config.d_model, config.d_model * 4),
            nn.GELU(),
            nn.Dropout(config.dropout_rate),
            nn.Linear(config.d_model * 4, config.d_model),
            nn.Dropout(config.dropout_rate),
        )
        self.ffn_norm = nn.LayerNorm(config.d_model, eps=config.layer_norm_eps)
    
    def forward(self, x: torch.Tensor, return_attention_weights: bool = False) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        """
        Args:
            x: (batch, seq_len, d_model)
            return_attention_weights: Whether to return attention weights
            
        Returns:
            output: (batch, seq_len, d_model)
            attention_weights: (batch, seq_len, seq_len) or None
        """
        # Mamba branch (always)
        mamba_out, _ = self.mamba_block(x)
        mamba_out = self.mamba_norm(mamba_out + x)  # Residual
        
        # Sparse attention branch (conditionally gated)
        attention_weights = None
        if self.use_attention:
            # Adaptive gating: compute per-position gate
            gate = self.attention_gate(mamba_out.mean(dim=1, keepdim=True))  # (batch, 1, 1)
            
            # Apply attention
            attn_out, attn_weights = self.attention(mamba_out, return_weights=True)
            attention_weights = attn_weights if return_attention_weights else None
            
            # Gate the attention: only apply where beneficial
            attn_out = attn_out * gate + mamba_out * (1 - gate)
            attn_out = self.attention_norm(attn_out + mamba_out)  # Residual
        else:
            attn_out = mamba_out
        
        # Feed-forward
        ffn_out = self.ffn(attn_out)
        output = self.ffn_norm(ffn_out + attn_out)  # Residual
        
        return output, attention_weights


class HybridMambaTransformer(nn.Module):
    """
    Hybrid Mamba-Transformer architecture for financial time series.
    
    Structure (12 layers total):
    1. Input embedding + positional encoding
    2. 6 Mamba blocks (long-context foundation)
    3. 2 sparse attention blocks (regime detection)
    4. 2 cross-attention blocks (multi-timeframe fusion)
    5. Multi-task forecasting heads
    
    Key innovation: Adaptive gating learns when to activate attention,
    enabling efficient computation while retaining expressiveness.
    """
    
    def __init__(self, config: MambaConfig):
        super().__init__()
        self.config = config
        
        # Input normalization
        if config.normalize_input:
            self.normalizer = FinancialRobustScaler()
            self.market_normalizer = AdaptiveMarketNormalizer()
        else:
            self.normalizer = None
            self.market_normalizer = None
        
        # Feature embedding (OHLCV + 47 more features → d_model)
        self.embedding = MultimodalEmbedding(config)
        
        # Positional encoding
        self._init_positional_encoding()
        
        # Mamba stack (6 layers of selective SSM)
        self.mamba_layers = nn.ModuleList([
            HybridMambaTransformerBlock(config, use_attention=False)
            for _ in range(6)
        ])
        
        # Sparse attention stack (2 layers)
        # Layer 1: Local attention (short-range patterns)
        self.attention_layer_1 = HybridMambaTransformerBlock(
            config, use_attention=True, attention_type="local"
        )
        # Layer 2: Strided attention (long-range patterns)
        self.attention_layer_2 = HybridMambaTransformerBlock(
            config, use_attention=True, attention_type="strided"
        )
        
        # Cross-time attention (multi-timeframe fusion)
        self.cross_time_attention = MultiHeadCrossTimeAttention(
            d_model=config.d_model,
            n_heads=config.n_heads if hasattr(config, 'n_heads') else 8,
        )
        self.cross_time_norm = nn.LayerNorm(config.d_model, eps=config.layer_norm_eps)
        
        # Forecasting heads (multi-task learning)
        self.head = MultiTaskHead(config)
        
        # Dropout and layer norm
        self.dropout = nn.Dropout(config.dropout_rate)
        self.final_norm = nn.LayerNorm(config.d_model, eps=config.layer_norm_eps)
    
    def _init_positional_encoding(self):
        """Initialize sinusoidal positional encoding."""
        max_seq_len = self.config.seq_len
        d_model = self.config.d_model
        
        # Create position indices
        position = torch.arange(max_seq_len).unsqueeze(1).float()
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * 
            -(math.log(10000.0) / d_model)
        )
        
        # Sinusoidal encoding
        pe = torch.zeros(1, max_seq_len, d_model)
        pe[0, :, 0::2] = torch.sin(position * div_term)
        if d_model % 2 == 1:
            pe[0, :, 1::2] = torch.cos(position * div_term)[..., :-1]
        else:
            pe[0, :, 1::2] = torch.cos(position * div_term)
        
        self.register_buffer("pe", pe, persistent=False)
    
    def forward(
        self,
        batch: DataBatch,
        return_attention_weights: bool = False,
    ) -> ModelOutput:
        """
        Forward pass through hybrid architecture.
        
        Args:
            batch: DataBatch with prices (batch, seq_len, n_features)
            return_attention_weights: Return attention for visualization
            
        Returns:
            ModelOutput with predictions for all horizons
        """
        x = batch.prices  # (batch, seq_len, n_features)
        batch_size, seq_len, _ = x.shape
        
        # Normalization
        if self.normalizer is not None:
            x = self.normalizer.forward(x)
            x = self.market_normalizer.forward(x)
        
        # Embedding
        x = self.embedding(batch)  # (batch, seq_len, d_model)
        
        # Positional encoding
        x = x + self.pe[:, :seq_len, :].to(x.device)
        x = self.dropout(x)
        
        # Mamba layers (long-context foundation)
        all_attention_weights = []
        for mamba_layer in self.mamba_layers:
            x, _ = mamba_layer(x, return_attention_weights=False)
        
        # Sparse attention layers (regime detection)
        x, attn_weights_1 = self.attention_layer_1(x, return_attention_weights=return_attention_weights)
        if return_attention_weights:
            all_attention_weights.append(attn_weights_1)
        
        x, attn_weights_2 = self.attention_layer_2(x, return_attention_weights=return_attention_weights)
        if return_attention_weights:
            all_attention_weights.append(attn_weights_2)
        
        # Cross-time attention (multi-timeframe fusion)
        # This would typically use attention across different timeframes
        # For now, we apply it within the same timeframe
        x_cross = self.cross_time_attention(x)
        x = self.cross_time_norm(x + x_cross)  # Residual
        
        # Final normalization
        x = self.final_norm(x)
        
        # Forecasting heads
        output = self.head(x)
        
        # Add attention weights if requested
        if return_attention_weights and all_attention_weights:
            # Average attention weights across layers
            output.attention_weights = torch.stack(all_attention_weights).mean(dim=0)
        
        return output
    
    def encode(self, batch: DataBatch) -> torch.Tensor:
        """
        Get hidden representations (embeddings) from the hybrid model.
        
        Args:
            batch: DataBatch
            
        Returns:
            Hidden states (batch, seq_len, d_model)
        """
        x = batch.prices
        batch_size, seq_len, _ = x.shape
        
        # Normalization
        if self.normalizer is not None:
            x = self.normalizer.forward(x)
            x = self.market_normalizer.forward(x)
        
        # Embedding
        x = self.embedding(batch)
        x = x + self.pe[:, :seq_len, :].to(x.device)
        x = self.dropout(x)
        
        # All layers
        for mamba_layer in self.mamba_layers:
            x, _ = mamba_layer(x, return_attention_weights=False)
        
        x, _ = self.attention_layer_1(x)
        x, _ = self.attention_layer_2(x)
        
        x_cross = self.cross_time_attention(x)
        x = self.cross_time_norm(x + x_cross)
        x = self.final_norm(x)
        
        return x
    
    def to_inference_mode(self):
        """Switch to inference mode (eval + disable dropouts)."""
        self.eval()
        for module in self.modules():
            if isinstance(module, nn.Dropout):
                module.p = 0.0
    
    def count_parameters(self) -> int:
        """Count total trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
    
    def get_memory_usage(self) -> float:
        """Estimate memory usage in MB."""
        param_size = sum(
            p.numel() * p.element_size() 
            for p in self.parameters()
        ) / (1024 ** 2)
        
        # Estimate activations (batch_size=1, seq_len=240)
        activation_size = (
            1 * self.config.seq_len * self.config.d_model * 4 * 12  # 12 layers
        ) / (1024 ** 2)
        
        return param_size + activation_size


class FinancialHybridMambaTransformer(nn.Module):
    """
    Production-ready wrapper for hybrid model with training/inference utilities.
    
    This module provides the same interface as FinancialMambaModel for seamless
    ensemble integration.
    """
    
    def __init__(self, config: MambaConfig):
        super().__init__()
        self.config = config
        self.model = HybridMambaTransformer(config)
    
    def forward(self, batch: DataBatch, return_attention_weights: bool = False) -> ModelOutput:
        """Forward pass."""
        return self.model(batch, return_attention_weights=return_attention_weights)
    
    def encode(self, batch: DataBatch) -> torch.Tensor:
        """Get embeddings."""
        return self.model.encode(batch)
    
    def to_inference_mode(self):
        """Switch to inference mode."""
        self.model.to_inference_mode()
    
    def count_parameters(self) -> int:
        """Count parameters."""
        return self.model.count_parameters()
    
    def get_memory_usage(self) -> float:
        """Get memory usage estimate."""
        return self.model.get_memory_usage()
    
    def to(self, device):
        """Move to device."""
        super().to(device)
        if hasattr(self.model, "pe"):
            self.model.pe = self.model.pe.to(device)
        return self


# ═══════════════════════════════════════════════════════════════════════════════
# Testing & Benchmarking
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("═" * 80)
    print("HYBRID MAMBA-TRANSFORMER ARCHITECTURE TEST")
    print("═" * 80)
    
    # Configuration
    config = MambaConfig(
        d_model=384,
        n_layers=12,  # Total: 6 Mamba + 2 sparse attention + 2 cross-time
        d_state=16,
        seq_len=240,
        forecasting_mode=ForecastingMode.MULTI_TASK,
        use_amp=False,
    )
    
    # Add n_heads if not present
    if not hasattr(config, 'n_heads'):
        config.n_heads = 8
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n✓ Device: {device}")
    
    # Create model
    model = FinancialHybridMambaTransformer(config)
    model = model.to(device)
    
    print(f"✓ Model created")
    print(f"  Parameters: {model.count_parameters():,}")
    print(f"  Memory (est): {model.get_memory_usage():.2f} MB")
    
    # Dummy batch
    batch = DataBatch(
        prices=torch.randn(4, 240, 52, device=device),
    )
    
    # Forward pass
    print(f"\n✓ Running forward pass...")
    with torch.no_grad():
        output = model(batch, return_attention_weights=True)
    
    print(f"  Direction logits: {output.direction_logits.shape}")
    print(f"  Returns pred: {output.returns_pred.shape}")
    print(f"  Volatility pred: {output.volatility_pred.shape}")
    print(f"  Confidence: {output.confidence.shape}")
    if output.attention_weights is not None:
        print(f"  Attention weights: {output.attention_weights.shape}")
    
    # Inference mode
    print(f"\n✓ Switching to inference mode...")
    model.to_inference_mode()
    
    with torch.no_grad():
        output = model(batch)
        probs = torch.softmax(output.direction_logits[:, 0, :], dim=-1)
        print(f"  P(LONG): {probs[0, 0]:.2%}")
        print(f"  P(SHORT): {probs[0, 1]:.2%}")
    
    # Embeddings
    print(f"\n✓ Extracting embeddings...")
    with torch.no_grad():
        embeddings = model.encode(batch)
    print(f"  Embeddings shape: {embeddings.shape}")
    
    print(f"\n{'═' * 80}")
    print("✓ TEST PASSED - Hybrid model is functional")
    print(f"{'═' * 80}")
