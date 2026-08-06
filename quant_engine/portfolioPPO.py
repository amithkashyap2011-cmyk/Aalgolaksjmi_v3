"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Portfolio PPO Agent (Track C)
  Research Component for AQEA v2.0
═══════════════════════════════════════════════════════════════════════════════
"""

import numpy as np
import logging
import torch
import torch.nn as nn
from typing import List, Dict

logger = logging.getLogger("AALGO-PORTFOLIO-PPO")

class PortfolioPolicyNetwork(nn.Module):
    """
    Policy network for Portfolio RL.
    Outputs continuous actions for multiple assets.
    """
    def __init__(self, state_dim: int, n_assets: int):
        super().__init__()
        self.common = nn.Sequential(
            nn.Linear(state_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU()
        )
        
        # Capital Allocation: (n_assets) - softmax
        self.allocation_head = nn.Linear(128, n_assets)
        
        # Risk Adjustments: (n_assets) - tanh [-1, 1]
        self.risk_head = nn.Linear(128, n_assets)
        
        # Hedging Intensity: (1) - sigmoid [0, 1]
        self.hedge_head = nn.Linear(128, 1)

    def forward(self, x):
        features = self.common(x)
        
        allocations = torch.softmax(self.allocation_head(features), dim=-1)
        risk_adj = torch.tanh(self.risk_head(features))
        hedge_intensity = torch.sigmoid(self.hedge_head(features))
        
        return allocations, risk_adj, hedge_intensity

class PortfolioPPOAgent:
    """
    Track C: Portfolio PPO.
    Optimizes capital across multiple symbols simultaneously.
    """
    def __init__(self, state_dim: int = 64, n_assets: int = 10):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.state_dim = state_dim
        self.n_assets = n_assets

        self.policy = PortfolioPolicyNetwork(state_dim, n_assets).to(self.device)
        self.policy.eval()
        # Unlike the CNN/PPO-execution/Transformer predictors (which refuse to
        # run without a loaded checkpoint), this network is always random-init
        # — no trained checkpoint exists for this research track yet. Exposed
        # so callers can tell "real prediction" from "untrained noise" instead
        # of the response looking indistinguishable from a live model output.
        self.checkpoint_loaded = False

    def select_action(self, state_vector: List[float], symbols: List[str]) -> Dict:
        """
        Ingests portfolio-level state and returns allocation actions.
        """
        try:
            # Pad/Truncate state vector
            if len(state_vector) < self.state_dim:
                state_vector = state_vector + [0.0] * (self.state_dim - len(state_vector))
            else:
                state_vector = state_vector[:self.state_dim]
                
            state_tensor = torch.FloatTensor(state_vector).unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                allocations, risk_adj, hedge = self.policy(state_tensor)
                
            alloc_np = allocations.cpu().numpy()[0]
            risk_np = risk_adj.cpu().numpy()[0]
            hedge_val = float(hedge.cpu().numpy()[0])
            
            # Map to symbols
            portfolio_map = {}
            for i, symbol in enumerate(symbols[:self.n_assets]):
                portfolio_map[symbol] = {
                    "allocation_weight": float(alloc_np[i]),
                    "risk_adjustment": float(risk_np[i]),
                }
                
            return {
                "portfolio": portfolio_map,
                "hedging_intensity": hedge_val,
                "expected_portfolio_sharpe": 2.5, # Research target
                "modelName": "portfolio-ppo-v1",
                "checkpointLoaded": self.checkpoint_loaded,
            }
        except Exception as e:
            logger.error(f"Portfolio PPO error: {e}")
            return {"error": str(e)}

# Global research instance
portfolio_ppo = PortfolioPPOAgent()
