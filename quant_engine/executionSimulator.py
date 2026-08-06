"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Realistic Execution Simulator (Track F)
  Research Component for AQEA v2.0
═══════════════════════════════════════════════════════════════════════════════
"""

import numpy as np
import logging
from typing import List, Dict

logger = logging.getLogger("AALGO-SIMULATOR")

class ExecutionSimulator:
    """
    Track F: Realistic Execution Simulator.
    Models microstructure frictions: slippage, partial fills, liquidity decay.
    """
    def __init__(self, latency_ms=50):
        self.latency_ms = latency_ms
        
    def simulate_execution(self, order_type: str, side: str, amount: float, price: float, 
                           order_book: Dict, volatility: float) -> Dict:
        """
        Calculates realistic fill price and quantity.
        """
        try:
            # 1. Apply Latency Slippage
            # Drift price by volatility during latency
            slippage_drift = price * (volatility * np.sqrt(self.latency_ms / 3.6e6))
            execution_price = price + slippage_drift if side == "BUY" else price - slippage_drift
            
            # 2. Model Liquidity Decay
            # If amount is large relative to book depth, slippage increases
            bids = order_book.get("bids", [])
            asks = order_book.get("asks", [])
            
            # Simple linear slippage model based on amount vs book depth
            # (In a real simulator, we would traverse the book)
            book_depth = sum([b[1] for b in bids]) if side == "SELL" else sum([a[1] for a in asks])
            liquidity_impact = (amount / max(1, book_depth)) * 0.05 * execution_price
            
            final_price = execution_price + liquidity_impact if side == "BUY" else execution_price - liquidity_impact
            
            # 3. Model Partial Fills
            fill_pct = 1.0
            if amount > book_depth * 0.5:
                fill_pct = 0.8 # Only 80% filled if taking 50% of the book
                
            return {
                "filled_amount": amount * fill_pct,
                "average_fill_price": round(final_price, 6),
                "slippage_bps": round(((final_price - price) / price) * 10000, 2),
                "fill_status": "FULL" if fill_pct == 1.0 else "PARTIAL",
                "latency_impact_ms": self.latency_ms
            }
        except Exception as e:
            logger.error(f"Execution simulation error: {e}")
            return {"error": str(e)}

execution_simulator = ExecutionSimulator()
