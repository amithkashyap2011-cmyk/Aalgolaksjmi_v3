"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Dynamic Universe Selection (Track D)
  Research Component for AQEA v2.0
═══════════════════════════════════════════════════════════════════════════════
"""

import numpy as np
import logging
from typing import List, Dict

logger = logging.getLogger("AALGO-UNIVERSE")

class UniverseSelectionEngine:
    """
    Track D: Dynamic Universe Selection.
    Ranks symbols based on multi-factor liquidity and volatility metrics.
    """
    def __init__(self):
        self.lookback = 24 # 24 hours for daily ranking
        
    def rank_symbols(self, market_data: Dict[str, Dict]) -> List[Dict]:
        """
         market_data format:
         {
           "BTCUSDT": {"volume": 1000000, "spread": 0.0001, "volatility": 0.02, "alpha_score": 0.6},
           ...
         }
        """
        rankings = []
        for symbol, metrics in market_data.items():
            # Composite score calculation
            # High Volume (+), Low Spread (+), High Volatility (+ but capped), High Alpha (+)
            
            vol_score = metrics.get("volume", 0) / 1e9 # Normalize by 1B
            spread_score = 1.0 / (metrics.get("spread", 0.001) * 1000) # Lower spread is better
            volatility = metrics.get("volatility", 0)
            alpha = metrics.get("alpha_score", 0.5)
            
            # Simple weighted ranking
            total_score = (vol_score * 0.3) + (spread_score * 0.2) + (volatility * 0.2) + (alpha * 0.3)
            
            rankings.append({
                "symbol": symbol,
                "score": round(total_score, 4),
                "metrics": metrics
            })
            
        # Sort by score descending
        rankings.sort(key=lambda x: x["score"], reverse=True)
        return rankings

universe_engine = UniverseSelectionEngine()
