import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class MambaBlock(nn.Module):
    """
    Simplified Mamba (Selective SSM) Block
    """
    def __init__(self, d_model, d_state=16, d_conv=4, expand=2):
        super().__init__()
        self.d_model = d_model
        self.d_state = d_state
        self.d_conv = d_conv
        self.expand = expand
        self.d_inner = int(self.expand * self.d_model)

        self.in_proj = nn.Linear(self.d_model, self.d_inner * 2, bias=False)
        self.conv1d = nn.Conv1d(
            in_channels=self.d_inner,
            out_channels=self.d_inner,
            bias=True,
            kernel_size=d_conv,
            groups=self.d_inner,
            padding=d_conv - 1,
        )

        self.x_proj = nn.Linear(self.d_inner, self.d_state * 2 + 1, bias=False)
        self.dt_proj = nn.Linear(1, self.d_inner, bias=True)

        # S4D real initialization
        A = torch.arange(1, self.d_state + 1, dtype=torch.float32).repeat(self.d_inner, 1)
        self.A_log = nn.Parameter(torch.log(A))
        self.D = nn.Parameter(torch.ones(self.d_inner))
        self.out_proj = nn.Linear(self.d_inner, self.d_model, bias=False)

    def forward(self, x):
        # x: (b, l, d)
        (b, l, d) = x.shape
        x_and_res = self.in_proj(x)  # (b, l, 2*d_in)
        (x, res) = x_and_res.split(split_size=[self.d_inner, self.d_inner], dim=-1)

        x = x.transpose(1, 2)
        x = self.conv1d(x)[:, :, :l]
        x = x.transpose(1, 2)

        x = F.silu(x)

        # Selective SSM
        x_dbl = self.x_proj(x)  # (b, l, dt_rank + 2*d_state)
        (dt, B, C) = x_dbl.split(split_size=[1, self.d_state, self.d_state], dim=-1)
        dt = F.softplus(self.dt_proj(dt))  # (b, l, d_inner)

        A = -torch.exp(self.A_log)  # (d_inner, d_state)

        # Selective Scan (Simple loop for research, can be optimized)
        y = self.selective_scan(x, dt, A, B, C, self.D)
        
        out = y * F.silu(res)
        return self.out_proj(out)

    def selective_scan(self, u, dt, A, B, C, D):
        # u: (b, l, d_in), dt: (b, l, d_in), A: (d_in, d_state), B: (b, l, d_state), C: (b, l, d_state), D: (d_in)
        (b, l, d_in) = u.shape
        d_state = A.shape[1]
        
        # Discretization
        # A_bar = exp(dt * A)
        # B_bar = dt * B
        
        # This is a simplified sequential scan for research purposes
        # In production v2, this would be a fused CUDA kernel or parallel prefix sum
        h = torch.zeros(b, d_in, d_state, device=u.device)
        ys = []
        for i in range(l):
            dt_i = dt[:, i, :].unsqueeze(-1)  # (b, d_in, 1)
            A_i = A.unsqueeze(0)  # (1, d_in, d_state)
            A_bar = torch.exp(dt_i * A_i)
            
            B_i = B[:, i, :].unsqueeze(1)  # (b, 1, d_state)
            B_bar = dt_i * B_i
            
            u_i = u[:, i, :].unsqueeze(-1)  # (b, d_in, 1)
            h = A_bar * h + B_bar * u_i
            
            C_i = C[:, i, :].unsqueeze(-1)  # (b, d_state, 1)
            y_i = torch.matmul(h, C_i).squeeze(-1)  # (b, d_in)
            ys.append(y_i)
            
        y = torch.stack(ys, dim=1)  # (b, l, d_in)
        y = y + u * D
        return y

class MambaModel(nn.Module):
    def __init__(self, d_model=16, n_layers=2, d_state=16):
        super().__init__()
        self.layers = nn.ModuleList([MambaBlock(d_model, d_state) for _ in range(n_layers)])
        self.norm = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, 3) # LONG, SHORT, HOLD

    def forward(self, x):
        for layer in self.layers:
            x = layer(x) + x
        x = self.norm(x)
        # Take last time step for prediction
        return self.head(x[:, -1, :])
