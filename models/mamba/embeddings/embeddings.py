"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Embedding Layers
  Feature embedding and market state representation
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional


class FinancialFeatureEmbedding(nn.Module):
    """
    Embeds raw financial features (OHLCV + indicators) into a continuous space.
    Handles varying feature counts and dynamic feature selection.
    """
    
    def __init__(self, input_dim: int, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.input_dim = input_dim
        self.d_model = d_model
        
        # Linear projection to model dimension
        self.proj = nn.Linear(input_dim, d_model)
        
        # Layer normalization
        self.norm = nn.LayerNorm(d_model)
        
        # Dropout
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Embed features.
        x: (batch_size, seq_len, input_dim)
        Returns: (batch_size, seq_len, d_model)
        """
        x = self.proj(x)
        x = self.norm(x)
        x = self.dropout(x)
        return x


class TemporalPositionalEmbedding(nn.Module):
    """
    Sinusoidal positional encoding for temporal sequences.
    Adapted for financial time series with awareness of market hours.
    """
    
    def __init__(self, d_model: int, max_seq_len: int = 2048):
        super().__init__()
        self.d_model = d_model
        
        # Create positional encoding matrix
        pe = torch.zeros(max_seq_len, d_model)
        position = torch.arange(0, max_seq_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float) * 
            (-torch.log(torch.tensor(10000.0)) / d_model)
        )
        
        pe[:, 0::2] = torch.sin(position * div_term)
        if d_model % 2 == 1:
            pe[:, 1::2] = torch.cos(position * div_term)[..., :-1]
        else:
            pe[:, 1::2] = torch.cos(position * div_term)
        
        self.register_buffer("pe", pe.unsqueeze(0))
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Add positional encoding.
        x: (batch_size, seq_len, d_model)
        """
        seq_len = x.shape[1]
        return x + self.pe[:, :seq_len, :]


class MarketRegimeEmbedding(nn.Module):
    """
    Embeds market regime as a continuous vector.
    Enables regime-aware model decisions.
    """
    
    def __init__(self, d_model: int, n_regimes: Optional[int] = None):
        super().__init__()
        self.d_model = d_model
        
        # Define regimes if not provided
        if n_regimes is None:
            n_regimes = len(MarketRegime)
        
        # Embedding for each regime
        self.regime_embedding = nn.Embedding(n_regimes, d_model)
    
    def forward(self, regime: torch.Tensor) -> torch.Tensor:
        """
        Embed regime.
        regime: (batch_size,) - regime indices
        Returns: (batch_size, d_model)
        """
        return self.regime_embedding(regime)


class MarketStateEmbedding(nn.Module):
    """
    Learns market state representation from multiple signals:
    - Trend (EMA crossovers)
    - Momentum (RSI, MACD)
    - Volatility (ATR, Bollinger)
    - Liquidity (Volume, Spread)
    """
    
    def __init__(self, d_model: int, n_state_dims: int = 4):
        super().__init__()
        self.d_model = d_model
        self.n_state_dims = n_state_dims
        
        # Project each state dimension to embedding
        self.state_projections = nn.ModuleList([
            nn.Linear(1, d_model // n_state_dims)
            for _ in range(n_state_dims)
        ])
        
        # Fuse state dimensions
        self.fuse = nn.Linear(d_model, d_model)
        self.norm = nn.LayerNorm(d_model)
    
    def forward(
        self,
        trend: torch.Tensor,
        momentum: torch.Tensor,
        volatility: torch.Tensor,
        liquidity: torch.Tensor
    ) -> torch.Tensor:
        """
        Embed market state from multiple signals.
        Each signal: (batch_size, seq_len, 1)
        Returns: (batch_size, seq_len, d_model)
        """
        # Project each state dimension
        trend_emb = self.state_projections[0](trend)
        momentum_emb = self.state_projections[1](momentum)
        vol_emb = self.state_projections[2](volatility)
        liq_emb = self.state_projections[3](liquidity)
        
        # Concatenate
        state_emb = torch.cat([trend_emb, momentum_emb, vol_emb, liq_emb], dim=-1)
        
        # Fuse
        state_emb = self.fuse(state_emb)
        state_emb = self.norm(state_emb)
        
        return state_emb


class DerivativesEmbedding(nn.Module):
    """
    Embeds derivatives market data:
    - Funding rates
    - Open interest
    - Liquidation volume
    """
    
    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.d_model = d_model
        
        # Funding rate encoder
        self.funding_encoder = nn.Sequential(
            nn.Linear(1, d_model // 3),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Open interest encoder
        self.oi_encoder = nn.Sequential(
            nn.Linear(1, d_model // 3),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Liquidation encoder
        self.liq_encoder = nn.Sequential(
            nn.Linear(1, d_model // 3),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        # Fusion
        self.fuse = nn.Linear(d_model, d_model)
        self.norm = nn.LayerNorm(d_model)
    
    def forward(
        self,
        funding_rates: torch.Tensor,
        open_interest: torch.Tensor,
        liquidations: torch.Tensor
    ) -> torch.Tensor:
        """
        Embed derivatives data.
        Each input: (batch_size, seq_len, 1) or (batch_size, seq_len, n_features)
        Returns: (batch_size, seq_len, d_model)
        """
        # Encode each component
        funding_emb = self.funding_encoder(funding_rates)
        oi_emb = self.oi_encoder(open_interest)
        liq_emb = self.liq_encoder(liquidations)
        
        # Concatenate
        deriv_emb = torch.cat([funding_emb, oi_emb, liq_emb], dim=-1)
        
        # Fuse
        deriv_emb = self.fuse(deriv_emb)
        deriv_emb = self.norm(deriv_emb)
        
        return deriv_emb


class SentimentEmbedding(nn.Module):
    """
    Embeds market sentiment signals:
    - Fear & Greed Index
    - News sentiment
    - Social sentiment
    - Whale activity
    """
    
    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.d_model = d_model
        
        # Multi-head sentiment encoding
        self.sentiment_encoder = nn.Sequential(
            nn.Linear(4, d_model),  # 4 sentiment signals
            nn.LayerNorm(d_model),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_model, d_model),
        )
        
        self.norm = nn.LayerNorm(d_model)
    
    def forward(
        self,
        fear_greed: torch.Tensor,
        news_sentiment: torch.Tensor,
        social_sentiment: torch.Tensor,
        whale_activity: torch.Tensor
    ) -> torch.Tensor:
        """
        Embed sentiment signals.
        Each input: (batch_size, seq_len, 1)
        Returns: (batch_size, seq_len, d_model)
        """
        # Concatenate sentiment signals
        sentiment = torch.cat(
            [fear_greed, news_sentiment, social_sentiment, whale_activity],
            dim=-1
        )
        
        # Encode
        sentiment_emb = self.sentiment_encoder(sentiment)
        sentiment_emb = self.norm(sentiment_emb)
        
        return sentiment_emb


class OnChainEmbedding(nn.Module):
    """
    Embeds on-chain metrics:
    - Active addresses
    - Transaction volume
    - Exchange flows
    - Whale transactions
    """
    
    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.d_model = d_model
        
        self.onchain_encoder = nn.Sequential(
            nn.Linear(6, d_model),  # 6 on-chain features
            nn.LayerNorm(d_model),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_model, d_model),
        )
        
        self.norm = nn.LayerNorm(d_model)
    
    def forward(self, onchain_data: torch.Tensor) -> torch.Tensor:
        """
        Embed on-chain data.
        onchain_data: (batch_size, seq_len, 6)
        Returns: (batch_size, seq_len, d_model)
        """
        onchain_emb = self.onchain_encoder(onchain_data)
        onchain_emb = self.norm(onchain_emb)
        return onchain_emb


class MultimodalEmbedding(nn.Module):
    """
    Combines multiple embedding modalities:
    - Price/technical (OHLCV + indicators)
    - Derivatives (funding, OI, liquidations)
    - Sentiment (news, social, whale)
    - On-chain (addresses, volumes, flows)
    """
    
    def __init__(self, d_model: int, input_dim: int, dropout: float = 0.1):
        super().__init__()
        self.d_model = d_model
        
        # Individual embedders
        self.price_embedding = FinancialFeatureEmbedding(input_dim, d_model, dropout)
        self.deriv_embedding = DerivativesEmbedding(d_model, dropout)
        self.sentiment_embedding = SentimentEmbedding(d_model, dropout)
        self.onchain_embedding = OnChainEmbedding(d_model, dropout)
        
        # Multimodal fusion layer
        self.fusion = nn.Sequential(
            nn.Linear(d_model * 4, d_model * 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 2, d_model),
        )
        
        self.norm = nn.LayerNorm(d_model)
    
    def forward(
        self,
        prices: torch.Tensor,
        derivatives: Optional[tuple] = None,
        sentiment: Optional[tuple] = None,
        onchain: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Combine multiple modalities.
        Returns: (batch_size, seq_len, d_model)
        """
        # Price embedding
        price_emb = self.price_embedding(prices)
        
        embeddings = [price_emb]
        
        # Optional derivatives
        if derivatives is not None:
            funding, oi, liq = derivatives
            deriv_emb = self.deriv_embedding(funding, oi, liq)
            embeddings.append(deriv_emb)
        
        # Optional sentiment
        if sentiment is not None:
            fg, news, social, whale = sentiment
            sent_emb = self.sentiment_embedding(fg, news, social, whale)
            embeddings.append(sent_emb)
        
        # Optional on-chain
        if onchain is not None:
            onchain_emb = self.onchain_embedding(onchain)
            embeddings.append(onchain_emb)
        
        # Pad if fewer modalities
        while len(embeddings) < 4:
            embeddings.append(torch.zeros_like(price_emb))
        
        # Fuse embeddings
        multimodal = torch.cat(embeddings, dim=-1)
        fused = self.fusion(multimodal)
        fused = self.norm(fused)
        
        return fused
