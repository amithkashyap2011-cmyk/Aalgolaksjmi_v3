# AQEA Execution Realism Audit (V10)

**Timestamp:** 2026-06-14

## 1. Fee Assumption Audit

| Environment | Maker Fee | Taker Fee | Slippage | Total Drag |
| :--- | :--- | :--- | :--- | :--- |
| **Binance Reality (VIP 0)** | 0.02% | **0.05%** | ~0.02% | **14 bps** |
| **Backtest Engine** | 0.00% | **0.04%** | **0.02%** | **12 bps** |
| **Paper Trade (Live)** | 0.00% | **0.00%** | **0.00%** | **0 bps** |

**CRITICAL FINDING:** Paper trading results are **NOT REALISTIC**. They currently report performance assuming zero fees and zero slippage, overstating the edge by ~14 bps per trade.

## 2. Performance Comparison

| Metric | Backtest (Assumed) | Paper (Actual DB) | Reality (Adjusted) |
| :--- | :--- | :--- | :--- |
| **Profit Factor** | 1.83 | **3.79** | **~1.15** |
| **Win Rate** | 53.7% | 100% (n=6) | **~50%** |

## 3. Latency Audit
- **Inference Latency:** 20-50ms (Quant Engine).
- **Network Latency:** 150-300ms (Binance API from local).
- **Execution Lag:** ~350ms total.

---

## Execution Score: **42/100**
The backtest engine is realistic, but the **Paper Trading Monitor is misleading**. The 0% fee assumption in the database is a major blocker to production readiness.
