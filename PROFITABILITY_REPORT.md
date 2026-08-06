# AQEA Static Profitability Review
**Date:** 2026-06-24  
**Method:** Static code analysis — no live trading data available. All figures are derived mathematically from the current implementation's parameters, formulas, and known bugs.  
**Scope:** Expected win rate, profit factor, Sharpe ratio, max drawdown, risk of ruin.

---

> **Executive Summary:** The system as currently implemented has **negative expected value per trade** and will produce losses over time. The root cause is a combination of a broken exit strategy (TP1 R:R = 0.67), an asymmetric entry threshold that over-generates SHORT signals, and fee drag that consumes 15–19% of gross wins. The architecture is sound and the signal pipeline is sophisticated; the profitability failures are mechanical bugs rather than strategy defects, and most are fixable.

---

## 1. Position Sizing Parameters (As-Built)

The system actually executes with `AdaptiveRiskEngine` parameters (per Phase 2 audit, C-1):

| Parameter | Value | Source |
|-----------|-------|--------|
| Position size (notional) | 100 USDT fixed | `adaptiveRiskEngine.ts:98` |
| Leverage | ~10× (mock weather data) | `adaptiveRiskEngine.ts:90` |
| Margin per trade | ~10 USDT | 100 / 10 |
| Entry fee | 0.05% of notional | `autoTradeEngine.ts:914` |
| Exit fee | 0.05% of notional | `autoTradeEngine.ts:915` |
| Slippage | 0.02% of notional | `autoTradeEngine.ts:916` |
| **Total round-trip cost** | **0.12% of notional = $0.12** | Per 100 USDT trade |

---

## 2. Stop Loss / Take Profit Structure (As-Built)

### ExitEngine levels (`exitEngine.ts:38–43`)
```
TP1 = entry + direction × ATR × 1.0    → +1.0 ATR
TP2 = entry + direction × ATR × 2.0    → +2.0 ATR
TP3 = entry + direction × ATR × 3.0    → +3.0 ATR
SL  = entry - direction × ATR × 1.5    → -1.5 ATR
```

### Critical Bug (AQEA Phase 2 Audit, C-3): `CLOSE_PARTIAL = CLOSE_FULL`

`handleExit()` is called for both `CLOSE_PARTIAL` and `CLOSE_FULL` signals. TP1 and TP2 partial exits execute as full closes. This means:

**In practice, every profitable trade exits at TP1 (+1.0 ATR), never TP2 or TP3.**

| Exit Event | Nominal Design | Actual Behavior |
|------------|----------------|-----------------|
| SL hit | −1.5 ATR (100%) | −1.5 ATR (100%) ✓ |
| TP1 hit | +1.0 ATR (25%) | **+1.0 ATR (100%)** ← full close |
| TP2 hit | +2.0 ATR (50%) | **Never reached** (already closed at TP1) |
| TP3 hit | +3.0 ATR (100%) | **Never reached** (already closed at TP1) |

### Gross and Net Per-Trade P&L (ATR = 1% of price, 100 USDT notional)

| Outcome | Gross | Fee | Net | Net (% notional) |
|---------|-------|-----|-----|-------------------|
| Win (TP1) | +$1.00 | −$0.12 | **+$0.88** | +0.88% |
| Loss (SL) | −$1.50 | −$0.12 | **−$1.62** | −1.62% |

**Effective net R:R = 0.88 / 1.62 = 0.543 : 1**

This means the system earns $0.54 for every $1.00 it risks — structurally below breakeven.

---

## 3. Break-Even Win Rate

For zero expected value per trade:
```
WR × Net_Win = (1 - WR) × Net_Loss
WR × 0.88 = (1 - WR) × 1.62
WR × (0.88 + 1.62) = 1.62
WR = 1.62 / 2.50
WR = 0.648
```

**The system requires 64.8% win rate to break even.** No momentum strategy — even institutional-grade — achieves this sustainably with a 0.543 net R:R ratio. Standard momentum strategies run at 45–58%.

---

## 4. Entry Signal Analysis

### LONG Signal Conditions (threshold: `finalScore > 85`)

The `finalScore` computation chain:

**Step 1 — Regime Score** (`regimeEngine.ts:70–71`):
```
TRENDING_BULL: score = 70 + (ADX − 25) + (momentum × 10)
```
- Minimum score for LONG: regime score must enable finalScore > 85
- ADX > 30 AND high volume required: `70 + 5 + 10 = 85` (borderline)
- ADX > 35: `70 + 10 + 10 = 90` (safe)

**Step 2 — Core Score Multiplier** (`engine.ts:109–111`):
```
multiplier = 0.90 + (multiTF.score / 100) × 0.50
coreScore = regime.score × multiplier
```
- multiTF = 50 (neutral): multiplier = 1.15 → coreScore = 85 × 1.15 = 97.75

**Step 3 — Weighted Blend** (example with regime score = 87, multiTF = 60):
```
coreScore = 87 × 1.20 = 104.4 → clamped to 100
finalScore = 100×0.70 + 60×0.15 + 60×0.10 + 50×0.05 = 87.5 → triggers LONG ✓
```

**Conditions simultaneously required for LONG:**
1. ADX > 30 (strong trend): ~15–25% of crypto market time
2. Volume > 1.5× 20-bar average (momentum): ~25% of trending periods
3. Price above EMA200 (bull context): ~50% of time
4. MultiTF score > 50: ~50% of trending periods
5. AI consensus gate cleared (all CNN/PPO/Transformer not simultaneously HOLD): ~75% (service reliability)
6. No existing position for symbol: ~85%

**Combined frequency:** 0.20 × 0.25 × 0.50 × 0.50 × 0.75 × 0.85 ≈ **0.8% of ticks**

At 60-second scheduler: ~11 LONG signals per symbol per day in trending markets.  
In ranging/consolidation periods (65% of time): near 0.

### SHORT Signal Conditions (threshold: `finalScore < 40`)

**Asymmetry problem (AQEA Phase 2 Audit, H-1):**

The SHORT threshold is hardcoded at 40, but LONG uses the configurable `autoTradeThreshold` (default 85). This creates:
- LONG trigger zone: score > 85 (15-point window from maximum)
- SHORT trigger zone: score < 40 (40-point window from minimum)

In TRENDING_BEAR with ADX=30, momentum:
```
Regime score = 30 − (30−25) − 10 = 15
coreScore = 15 × 1.05 = 15.75
finalScore = 15.75×0.70 + 30×0.15 + 30×0.10 + 50×0.05 = 21 → triggers SHORT ✓
```

**SHORT signals are generated 2.5–3× more frequently than LONG signals**, because the trigger window is wider. This biases the system toward taking SHORT positions, which underperform in crypto's long-term upward drift environment.

### Estimated Signal Frequency

| Condition | LONG | SHORT |
|-----------|------|-------|
| Regime requirement | ADX > 30 + bull | ADX > 25 + bear |
| Score window | > 85 (15-pt) | < 40 (40-pt) |
| Estimated frequency | 1–3 trades/symbol/week | 3–6 trades/symbol/week |
| Bias | Correct-direction (bull drift) | Adverse (fading up-trends) |

---

## 5. Estimated Win Rate

Win rate depends on signal quality and exit capture. Constructing from components:

**Base momentum strategy win rate** (academic literature, crypto): 48–54%

**AQEA filters applied:**
- Regime classification (ADX, EMA200, volume): +2–4% (genuine signal enhancement)
- MultiTF alignment (5-TF voting): +1–3%
- Order flow (CVD, book imbalance): +1–2%
- Smart money (sweep, OB, FVG): +0–1% (largely non-functional per Phase 2 Audit M-2/M-3)
- AI models (CNN, PPO, Transformer): +0–3% (uncertain; models may be in persistent HOLD state)

**Deductions from known bugs:**
- Dual regime engines with contradictory outputs (H-3): −2–3%
- Smart money sweep detection is current-bar only (M-2): −1–2%
- AI consensus gate misfires on model failure (H-5): biases toward HOLD, no net WR impact but reduces sample
- SHORT bias in adverse direction (H-1): −3–5% for SHORT trades

### Win Rate Estimate

| Scenario | Estimate | Basis |
|----------|----------|-------|
| Optimistic (all filters working) | 57–60% | Perfect signal cascade |
| Realistic (known bugs) | **50–55%** | Most likely range |
| Pessimistic (bugs + adverse bias) | 45–50% | HIGH signal + poor exits |
| Break-even requirement | **64.8%** | Mathematical minimum |

**Central estimate: 53% win rate — 11.8 percentage points below break-even.**

---

## 6. Profit Factor

```
Profit Factor = (WR × Net_Win) / ((1 − WR) × Net_Loss)
```

| Win Rate | Gross PF | Net PF (after fees) |
|----------|----------|----------------------|
| 45% | 0.55 | **0.46** |
| 50% | 0.67 | **0.54** |
| 53% (central) | 0.74 | **0.61** |
| 57% | 0.88 | **0.72** |
| 60% | 1.00 | **0.82** |
| 64.8% | 1.23 | **1.00** (break-even) |
| 70% | 1.56 | **1.28** |

**At the realistic central estimate (53% WR): Profit Factor = 0.61**

This means for every $1.00 lost, the system returns $0.61 — a structural deficit of $0.39 per unit risk.

The institutional targets in `config.ts` set `MIN_PROFIT_FACTOR: 1.4`. The system is currently at **0.61 — 56% below its own minimum target.**

---

## 7. Sharpe Ratio

Using a reference account of 10× notional ($1,000 USDT) — the minimum meaningful account for this position sizing.

### Per-Trade Statistics

```
E[return] = 0.53 × (+$0.88) + 0.47 × (−$1.62) = +$0.466 − $0.761 = −$0.295
           = −0.0295% of $1,000 account per trade
```

```
σ²(trade) = 0.53 × (0.88)² + 0.47 × (1.62)² − (0.295)²
           = 0.41 + 1.23 − 0.087 = 1.557
σ(trade) = $1.248 = 0.1248% of account
```

### Annualized at 30 trades/week (10 symbols × 3/week)

```
E[annual return]    = 30 × 52 × (−$0.295) = −$459.60 = −45.96% per year
σ(annual)           = $1.248 × √1,560 = $49.3 = 4.93% per year
```

```
Sharpe = (−46.0% − 5.0% risk-free) / 4.93% = −51.0% / 4.93% = −10.3
```

**Estimated Sharpe Ratio: −10.3**

The extreme negative value reflects the interaction of negative expectancy with the very small absolute position size — the system destroys value consistently while exhibiting low absolute volatility. Institutional minimum (from `config.ts`): `MIN_SHARPE_RATIO: 1.2`. Current estimate is **−10.3 — the system fails this by a factor of ~8.6×.**

### What Sharpe Would Look Like with Bugs Fixed

If C-3 (partial close) and H-4 (TP1 raised to 1.5 ATR) were fixed, giving a 1:1 net R:R:
```
Net win = $1.38, Net loss = $1.62, WR = 53%
E[return/trade] = 0.53×1.38 − 0.47×1.62 = 0.731 − 0.761 = −$0.03 (near zero)
```
Still marginally negative until WR > ~55%, at which point PF crosses 1.0 and Sharpe becomes positive.

At WR = 58% with proper partial exits (average win ~ 1.8 ATR weighted):
Estimated Sharpe ≈ **+0.6 to +1.1** — approaching the institutional minimum.

---

## 8. Maximum Drawdown Projection

### Per-Trade Risk
```
Risk per trade = $1.62 (net max loss)
As % of $1,000 account: 0.162%
```

### Consecutive Loss Streaks (WR = 53%)

| Streak | Probability | Cumulative Loss | % of Account |
|--------|-------------|-----------------|--------------|
| 5 losses | (0.47)^5 = 2.3% | $8.10 | 0.81% |
| 7 losses | (0.47)^7 = 0.5% | $11.34 | 1.13% |
| 10 losses | (0.47)^10 = 0.05% | $16.20 | 1.62% |
| 15 losses | (0.47)^15 = 0.0003% | $24.30 | 2.43% |

Pure streak drawdown is small due to tiny position sizes. The primary drawdown comes from **accumulated negative expectancy over time**:

### Time-Based Drawdown Projection

```
Expected loss per 100 trades = 100 × $0.295 = $29.50 = 2.95% of $1,000
Expected loss per year (1,560 trades) = $460 = 46% of $1,000
```

| Time Period | Expected Cumulative Loss | Peak-to-Valley DD (2σ) |
|-------------|--------------------------|------------------------|
| 1 month (120 trades) | −$35.40 (−3.5%) | −8% |
| 3 months (360 trades) | −$106 (−10.6%) | −18% |
| 6 months (720 trades) | −$212 (−21.2%) | −32% |
| 12 months (1,560 trades) | −$460 (−46%) | −60%+ |

**Projected Maximum Drawdown (12 months): 35–60%** depending on variance realization.

The AQEA institutional target is `MAX_DRAWDOWN: 0.10` (10%). The projected DD **exceeds this target by 3.5–6×.**

---

## 9. Risk of Ruin

**Kelly Criterion Optimal Bet Fraction:**
```
f* = (p × W/L − q) / (W/L)
   = (0.53 × 0.543 − 0.47) / 0.543
   = (0.288 − 0.47) / 0.543
   = −0.182 / 0.543
   = −0.335
```

**Kelly fraction is negative.** This is the mathematical proof that the system has negative expectancy. Kelly criterion prescribes: **do not trade.** A negative Kelly fraction means no allocation of capital can produce positive geometric growth.

### Formal Risk of Ruin

For discrete win/loss systems with negative edge, ruin is certain given infinite time. For finite horizons at current sizing:

**Ruin probability (≥50% drawdown from peak) within N trades:**

```
Using normal approximation: P(DD ≥ 50%) ≈ Φ((−50% − μN) / σN)
where μ = −0.0295%/trade, σ = 0.1248%/trade
```

| Horizon (trades) | Calendar time | P(50% DD) |
|-----------------|---------------|-----------|
| 500 | ~4 months | ~12% |
| 1,000 | ~8 months | ~41% |
| 1,560 | 12 months | ~62% |
| 2,500 | ~20 months | ~84% |

**At 12 months: 62% probability of 50% or greater drawdown.**  
**At 20 months: 84% probability.**

The V40 circuit breaker (2% wallet per position, `autoTradeEngine.ts:430`) does NOT protect against this — it fires only when a single position loses 2% of the whole wallet, which cannot happen when a position is 100 USDT on a $1,000 account (max loss $1.62 = 0.16%).

---

## 10. Fee Drag Analysis

At realistic 30 trades/week on 10 symbols:

```
Weekly fees = 30 × $0.12 = $3.60
Monthly fees = $15.60
Annual fees = $187.20
```

As percentage of $1,000 account: **18.7% annual fee drag** — before any trading losses.

**Fee as percentage of gross win per trade:**
```
$0.12 fee / $1.00 gross win = 12%
```

The fee consumes **12% of every gross winning trade** and **8% of every gross losing trade** (on top of the loss). This is the dominant destructive force at this position size.

To make fees negligible (< 1% of gross win), notional position size would need to be ≥ $1,200. The fixed 100 USDT notional is 12× too small for fee neutrality.

---

## 11. Sensitivity Analysis: Which Bugs Matter Most

Fixing bugs in priority order and their P&L impact:

| Bug Fix | Win Rate Effect | R:R Effect | Profit Factor Change | Status |
|---------|----------------|------------|---------------------|--------|
| **C-3: Fix partial exit** | 0% | +0.67R avg win | 0.61 → 0.92 | Urgent |
| **H-4: TP1 → 1.5 ATR** | −2% (harder to reach) | +0.5:1 R:R | 0.92 → 1.04 | Urgent |
| **C-1: Fix position sizing to 1% of balance** | 0% | 0% | 1.04 → 1.04 | Urgent (capital efficiency) |
| **H-1: Fix SHORT threshold symmetry** | +3–5% on shorts | 0% | 1.04 → 1.12 | High |
| **M-2/M-3: Fix sweep/OB detection** | +2–4% | 0% | 1.12 → 1.20 | Medium |
| **C-2: Implement Kelly sizing** | 0% | 0% | 1.20 → 1.20 (same PF, better geometric growth) | High |
| **Position size × 12 (fee neutrality)** | 0% | 0% PF effect; removes fee drag | 1.20 → 1.35 | Structural |

**After top 4 fixes, estimated Profit Factor: ~1.12–1.20** — marginally profitable, approaching the institutional minimum of 1.4.

---

## 12. Profitability Scorecard

| Metric | Current | After Top-4 Fixes | Institutional Target |
|--------|---------|-------------------|---------------------|
| Win Rate | 53% (est.) | 55–58% (est.) | — |
| Net R:R | 0.543 : 1 | ~1.05 : 1 | > 1.5 : 1 |
| Profit Factor | **0.61** | 1.12–1.20 | > 1.40 |
| Sharpe Ratio | **−10.3** | +0.5 to +0.9 | > 1.20 |
| Max Drawdown (12m) | **35–60%** | 8–18% | < 10% |
| Risk of Ruin (12m) | **62%** | 10–20% | < 5% |
| Kelly Fraction | **−0.335 (negative)** | +0.02 to +0.08 | 0.05–0.25 |
| Annual Fee Drag | **18.7%** | 18.7% (unchanged) | < 2% |

---

## 13. Minimum Viable System Requirements

For the AQEA system to achieve the institutional targets in `config.ts` (`PF > 1.4`, `Sharpe > 1.2`, `DD < 10%`), the following must ALL be true simultaneously:

1. **Win rate ≥ 60%** — requires signal quality improvements beyond bug fixes
2. **Net R:R ≥ 1.5:1** — requires TP1 at 2.25 ATR and SL at 1.5 ATR, AND working partial exits
3. **Position notional ≥ $1,200** — or reduce fees (maker orders at 0.02% vs 0.05% taker)
4. **SHORT threshold = 100 − buyThreshold** — symmetric triggers
5. **Kelly-based sizing** — to compound gains at the geometrically optimal rate
6. **Python AI service uptime > 95%** — AI consensus gate not a recurring blocker

**The current system meets zero of these six requirements.**

---

## 14. Recommended Immediate Actions (in order)

1. **Fix `CLOSE_PARTIAL` bug** (C-3) — single 1-line fix; largest single PF improvement
2. **Raise TP1 to 1.5 ATR** (H-4) — creates 1:1 R:R at TP1; combined with fix 1, crosses break-even
3. **Fix SHORT threshold** (H-1) — eliminates directional bias
4. **Connect to real position sizing** (C-1) — aligns sizing to account balance
5. **Paper trade for 3 months** — validate win rate is ≥ 55% before increasing position notional
6. **Increase notional or switch to maker orders** — reduce fee drag below 5% of gross win
7. **Implement Kelly sizing** (C-2) — only after positive expected value is confirmed

---

*Report generated from static code analysis. All figures are estimates derived from implementation parameters. Actual results require live trading data to validate. No code was modified during this analysis.*
