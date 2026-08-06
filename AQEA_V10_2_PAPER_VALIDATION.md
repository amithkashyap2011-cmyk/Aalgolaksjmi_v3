# AQEA V10.2 Paper Validation Report (Interim)

**Timestamp:** 2026-06-14T20:52:50.002997
**Current Sample:** 9 / 100 CLOSED Trades
**Status:** ⚠️ **INSUFFICIENT DATA**

## 1. Core Institutional Metrics (Net Truth)
- **Win Rate:** 77.8% (Target: >= 52%)
- **Profit Factor:** 2.84 (Target: >= 1.30)
- **Expectancy:** 1.19
- **Sharpe Ratio:** 6.88
- **Max Drawdown:** 0.00% (Not enough variance yet)

## 2. Drift Analysis
| Metric | Current | V9.2 Benchmark | Delta |
| :--- | :--- | :--- | :--- |
| Win Rate | 77.8% | 5370.0%% | +24.1% |
| Profit Factor | 2.84 | 1.83 | +1.01 |

## 3. Findings
- **Execution Drag Verified:** Fees and slippage are correctly deducted. Net PF (2.84) is significantly lower than Gross PF (3.59) but remains above the 1.30 promotion gate.
- **Regime Alignment:** 100% of trades occurred in `TRENDING_BEAR` regime. Model is currently 'Bear Hunting' as designed.
- **Alpha Decay:** No evidence of decay yet. Performance is currently exceeding backtest targets.

## 4. Final Verdict
### **REMAIN PAPER**
Total of 91 additional trades required for certification.
