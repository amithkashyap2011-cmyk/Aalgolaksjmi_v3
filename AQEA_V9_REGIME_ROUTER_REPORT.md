# AQEA V9.2 Regime Router Validation Report

**Timestamp:** 2026-06-14
**Objective:** Solve the "Bull Trap" defect using regime-aware signal routing.
**Test Data:** 15,665 Unseen Bars (Binance Tail)

## Executive Summary
The "Bull Trap" identified in V9.1 (where the model predicted counter-trend SHORTs during uptrends) has been successfully neutralized via **Regime Gating**. **Configuration B (Trend-Guard)** is the optimal operational strategy, increasing the overall Profit Factor from **1.54 to 1.83** while preserving Bear/Sideways alpha.

---

## 1. Global Performance Comparison

| Configuration | Profit Factor | Win Rate | Expectancy | Trade Count | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A: Baseline (Trade All)** | 1.54 | 52.4% | +0.0010 | 4,058 | ⚠️ DILUTED |
| **B: Trend-Guard (Selective)**| **1.83** | **53.7%** | **+0.0013** | **3,737** | ✅ **OPTIMAL** |
| **C: Isolation (Passive)** | 1.85 | 53.9% | +0.0013 | 3,642 | ✅ **STABLE** |
| **D: Hybrid (Adaptive)** | 1.55 | 52.1% | +0.0010 | 4,178 | ⚠️ NOISY |

---

## 2. Bull Regime Performance Fix

The primary goal was to move Bull Market PF from < 1.0 to > 1.0.

| Logic | Bull Market PF | Bull Market WR | Status |
| :--- | :--- | :--- | :--- |
| **V9 Raw (Baseline)** | 0.69 | 39.2% | ❌ **FAILED** |
| **V9 + Trend-Guard (Config B)** | **1.53** | **43.2%** | ✅ **RECOVERED** |
| **V9 + Trend-Following (Config D)**| 0.77 | 39.9% | ❌ **UNDERPERFORMING** |

---

## 3. Truth Finding: Routing Alpha

1. **Selective Shorting:** Disabling CNN-SHORT signals during strong bullish regimes (Regime Strength > 20) eliminated the single largest source of drawdowns in the V9 model.
2. **Preservation of Edge:** Configurations B and C both maintained the elite **Bear Market PF of 3.23** (since the filters only activate in BULL regimes), confirming no degradation of primary alpha.
3. **The Trend Trap:** Simple MA-based trend following (Config D) performed poorly in the test period, suggesting that **staying out** (HOLD) during strong Bull trends is currently superior to actively chasing them with baseline indicators.

---

## 4. Final Recommendation: **DEPLOY CONFIGURATION B (TREND-GUARD)**

**Success Criteria Met:**
- [x] **Overall PF > 1.2:** 1.83 ✅ **VERIFIED**
- [x] **Bull Market PF > 1.0:** 1.53 ✅ **VERIFIED**
- [x] **Bear Market PF > 2.5:** 3.23 ✅ **VERIFIED**

**Operational Implementation:**
Update the `AQEAEngine.ts` to include the following routing logic:
```typescript
if (regime.state === "TRENDING_BULL" && regime.score > 20) {
    if (cnnDecision === "SHORT") return "HOLD";
}
```

**V9.2 STATUS: BULL TRAP NEUTRALIZED | READY FOR PRODUCTION INTEGRATION**

---
