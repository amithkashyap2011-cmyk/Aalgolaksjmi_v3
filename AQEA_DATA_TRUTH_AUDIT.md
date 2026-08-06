# AQEA Data Truth Audit (V10)

**Timestamp:** 2026-06-14

## Executive Summary
The system has successfully transitioned many components from mock to real, but significant "Mock Residue" remains in the ensemble weighting and paper-trading PnL calculations. While the AI inference is real, the performance metrics generated so far are technically **Simulated/Optimistic**.

---

## 1. Data Source Classification

| Source | Classification | Trust Level | Production Safe | Observation |
| :--- | :--- | :--- | :--- | :--- |
| **Binance API** | **REAL** | HIGH | YES | REST + WS implementation verified. |
| **Market Indicators** | **REAL** | HIGH | YES | `indicatorService.ts` uses real price data. |
| **CNN Inference** | **REAL** | HIGH | YES | Uses `cnn_1d_v9.pt` sequence model. |
| **PPO Inference** | **REAL** | HIGH | YES | Uses `ppo_execution_v1.pt`. |
| **Transformer** | **REAL** | MEDIUM | YES | Functional but research-only. |
| **Mamba** | **FAIL** | LOW | NO | Incompatible checkpoint detected. |
| **Paper PnL** | **SIMULATED** | LOW | **NO** | Calculated with **0 fees and 0 slippage** in DB. |
| **Ensemble Weights** | **MOCK** | LOW | **NO** | Uses `mockPerf` object in `engine.ts`. |
| **Shadow Outcomes** | **SIMULATED** | MEDIUM | YES | Resolved via historical Binance klines. |
| **LSTM / xLSTM** | **MOCK** | ZERO | NO | STUBS only. |

---

## 2. Flagged Items

- **Hardcoded Ensemble Performance:** `server/src/services/aqea/engine.ts` (L237) uses hardcoded win rates for weighting subsystems instead of live drift metrics.
- **Fake Paper PnL:** Database records for `PAPER` trades do not subtract fees or account for bid/ask spread.
- **Indicator Mock:** `quant_engine/train_cnn_v8.py` uses simplified mocks for common indicators.
- **Bayesian Opt Stub:** `quant_engine/alpha_lab/discovery.py` contains structural stubs with no implementation.

---

## 3. Truth Rating: **68/100**
The core engine is functional and uses real market data, but the "Success Metrics" (PnL, PF) reported in validation phases are currently unadjusted for execution reality.
