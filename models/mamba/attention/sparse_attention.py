"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Sparse Attention Layers
  Efficient attention for long sequences with adaptive gating
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math
from typing import Optional, Tuple


class LocalAttention(nn.Module):
    """
    Local attention: each token attends to a local window.
    Efficient O(n*w) complexity vs O(n^2) for full attention.
    """
    
    def __init__(
        self,
        d_model: int,
        num_heads: int = 8,
        window_size: int = 64,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.num_heads = num_heads
        self.window_size = window_size
        self.head_dim = d_model // num_heads
        
        assert d_model % num_heads == 0, "d_model must be divisible by num_heads"
        
        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.o_proj = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
        self.scale = 1.0 / math.sqrt(self.head_dim)
    
    def forward(self, x: torch.Tensor, mask: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        x: (batch_size, seq_len, d_model)
        Returns: (output, attention_weights)
        """
        batch_size, seq_len, _ = x.shape
        
        # Project to Q, K, V
        q = self.q_proj(x).reshape(batch_size, seq_len, self.num_heads, self.head_dim)
        k = self.k_proj(x).reshape(batch_size, seq_len, self.num_heads, self.head_dim)
        v = self.v_proj(x).reshape(batch_size, seq_len, self.num_heads, self.head_dim)
        
        # Transpose for multi-head attention
        q = q.transpose(1, 2)  # (batch, heads, seq_len, head_dim)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)
        
        # Compute local attention
        scores = torch.matmul(q, k.transpose(-2, -1)) * self.scale  # (batch, heads, seq_len, seq_len)
        
        # Create local attention mask
        local_mask = self._get_local_mask(seq_len, self.window_size, device=x.device)
        scores = scores.masked_fill(~local_mask, float('-inf'))
        
        # Apply user mask if provided
        if mask is not None:
            scores = scores.masked_fill(~mask.unsqueeze(1).unsqueeze(1), float('-inf'))
        
        # Softmax
        attn_weights = F.softmax(scores, dim=-1)
        attn_weights = self.dropout(attn_weights)
        
        # Apply attention to values
        output = torch.matmul(attn_weights, v)  # (batch, heads, seq_len, head_dim)
        
        # Transpose back
        output = output.transpose(1, 2).contiguous()
        output = output.reshape(batch_size, seq_len, self.d_model)
        
        # Output projection
        output = self.o_proj(output)
        
        # Return attention weights (average over heads)
        attn_weights = attn_weights.mean(dim=1)
        
        return output, attn_weights
    
    @staticmethod
    def _get_local_mask(seq_len: int, window_size: int, device: torch.device) -> torch.Tensor:
        """Create local attention mask."""
        mask = torch.ones(seq_len, seq_len, device=device, dtype=torch.bool)
        for i in range(seq_len):
            start = max(0, i - window_size // 2)
            end = min(seq_len, i + window_size // 2 + 1)
            mask[i, :start] = False
            mask[i, end:] = False
        return mask


class SparseAttention(nn.Module):
    """
    Sparse attention combining strided and local patterns.
    Reduces complexity for very long sequences.
    """
    
    def __init__(
        self,
        d_model: int,
        num_heads: int = 8,
        local_window: int = 64,
        stride: int = 128,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.num_heads = num_heads
        self.local_window = local_window
        self.stride = stride
        
        # Local attention for neighborhood
        self.local_attn = LocalAttention(d_model, num_heads, local_window, dropout)
        
        # Strided attention for long-range dependencies
        self.strided_attn = LocalAttention(d_model, num_heads, local_window * 2, dropout)
    
    def forward(self, x: torch.Tensor, mask: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        x: (batch_size, seq_len, d_model)
        """
        # Local attention
        local_out, local_attn = self.local_attn(x, mask)
        
        # Strided attention on downsampled sequence
        x_strided = x[:, ::self.stride, :]
        strided_out, strided_attn = self.strided_attn(x_strided, None)
        
        # Upsample strided output
        strided_out_upsampled = torch.repeat_interleave(strided_out, self.stride, dim=1)
        strided_out_upsampled = strided_out_upsampled[:, :x.shape[1], :]  # Trim to original length
        
        # Combine
        output = (local_out + strided_out_upsampled) / 2
        
        return output, (local_attn + strided_attn) / 2


class MultiHeadCrossTimeAttention(nn.Module):
    """
    Cross-time attention: attends across different time horizons.
    Useful for capturing dependencies between short-term and long-term patterns.
    """
    
    def __init__(
        self,
        d_model: int,
        num_heads: int = 4,
        num_time_scales: int = 3,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.num_heads = num_heads
        self.num_time_scales = num_time_scales
        self.head_dim = d_model // num_heads
        
        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.o_proj = nn.Linear(d_model, d_model)
        
        # Time scale embeddings
        self.time_scale_embed = nn.Embedding(num_time_scales, self.head_dim)
        
        self.dropout = nn.Dropout(dropout)
        self.scale = 1.0 / math.sqrt(self.head_dim)
    
    def forward(
        self,
        x: torch.Tensor,
        time_scales: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        x: (batch_size, seq_len, d_model)
        time_scales: (batch_size, seq_len) - which time scale each token belongs to
        """
        batch_size, seq_len, _ = x.shape
        
        if time_scales is None:
            # Default: cyclically assign time scales
            time_scales = torch.arange(seq_len, device=x.device) % self.num_time_scales
            time_scales = time_scales.unsqueeze(0).expand(batch_size, -1)
        
        # Project
        q = self.q_proj(x).reshape(batch_size, seq_len, self.num_heads, self.head_dim)
        k = self.k_proj(x).reshape(batch_size, seq_len, self.num_heads, self.head_dim)
        v = self.v_proj(x).reshape(batch_size, seq_len, self.num_heads, self.head_dim)
        
        # Add time scale information
        time_emb = self.time_scale_embed(time_scales)  # (batch, seq_len, head_dim)
        time_emb = time_emb.unsqueeze(2)  # (batch, seq_len, 1, head_dim)
        
        q = q + time_emb
        k = k + time_emb
        
        # Transpose for multi-head
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)
        
        # Attention
        scores = torch.matmul(q, k.transpose(-2, -1)) * self.scale
        attn_weights = F.softmax(scores, dim=-1)
        attn_weights = self.dropout(attn_weights)
        
        output = torch.matmul(attn_weights, v)
        output = output.transpose(1, 2).contiguous()
        output = output.reshape(batch_size, seq_len, self.d_model)
        
        output = self.o_proj(output)
        attn_weights = attn_weights.mean(dim=1)
        
        return output, attn_weights


class AdaptiveAttentionGating(nn.Module):
    """
    Learns when to activate attention.
    Uses gating mechanism to softly select between:
    - Dense attention (when needed)
    - Sparse attention (for efficiency)
    - No attention (for computational speed)
    """
    
    def __init__(
        self,
        d_model: int,
        num_heads: int = 8,
        gate_threshold: float = 0.5,
        dropout: float = 0.1
    ):
        super().__init__()
        self.d_model = d_model
        self.gate_threshold = gate_threshold
        
        # Gate network: learns importance of each position
        self.gate_net = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.ReLU(),
            nn.Linear(d_model // 2, 1),
            nn.Sigmoid()
        )
        
        # Attention variants
        self.local_attn = LocalAttention(d_model, num_heads, window_size=64, dropout=dropout)
        self.sparse_attn = SparseAttention(d_model, num_heads, dropout=dropout)
    
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Adaptively apply attention.
        x: (batch_size, seq_len, d_model)
        """
        # Compute gate scores
        gate_scores = self.gate_net(x)  # (batch, seq_len, 1)
        gate_scores = gate_scores.squeeze(-1)  # (batch, seq_len)
        
        # Determine which positions need attention
        needs_attention = gate_scores > self.gate_threshold  # (batch, seq_len)
        
        # Apply sparse attention to positions that need it
        sparse_out, sparse_attn = self.sparse_attn(x)
        
        # Apply local attention as fallback
        local_out, local_attn = self.local_attn(x)
        
        # Blend outputs based on gate scores
        # Positions with high gate scores use sparse attention
        # Positions with low gate scores use local attention
        gate_scores_expanded = gate_scores.unsqueeze(-1)  # (batch, seq_len, 1)
        output = gate_scores_expanded * sparse_out + (1 - gate_scores_expanded) * local_out
        
        # Average attention weights
        attn_weights = gate_scores_expanded.squeeze(-1) * sparse_attn + (1 - gate_scores_expanded.squeeze(-1)) * local_attn
        
        return output, attn_weights


class RelativePositionBias(nn.Module):
    """
    Relative position bias for attention (similar to T5/DeBERTa).
    More effective than absolute positional encodings for long sequences.
    """
    
    def __init__(
        self,
        num_heads: int,
        max_distance: int = 128,
        bidirectional: bool = True
    ):
        super().__init__()
        self.num_heads = num_heads
        self.max_distance = max_distance
        self.bidirectional = bidirectional
        
        if bidirectional:
            num_buckets = 2 * max_distance
        else:
            num_buckets = max_distance
        
        self.bias = nn.Embedding(num_buckets, num_heads)
    
    def _relative_position_bucket(
        self,
        relative_position: torch.Tensor
    ) -> torch.Tensor:
        """Bucket relative positions."""
        num_buckets = self.bias.weight.shape[0]
        
        if self.bidirectional:
            num_buckets //= 2
            ret = 0
            ret += (relative_position < 0).long() * num_buckets
            relative_position = torch.abs(relative_position)
        else:
            ret = 0
        
        # logarithmic bucketing
        relative_position = torch.clamp(relative_position, 0, self.max_distance - 1)
        ret += torch.nn.functional.relu(relative_position)
        ret = torch.clamp(ret, max=num_buckets - 1)
        
        return ret
    
    def forward(self, qlen: int, klen: int, device: torch.device) -> torch.Tensor:
        """
        Compute relative position bias.
        Returns: (qlen, klen, num_heads)
        """
        q_pos = torch.arange(qlen, dtype=torch.long, device=device)
        k_pos = torch.arange(klen, dtype=torch.long, device=device)
        
        relative_pos = k_pos[None, :] - q_pos[:, None]
        rel_pos_bucket = self._relative_position_bucket(relative_pos)
        
        values = self.bias(rel_pos_bucket)  # (qlen, klen, num_heads)
        
        return values
