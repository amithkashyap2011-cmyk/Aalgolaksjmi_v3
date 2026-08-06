"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Mamba Block Implementation
  State Space Model (SSM) with selective scan and parallel computation
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math
from typing import Optional, Tuple


class MambaBlock(nn.Module):
    """
    Core Mamba block combining:
    - Selective SSM (State Space Model) with adaptive parameters
    - Gating mechanism for expressiveness
    - Parallel scan for efficient computation on long sequences
    """
    
    def __init__(
        self,
        d_model: int,
        d_state: int = 16,
        d_conv: int = 4,
        expand: int = 2,
        dt_rank: Optional[int] = None,
        dt_scale: float = 0.3,
        dt_min: float = 0.001,
        dt_max: float = 0.1,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.d_model = d_model
        self.d_state = d_state
        self.d_conv = d_conv
        self.expand = expand
        self.d_inner = d_model * expand
        
        if dt_rank is None:
            dt_rank = math.ceil(d_model / 16)
        self.dt_rank = dt_rank
        
        # Input projection
        self.in_proj = nn.Linear(d_model, self.d_inner * 2, bias=False)
        
        # Convolution in SSM (1D conv for local structure)
        self.conv1d = nn.Conv1d(
            in_channels=self.d_inner,
            out_channels=self.d_inner,
            kernel_size=d_conv,
            padding=d_conv - 1,
            groups=self.d_inner,
            bias=True
        )
        
        # SSM parameters
        # A: (d_inner, d_state) - state transition matrix (log-space to ensure stability)
        self.A_log = nn.Parameter(torch.randn(self.d_inner, d_state) / math.sqrt(d_state))
        
        # D: (d_inner,) - skip connection
        self.D = nn.Parameter(torch.randn(self.d_inner))
        
        # dt projection: (dt_rank,) -> (d_inner,)
        self.dt_proj = nn.Linear(dt_rank, self.d_inner, bias=True)
        
        # Input for dt projection
        self.x_proj = nn.Linear(self.d_inner, dt_rank, bias=False)
        
        # Gating projection
        self.out_proj = nn.Linear(self.d_inner, d_model, bias=False)
        
        # Initialize parameters
        self.dt_scale = dt_scale
        self.dt_min = dt_min
        self.dt_max = dt_max
        
        # Layer norm
        self.norm = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model)
        Returns: (batch_size, seq_len, d_model)
        """
        batch_size, seq_len, _ = x.shape
        
        # Normalize input
        x_norm = self.norm(x)
        
        # Project to expanded space
        xz = self.in_proj(x_norm)  # (batch, seq_len, 2 * d_inner)
        x_proj, z = torch.split(xz, self.d_inner, dim=-1)
        
        # Gate
        z = F.gelu(z)
        
        # Convolution (local structure capture)
        x_proj = x_proj.transpose(-2, -1)  # (batch, d_inner, seq_len)
        x_proj = self.conv1d(x_proj)[:, :, :seq_len]  # Remove padding
        x_proj = x_proj.transpose(-2, -1)  # (batch, seq_len, d_inner)
        
        # Selective SSM
        y = self._selective_ssm(x_proj)  # (batch, seq_len, d_inner)
        
        # Apply gating
        y = y * z  # (batch, seq_len, d_inner)
        
        # Output projection
        output = self.out_proj(y)  # (batch, seq_len, d_model)
        
        # Residual connection and dropout
        output = x + self.dropout(output)
        
        return output
    
    def _selective_ssm(self, x: torch.Tensor) -> torch.Tensor:
        """
        Selective State Space Model with adaptive dt and A.
        
        State update: h_t = A * h_{t-1} + B * x_t
        Output: y_t = C * h_t + D * x_t
        
        Where A, B, C, D are selectively adapted based on input.
        """
        batch_size, seq_len, _ = x.shape
        device = x.device
        
        # Compute dt (step size) - adaptive based on input
        dt_base = self.x_proj(x)  # (batch, seq_len, dt_rank)
        dt = F.softplus(self.dt_proj(dt_base))  # (batch, seq_len, d_inner)
        
        # Clamp dt to valid range
        dt = torch.clamp(dt, min=self.dt_min, max=self.dt_max)
        
        # A matrix - convert from log space
        A = -torch.exp(self.A_log.float())  # (d_inner, d_state) - stability: negative eigenvalues
        
        # Compute discrete-time parameters using ZOH (Zero-Order Hold)
        # exp(A * dt)
        dt_expanded = dt.unsqueeze(-1)  # (batch, seq_len, d_inner, 1)
        dA = torch.exp(A.float() * dt_expanded)  # (batch, seq_len, d_inner, d_state)
        
        # B matrix - from input (implicit)
        # Using implicit B = 1 (can be extended)
        dB = dt_expanded  # (batch, seq_len, d_inner, 1)
        
        # Initialize hidden state
        h = torch.zeros(
            batch_size, self.d_inner, self.d_state,
            device=device, dtype=x.dtype
        )
        
        # Process sequence using parallel scan (or sequential for simplicity)
        y_seq = []
        
        for t in range(seq_len):
            x_t = x[:, t, :]  # (batch, d_inner)
            dt_t = dt[:, t, :]  # (batch, d_inner)
            dA_t = dA[:, t, :, :]  # (batch, d_inner, d_state)
            dB_t = dB[:, t, :, :]  # (batch, d_inner, 1)
            
            # Update state: h = dA * h + dB * x
            # h_t = A * h_{t-1} + B * x_t
            h = (dA_t * h) + (dB_t * x_t.unsqueeze(-1))  # (batch, d_inner, d_state)
            
            # Output: y = C * h + D * x
            # Using implicit C = 1 (can be extended)
            y_t = torch.sum(h, dim=-1) + self.D * x_t  # (batch, d_inner)
            y_seq.append(y_t)
        
        y = torch.stack(y_seq, dim=1)  # (batch, seq_len, d_inner)
        
        return y


class ResidualMambaBlock(nn.Module):
    """
    Mamba block with residual connection and pre-normalization.
    """
    
    def __init__(
        self,
        d_model: int,
        d_state: int = 16,
        d_conv: int = 4,
        expand: int = 2,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.mamba = MambaBlock(
            d_model=d_model,
            d_state=d_state,
            d_conv=d_conv,
            expand=expand,
            dropout=dropout,
        )
        self.norm = nn.LayerNorm(d_model)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model)
        """
        # Pre-norm
        x_norm = self.norm(x)
        
        # Mamba block
        mamba_out = self.mamba(x_norm)
        
        # Residual connection
        return x + mamba_out


class MambaStack(nn.Module):
    """
    Stack of Mamba blocks with alternating residual connections.
    """
    
    def __init__(
        self,
        d_model: int,
        n_layers: int,
        d_state: int = 16,
        d_conv: int = 4,
        expand: int = 2,
        dropout: float = 0.1,
        use_gradient_checkpoint: bool = False,
    ):
        super().__init__()
        self.d_model = d_model
        self.n_layers = n_layers
        self.use_gradient_checkpoint = use_gradient_checkpoint
        
        self.layers = nn.ModuleList([
            ResidualMambaBlock(
                d_model=d_model,
                d_state=d_state,
                d_conv=d_conv,
                expand=expand,
                dropout=dropout,
            )
            for _ in range(n_layers)
        ])
        
        self.final_norm = nn.LayerNorm(d_model)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model)
        Returns: (batch_size, seq_len, d_model)
        """
        for layer in self.layers:
            if self.use_gradient_checkpoint and self.training:
                x = torch.utils.checkpoint.checkpoint(layer, x, use_reentrant=False)
            else:
                x = layer(x)
        
        x = self.final_norm(x)
        
        return x


class MambaWithCrossAttention(nn.Module):
    """
    Mamba block followed by optional cross-attention for multi-scale processing.
    """
    
    def __init__(
        self,
        d_model: int,
        d_state: int = 16,
        d_conv: int = 4,
        expand: int = 2,
        num_heads: int = 8,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.mamba = ResidualMambaBlock(d_model, d_state, d_conv, expand, dropout)
        
        # Cross-attention for integration with other modalities
        self.cross_attn = nn.MultiheadAttention(
            embed_dim=d_model,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True,
        )
        
        self.norm = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(
        self,
        x: torch.Tensor,
        context: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        x: (batch_size, seq_len, d_model) - Mamba input
        context: (batch_size, context_len, d_model) - Optional context for cross-attention
        
        Returns: (batch_size, seq_len, d_model)
        """
        # Mamba processing
        mamba_out = self.mamba(x)
        
        # Optional cross-attention
        if context is not None:
            attn_out, _ = self.cross_attn(
                mamba_out,  # Query
                context,    # Key, Value
                context,
                need_weights=False
            )
            mamba_out = mamba_out + self.dropout(attn_out)
            mamba_out = self.norm(mamba_out)
        
        return mamba_out


class GatedMambaBlock(nn.Module):
    """
    Mamba block with learned gating for adaptive computation.
    """
    
    def __init__(
        self,
        d_model: int,
        d_state: int = 16,
        d_conv: int = 4,
        expand: int = 2,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.mamba = ResidualMambaBlock(d_model, d_state, d_conv, expand, dropout)
        
        # Gating network
        self.gate_net = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.ReLU(),
            nn.Linear(d_model // 2, 1),
            nn.Sigmoid()
        )
    
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        x: (batch_size, seq_len, d_model)
        Returns: (output, gate_scores)
        """
        # Mamba processing
        mamba_out = self.mamba(x)
        
        # Compute gates
        gate_scores = self.gate_net(x)  # (batch, seq_len, 1)
        
        # Apply gating (element-wise)
        output = mamba_out * gate_scores + x * (1 - gate_scores)
        
        return output, gate_scores
