# AQEA V10 Production Scorecard

**Timestamp:** 2026-06-14
**Final Verdict:** ⚠️ **SHADOW READY**

## 1. Integrity Scores

| Category | Score | Status |
| :--- | :--- | :--- |
| **Data Integrity** | 68 / 100 | ⚠️ WARNING |
| **AI Integrity** | 82 / 100 | ✅ PASS |
| **Execution Integrity** | 42 / 100 | ❌ FAIL |
| **Risk Integrity** | 100 / 100 | ✅ ELITE |
| **Paper Trade Integrity**| 30 / 100 | ❌ FAIL |

---

## 2. Evidence Summary

### Core Strengths:
- **Resilient AI Pipeline:** Real inference on sequence-based CNN and PPO models. No neutral stubs for core production models.
- **Zero Leakage:** Chronological splitting is strictly enforced in backtesting and training.
- **Robust Gating:** Every trade is audited and gated by Confidence, Regime, and Risk rules.

### Critical Blockers:
- **PnL Inflation:** Paper trading does not account for Binance fees (14bps round-trip). Current positive PnL in DB is likely a "Paper Profit Illusion."
- **Mock Weighting:** The ensemble still uses hardcoded "Mock Performance" history to balance model inputs instead of real-time drift metrics.
- **Mamba Instability:** Incompatible checkpoint means one of the primary research models is offline.

---

## 3. Final Recommendation: **SHADOW READY**

AQEA is not yet ready for Paper Trading or Live Capital. While the logic is robust and the AI is real, the **Performance Reporting is unverified**. 

**Required Actions to reach PAPER READY:**
1.  **Deduct Fees:** Update the `paperState.ts` or `Trade` model to automatically subtract 14bps round-trip costs from all virtual trades.
2.  **Live Weighting:** Replace `mockPerf` in `engine.ts` with real-time accuracy metrics from the `DriftMonitor`.
3.  **Mamba Repair:** Resolve the `state_dict` mismatch or remove the model from the functional registry.

**DO NOT DEPLOY CAPITAL.** The system currently lacks "Financial Reality" in its reporting layer.
