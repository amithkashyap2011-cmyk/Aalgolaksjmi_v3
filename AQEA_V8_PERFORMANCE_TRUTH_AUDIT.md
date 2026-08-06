# AQEA V8.6 Performance Truth Audit Report

**Timestamp:** 2026-06-14
**Sample Size:** 59,040 Real Market Signals (Binance BTC, ETH, SOL, ADA)
**Audit Method:** Performance Proxy via V8.4 High-Fidelity Historical Data

## Executive Summary
The AQEA V8.6 system, while technically synchronized and stable, currently demonstrates **No Statistical Edge** over real market price action after execution costs. Across all time horizons (15m, 30m, 60m), the profit factor remains near or below 1.0, and expectancy is marginal.

---

## 1. Simulation Results (Net of Fees & Slippage)

| Horizon | Win Rate | Profit Factor | Expectancy | Sharpe Ratio |
| :--- | :--- | :--- | :--- | :--- |
| **15 Minutes** | 42.9% | 0.82 | -0.0006 | -39.1 |
| **30 Minutes** | 46.0% | 0.96 | -0.0002 | -8.7 |
| **60 Minutes** | 47.7% | 1.02 | +0.0001 | 3.8 |

### Key Execution Stats (60m):
- **Average Trade:** +0.01%
- **Median Trade:** -0.06%
- **Max Drawdown:** 8.34% (Relative to starting balance)
- **Total Trades Simulated:** 45,999

---

## 2. Subsystem Alpha Breakdown

| Subsystem | Signal Type | Accuracy | Status |
| :--- | :--- | :--- | :--- |
| **CNN (AI)** | Ensemble Primary | 44.2% | ❌ UNDERPERFORMING |
| **Momentum (Quant)**| Trend-Following | 42.1% | ❌ NOISE |
| **Reversion (Quant)**| Mean-Reversion | 21.2% | ❌ FAILED |
| **Random (Noise)** | Control | 50.1% | ⚠️ BENCHMARK |

---

## 3. Truth Findings

1. **Top Alpha Contributor:** **CNN (AI)**. Although its accuracy is technically below the coin-flip control, it provides the only positive expectancy (+0.0001) in the 60m window, indicating it captures rare but larger-magnitude moves.
2. **Worst Noise Contributor:** **Reversion (Quant)**. Simple mean-reversion logic based on distance-from-MA is currently inverse-correlated with profit in the tested period.
3. **Execution Drag:** Binance taker fees (0.05%) and slippage (0.02%) consume **14 bps per round-trip**, which is significantly higher than the average raw edge produced by the models.

---

## 4. Final Recommendation

### **CONTINUE SHADOW VALIDATION (WITH MODIFICATIONS)**

**Reasoning:**
The system is technically sound but needs an "Alpha Injection" before paper trading. The current models are fighting an uphill battle against execution costs. 

**Required Actions (Pre-Paper):**
1. **Optimize Thresholds:** The 0.4% future return target is too small for a 60m window considering 0.14% costs.
2. **Ensemble Weighting:** Rebalance the ensemble to favor CNN only during high-volatility regimes where moves > 1% are common.
3. **Mamba/Transformer Integration:** These models were offline during this audit. Their long-context memory is likely required to beat the random-walk nature of the current 1m/5m/15m features.

**DO NOT BEGIN PAPER TRADING YET.** The current expectancy does not justify the infrastructure overhead.

---
