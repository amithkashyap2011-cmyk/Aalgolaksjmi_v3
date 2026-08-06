import torch
import torch.nn as nn
import math

class TransformerMicroModel(nn.Module):
    """
    AQEA v2.0 Transformer for Market Microstructure
    Focus: Order Flow, Smart Money, and Volume Profiles.
    """
    def __init__(self, input_dim=20, d_model=64, nhead=4, num_layers=3):
        super().__init__()
        self.embedding = nn.Linear(input_dim, d_model)
        self.pos_encoder = nn.Parameter(torch.zeros(1, 100, d_model)) # Max 100 bars for microstructure
        
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        self.head = nn.Sequential(
            nn.Linear(d_model, 32),
            nn.ReLU(),
            nn.Linear(32, 3) # LONG, SHORT, HOLD
        )

    def forward(self, x):
        # x: (b, l, input_dim)
        x = self.embedding(x) + self.pos_encoder[:, :x.size(1), :]
        x = self.transformer(x)
        # Average pooling over sequence length
        x = torch.mean(x, dim=1)
        return self.head(x)
