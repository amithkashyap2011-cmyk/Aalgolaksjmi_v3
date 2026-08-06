# AQEA Profitability Recovery Plan
**Version:** 1.0 | **Date:** 2026-06-24 | **Status:** PLAN — DO NOT IMPLEMENT YET

---

## Executive Summary

The AQEA system has a sophisticated 3-tier exit engine that is effectively disabled by a single bug.
Every trade — regardless of signal strength — exits at the first take-profit level due to
`CLOSE_PARTIAL` calling the same full-exit handler as `CLOSE_FULL`. Combined with TP1 set at
1.0 ATR against a 1.5 ATR stop-loss (R:R = 0.67), the system is structurally unprofitable.

This document identifies the minimum changes needed to restore theoretical profitability and
validates each component of the risk/sizing stack.

---

## 1. Fix C-3: CLOSE_PARTIAL Execution Bug

### Current Behaviour

**File:** `server/src/services/autoTradeEngine.ts:501–506`

```typescript
if (managementSignal.action === "CLOSE_FULL") {
    await handleExit(userId, symbol, mode, accountType, managementSignal.reason);
    return;
} else if (managementSignal.action === "CLOSE_PARTIAL") {
    await handleExit(userId, symbol, mode, accountType, managementSignal.reason);  // ← BUG: same call
    return;
}
```

`handleExit()` (line 890–948) always exits 100% of the position. It has no `qtyPct` parameter.
The `managementSignal.qtyPct` field (which correctly contains `0.25` for TP1 and `0.50` for TP2)
is discarded entirely.

**Same bug exists in the fallback ExitEngine path (line 530–532):**

```typescript
if (exitSignal.shouldExit) {
    await handleExit(userId, symbol, mode, accountType, exitSignal.reason);  // ← no type check
}
```

Even when `exitSignal.type === "PARTIAL"`, this calls a full exit.

### Impact of Bug

- Every winning trade exits 100% at TP1 (first level reached).
- TP2 and TP3 are never reached — the position is gone before price can travel further.
- Break-even stop movement after TP1 is never triggered (no partial close to set state).
- Trailing stop after TP2 is never activated.
- The `tp1Hit`, `tp2Hit`, `tp3Hit` flags in `pos.meta` are never set, so the system
  cannot distinguish which stage a trade is at even if the bug were partially fixed.

### Required Fix

`handleExit()` must accept `qtyPct: number` and execute a partial close when `qtyPct < 1.0`:

```typescript
// Signature change:
async function handleExit(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: string = "FUTURES",
  reason: string = "MANUAL",
  qtyPct: number = 1.0          // ← new param
): Promise<void>
```

**For PARTIAL exits, the handler must:**
1. Calculate `closeQty = pos.quantity * qtyPct`
2. Place a market order for `closeQty` only (not the full position)
3. Credit PnL proportionally (`grossPnl * qtyPct`)
4. Update `pos.quantity -= closeQty` (keep position open with reduced size)
5. Update `pos.meta.tp1Hit = true` (or `tp2Hit`) to prevent re-triggering same TP level
6. Call `paper.setPosition()` with the updated (not removed) position
7. NOT call `paper.removePosition()` unless `qtyPct >= 1.0`

**Call site fixes:**
```typescript
// CLOSE_PARTIAL from PositionManager:
} else if (managementSignal.action === "CLOSE_PARTIAL") {
    await handleExit(userId, symbol, mode, accountType, managementSignal.reason, managementSignal.qtyPct);
    return;
}

// Fallback ExitEngine:
if (exitSignal.shouldExit) {
    const pct = exitSignal.type === "PARTIAL" ? exitSignal.qtyPct : 1.0;
    await handleExit(userId, symbol, mode, accountType, exitSignal.reason, pct);
    if (pct < 1.0) return;  // Keep processing; don't early-return if partial
}
```

---

## 2. Raise TP1 from 1.0 ATR to 1.5 ATR

### Current Levels

**File:** `server/src/services/aqea/exitEngine.ts:39–43`

```typescript
tp1: entryPrice + (direction * effectiveAtr * 1.0),   // 1.0 ATR — R:R = 0.67
tp2: entryPrice + (direction * effectiveAtr * 2.0),
tp3: entryPrice + (direction * effectiveAtr * 3.0),
sl:  entryPrice - (direction * effectiveAtr * 1.5),   // 1.5 ATR stop
```

### Problem

At TP1 = 1.0 ATR and SL = 1.5 ATR, the first exit ratio is 0.67:1 — negative expectancy.
A strategy needs to win 60%+ of trades just to break even at TP1 alone. No momentum strategy
achieves that consistently.

### R:R Analysis by Level

| Level | ATR Multiple | R:R vs SL | Break-even Win Rate |
|-------|-------------|-----------|---------------------|
| TP1 (current) | 1.0 | **0.67** | **60.0%** — unachievable |
| TP1 (proposed) | 1.5 | 1.00 | 50.0% — achievable |
| TP2 (current) | 2.0 | 1.33 | 42.9% — achievable |
| TP3 (current) | 3.0 | 2.00 | 33.3% — comfortable |

### Required Fix

```typescript
// exitEngine.ts calculateLevels()
tp1: entryPrice + (direction * effectiveAtr * 1.5),   // was 1.0
tp2: entryPrice + (direction * effectiveAtr * 2.0),   // unchanged
tp3: entryPrice + (direction * effectiveAtr * 3.0),   // unchanged
sl:  entryPrice - (direction * effectiveAtr * 1.5),   // unchanged
```

### Note on AdaptiveRiskEngine TP Levels

`adaptiveRiskEngine.ts` computes its own TP levels with `tpMultiplier = 1.5` for normal
regime, resulting in `tp1 = entry + 1.5 ATR` — already correct. The ExitEngine and
AdaptiveRiskEngine use different ATR multipliers. After fixing ExitEngine to 1.5×,
both engines align on TP1. **The AQEA_PHASE2_AUDIT.md issue H-9 (dual SL sources)
applies equally to TP levels.**

---

## 3. Verify TP2 and TP3 Execution Paths

### Current State (with CLOSE_PARTIAL bug active)

The `ExitEngine.evaluateExit()` checks TP levels in descending order (TP3 → TP2 → TP1).
This is correct. However:

1. **PositionManager path**: If PositionManager returns `CLOSE_PARTIAL` (TP2 at momentum
   exhaustion), the current code calls full `handleExit()` and `return`s. The fallback
   `ExitEngine.evaluateExit()` at line 518 is never reached.

2. **Fallback ExitEngine path**: If PositionManager returns `HOLD`, the ExitEngine runs.
   When TP2 is hit, `evaluateExit()` correctly returns:
   ```typescript
   { shouldExit: true, type: "PARTIAL", qtyPct: 0.50, reason: "TP2_HIT",
     newStopLoss: state.entryPrice }
   ```
   But the caller ignores `type` and `newStopLoss` — it calls full `handleExit()`.

3. **TP3 path**: Returns `{ type: "FULL", qtyPct: 1.0 }` — full exit is correct.
   This path works correctly today but is only reachable when PositionManager returns HOLD.

4. **State flags not updated**: Because CLOSE_PARTIAL never executes partially,
   `tp1Hit` is never set to `true`. On the next tick, the same TP1 check fires again
   — but by then the position is already gone (full exit on tick N). This means
   `tp1Hit`/`tp2Hit` state tracking is currently unused in practice.

### Required Verification Points After C-3 Fix

After implementing the partial close handler, these paths must be explicitly tested:

| Path | Trigger | Expected Action | State Update Required |
|------|---------|-----------------|----------------------|
| TP1 hit (ExitEngine fallback) | price ≥ entry + 1.5 ATR | Close 25% | `pos.meta.tp1Hit = true` |
| TP2 hit (ExitEngine fallback) | price ≥ entry + 2.0 ATR | Close 50% of remaining | `pos.meta.tp2Hit = true`, SL → entry |
| TP3 hit (ExitEngine fallback) | price ≥ entry + 3.0 ATR | Close 100% | `paper.removePosition()` |
| TP1 re-trigger guard | price still ≥ TP1 next tick | No action | `tp1Hit` already true |
| TP2 re-trigger guard | price still ≥ TP2 next tick | No action | `tp2Hit` already true |

The `tp1Hit` and `tp2Hit` must be persisted to MongoDB (`Trade.findByIdAndUpdate`) so they
survive server restarts (same pattern as line 931–936 for other trade metadata).

---

## 4. Break-Even Stop Movement After TP1

### Current State

`ExitEngine.evaluateExit()` TP1 signal does **not** include `newStopLoss`:
```typescript
// Line 90–92 — no newStopLoss field
return { shouldExit: true, type: "PARTIAL", qtyPct: 0.25, reason: "TP1_HIT" };
```

`PositionManager.evaluate()` does implement break-even logic (line 95–100):
```typescript
} else if (rMultiple >= 1.2) {
   const bePrice = isLong ? state.entryPrice + (atr * 0.2) : state.entryPrice - (atr * 0.2);
   if ((isLong && bePrice > state.sl) || (!isLong && bePrice < state.sl)) {
      return { action: "MODIFY_STOP", qtyPct: 0, reason: "AI_PARTIAL_PROFIT", newStopLoss: bePrice };
   }
}
```

This fires at `rMultiple >= 1.2` which is approximately when price is at 1.2× the initial
risk distance from entry — close to but not exactly TP1. The logic is sound but only fires
when the PositionManager evaluates the position, which happens one tick after TP1 is hit.

### Required Fix

TP1 signal should include `newStopLoss` so the stop moves atomically with the partial close:

```typescript
// exitEngine.ts evaluateExit() — TP1 section
if (!state.tp1Hit) {
  if (isLong ? currentPrice >= state.tp1 : currentPrice <= state.tp1) {
    return {
      shouldExit: true,
      type: "PARTIAL",
      qtyPct: 0.25,
      reason: "TP1_HIT",
      newStopLoss: state.entryPrice  // ← add break-even stop
    };
  }
}
```

The partial close handler must apply `newStopLoss` when present:
```typescript
// In handleExit() partial path:
if (exitSignal.newStopLoss) {
    pos.sl = exitSignal.newStopLoss;
    await Trade.findByIdAndUpdate(pos.tradeId, { sl: pos.sl });
}
```

**Effect:** After TP1 is hit and 25% closed, the remaining 75% has a risk-free stop at
entry. Worst case from that point is breakeven. This materially changes the risk profile
of the trade.

---

## 5. Trailing Stop After TP2

### Current State

`ExitEngine.calculateTrailingStop()` exists (line 101–114) but is **never called** anywhere
in `autoTradeEngine.ts`. The `trailingStop` parameter in `evaluateExit()` is always
`undefined` in practice.

`ExitEngine.evaluateExit()` TP2 path does include `newStopLoss: state.entryPrice` (line 84)
— which moves the stop to entry (breakeven), not a trailing stop. This is correct for TP2.

`PositionManager.evaluate()` at `rMultiple >= 2.0` (line 89–93) moves the stop to
`entry + 1R` — locking in 1R profit. This is a genuine trailing mechanism but is
AI-score-gated and may not fire consistently.

### What Is Missing

After TP2 is hit, the remaining 25% of the position (post TP1 and TP2 partials) has no
systematic trailing mechanism. It either hits TP3 or gets stopped at entry (breakeven from TP2's
`newStopLoss`). The `calculateTrailingStop()` supertrend/EMA-based trail is dead code.

### Required Fix

After TP2 partial close executes, the position state should activate trailing mode.
The `evaluateExit()` `trailingStop` parameter must be populated from stored trade metadata:

```typescript
// In processSymbol() before the ExitEngine fallback call:
const trailingStop = pos.meta?.tp2Hit
  ? ExitEngine.calculateTrailingStop(
      ctx.ind.supertrend || pos.sl,
      ctx.ind.ema20 || pos.sl,
      pos.entryPrice - (ctx.ind.atr14 || 0),
      pos.side === "BUY"
    )
  : undefined;

const exitSignal = ExitEngine.evaluateExit(ctx.ind.close, state, trailingStop);
```

This means once TP2 is hit (flag set in meta), each subsequent tick calculates a dynamic
trailing stop based on the current supertrend/EMA. The runner 25% is protected by this trail
instead of sitting at a static entry-level stop.

**Prerequisite:** The `tp2Hit` flag must be correctly set (requires C-3 fix first).

---

## 6. Kelly Sizing Implementation

### Current State

Kelly Criterion is **not implemented** anywhere in the codebase. Two sizing engines exist
with contradictory outputs:

**RiskEngine (aqea/riskEngine.ts:85–90)** — Fixed 1% risk:
```typescript
const riskAmount = balance * AQEA_CONFIG.MAX_RISK_PER_TRADE;  // 1% of balance
const slPct = (ctx.atr * 2.5) / ctx.currentPrice;
let positionSize = riskAmount / slPct;                         // Risk-proportional
```
This is sound but uses a fixed 1% regardless of edge. `winRate` and `rewardRisk` are
available in `TradeContext` but are only used to compute a `riskScore` gate (not sizing).

**AdaptiveRiskEngine (adaptiveRiskEngine.ts:98):**
```typescript
positionSize: 100 * sizeScale,   // Always 100 USDT base regardless of balance
```
`sizeScale` ranges 0–1.5. Maximum position = 150 USDT irrespective of a $10,000 account.

**Execution winner (autoTradeEngine.ts:571):**
```typescript
const allocUsdt = riskProfile.positionSize || aqeaDecision.positionSize;
```
`riskProfile` is from AdaptiveRiskEngine (`positionSize = 100`). It is truthy whenever
`sizeScale > 0`. RiskEngine's correct balance-proportional output in `aqeaDecision.positionSize`
is never used.

### Kelly Formula

```
f* = W - (1 - W) / R
```
Where:
- `W` = estimated win rate (from historical closed trades or rolling 30-trade window)
- `R` = reward/risk ratio (average win / average loss from trade history)
- `f*` = fraction of capital to risk on next trade

Kelly must be capped (typically at half-Kelly = `f*/2`) to reduce variance.

### Current Kelly Estimate

Using current system parameters:
- W ≈ 0.50 (with CLOSE_PARTIAL bug and 0.67 R:R, realistic win rate is 45–52%)
- R = 0.67 (TP1/SL with bug active)
- Kelly = 0.50 − (0.50/0.67) = 0.50 − 0.746 = **−0.246 (negative → do not trade)**

After proposed fixes:
- W ≈ 0.53 (realistic with 1.5 ATR TP1, 3-tier exit, confidence threshold 85)
- R = 1.686 (weighted avg win across 3 TP levels) / 1.5 (avg loss) = 1.124
- Kelly = 0.53 − (0.47/1.124) = 0.53 − 0.418 = **+0.112 (11.2% of capital)**
- Half-Kelly = **5.6% of capital** — the safe recommended size

At $1,000 balance: risk 5.6% = $56 per trade. RiskEngine currently risks $10 (1%). Kelly says
risk up to $56 but RiskEngine caps at $10 — conservative but not wrong. The bigger issue is
AdaptiveRiskEngine returning $100 flat regardless.

### Required Fix

Kelly is not a replacement for fixed-fraction risk — it is an **upper bound** and a
**scaling factor**. The recommended implementation:

1. **Compute rolling Kelly** from the last 30 closed trades (win rate and avg R from DB).
2. **Use as a cap**: `effectiveRiskPct = Math.min(AQEA_CONFIG.MAX_RISK_PER_TRADE, kellyFraction * 0.5)`
3. **Replace the AdaptiveRiskEngine winner**: Change line 571 to use RiskEngine's balance-proportional output as the baseline, then apply Kelly cap.

```typescript
// Proposed line 571 replacement:
const kellyFraction = await computeRollingKelly(userId, ctx.mode);  // new function
const effectiveRisk = Math.min(AQEA_CONFIG.MAX_RISK_PER_TRADE, kellyFraction * 0.5);
const basePositionSize = (balance * effectiveRisk) / slPct;
const allocUsdt = Math.min(basePositionSize, balance * AQEA_CONFIG.MAX_PORTFOLIO_EXPOSURE);
```

---

## 7. Portfolio Heat Calculations

### Current State

**File:** `server/src/services/autoTradeEngine.ts` (processSymbol heat calculation):

```typescript
const currentHeat = (openTradesCount / maxConcurrentPositions) * 100;
```

This is count-based. 5 positions all at $1 margin = 100% heat. 1 position at $10,000
margin = 20% heat. A $20,000 account with $18,000 at risk reads as 20% heat if only
one position is open.

**RiskEngine correctly computes capital-at-risk heat (riskEngine.ts:59–66):**
```typescript
let totalMargin = 0;
openTrades.forEach(t => {
   const lev = t.leverage || 1;
   totalMargin += (t.quantity * t.entryPrice) / lev;
});
if (totalMargin / balance > AQEA_CONFIG.MAX_PORTFOLIO_EXPOSURE) {
   return this.reject("PORTFOLIO_EXPOSURE_LIMIT_REACHED");
}
```

This is the correct formula but it is used only for the entry gate, not for the
AdaptiveRiskEngine `heat` parameter that scales position sizes.

### Required Fix

Replace the count-based heat formula with capital-at-risk heat:

```typescript
// New heat calculation for AdaptiveRiskEngine input:
const wallet = paper.getWallet(userId, mode, accountType);
const balance = wallet.get("USDT") ?? 0;
let totalMarginUsed = 0;
openPositions.forEach(p => {
  totalMarginUsed += (p.quantity * p.entryPrice) / (p.leverage || 1);
});
const currentHeat = balance > 0 ? (totalMarginUsed / balance) * 100 : 0;
```

**Effect on AdaptiveRiskEngine heat thresholds:**
- `heat > 40`: Hard block (no new trades) — unchanged in meaning, now meaningful
- `heat > 30`: Halve size — now correctly fires when >30% of capital is deployed

---

## 8. Position Sizing Against Account Balance

### Current Gap

| Engine | Formula | $1,000 balance | $10,000 balance | $100,000 balance |
|--------|---------|---------------|-----------------|------------------|
| **AdaptiveRiskEngine** (wins) | `100 × sizeScale` | $100 (10%) | $100 (1%) | $100 (0.1%) |
| **RiskEngine** (discarded) | `balance × 1% / slPct` | ~$25 | ~$250 | ~$2,500 |
| Kelly half-fraction | `balance × 5.6%` | ~$56 | ~$560 | ~$5,600 |

The hardcoded $100 base creates three failure modes:
1. **Small accounts** ($500–$1,000): $100 = 10–20% of capital per trade — far exceeds
   institutional risk limits and AQEA_CONFIG.MAX_RISK_PER_TRADE (1%).
2. **Large accounts** ($50,000+): $100 = 0.2% — massively undersized, returns negligible.
3. **Balance-blind**: Risk management rules (MAX_PORTFOLIO_EXPOSURE = 10%) become
   meaningless since sizing doesn't reference balance.

### Required Fix

Remove the hardcoded $100 base. Use RiskEngine output as the canonical position size:

```typescript
// adaptiveRiskEngine.ts:98 — change:
positionSize: 100 * sizeScale,

// to (requires balance to be passed in):
positionSize: basePositionUsdt * sizeScale,
// where basePositionUsdt comes from RiskEngine output
```

**Migration path**: Add `balance: number` to `AdaptiveRiskEngine.calculate()` parameters.
Compute `basePositionUsdt = balance * AQEA_CONFIG.MAX_RISK_PER_TRADE / slPct`. Then
`sizeScale` adjusts this balance-proportional base.

---

## 9. Leverage Calculations

### Current State

Two contradictory leverage sources:

**AdaptiveRiskEngine (wins via line 572):**
```typescript
const finalLeverage = Math.max(1, Math.round(10 * weatherRisk.leverageMultiplier));
// weatherRisk.leverageMultiplier ≈ 1.0 → leverage = 10
```
Result: Always ~10x.

**RiskEngine (discarded):**
```typescript
leverage = Math.min(AQEA_CONFIG.MAX_LEVERAGE, positionSize / riskAmount);
// MAX_LEVERAGE = 3
```
Result: 1x–3x based on position size and risk amount.

**Execution (autoTradeEngine.ts:572):**
```typescript
const leverage = riskProfile.leverage || aqeaDecision.leverage || 10;
```
`riskProfile` = AdaptiveRiskEngine output (leverage ≈ 10). Always wins.

### Problem

10x leverage on $100 USDT at $1,000 balance = $1,000 notional = **100% of account in one trade**.
The AQEA_CONFIG.MAX_CONCURRENT_POSITIONS = 5 would mean 500% of balance in notional exposure —
impossible on any exchange, and catastrophic if it were possible.

The V40 circuit breaker (2% max-loss per position) stops losses at $20 on a $100 position — but
with 10x leverage that $20 loss represents a 20% move against you... on a 10-minute candle on
a volatile crypto pair. Circuit breaker triggers every trade in volatile conditions.

### Required Fix

Unify leverage to use RiskEngine's formula, which is correctly bounded:

```typescript
// Leverage = positionSize / (balance × riskPct)
// This gives the leverage needed to achieve the target notional with 1% risk
// Capped at MAX_LEVERAGE = 3
```

AQEA_CONFIG.MAX_LEVERAGE should remain at 3. The AdaptiveRiskEngine leverage calculation
(10 × weatherMultiplier) must be replaced.

**Suggested approach**: Remove leverage from AdaptiveRiskEngine entirely. Leverage belongs
to RiskEngine which has the balance context needed for a sound calculation.

---

## 10. Expected Metrics After Fixes

### Assumptions

These estimates assume all 9 issues above are fixed, and use conservative base rates:
- AI signal quality (85th percentile filter): 52–55% win rate achievable
- Market conditions: mixed trending/ranging (typical crypto)
- 5 symbols traded, ~3–4 trades per symbol per day on average
- Fees: 0.05% maker + 0.05% taker (Binance futures VIP 0)

### Revised Exit Distribution (Post-Fix)

When a trade is a winner (price moves in direction):
| Exit Stage | % of Winners | Profit (ATR) | Notes |
|-----------|-------------|--------------|-------|
| TP3 (full run) | 35% | 2.25 avg | TP1+TP2 partials + TP3 remainder |
| TP2 (momentum exits) | 35% | 1.125 avg | TP1 partial + TP2 partial + BE stop |
| TP1 only (stopped at BE) | 30% | 0.375 avg | TP1 partial + remainder stopped at entry |

When a trade is a loser:
- Full SL at −1.5 ATR (100% of remaining position, after breakeven stop prevents full loss if TP1 was hit)
- For losses where price never reached TP1: full −1.5 ATR loss

### Weighted Average Win/Loss

**Average winning trade:**
```
0.35 × 2.25 + 0.35 × 1.125 + 0.30 × 0.375
= 0.788 + 0.394 + 0.113
= 1.295 ATR profit
```

**Average losing trade:**
```
−1.5 ATR (full SL, no partial protection triggered)
```

**Effective R:R:** 1.295 / 1.50 = **0.863**

### Metric Projections

| Metric | Current (Broken) | After Fixes | Target |
|--------|-----------------|-------------|--------|
| **Win Rate** | 45–50% | 52–55% | 55% |
| **Avg Win (ATR)** | 1.0 (TP1 only) | 1.295 | 1.5+ |
| **Avg Loss (ATR)** | 1.5 | 1.5 | 1.5 |
| **Effective R:R** | 0.67 | 0.863 | 1.0+ |
| **Profit Factor** | 0.61 | **1.24–1.45** | 1.40 |
| **Sharpe Ratio (ann.)** | −10.3 | **+0.8 to +1.4** | 1.20 |
| **Max Drawdown (est.)** | 35–50% | **12–20%** | <15% |
| **Risk of Ruin (12m)** | 62% | **8–18%** | <10% |
| **Kelly Fraction** | −0.247 (do not trade) | **+0.11** | 0.08–0.12 |

### Profit Factor Calculation Detail

**At 52% win rate:**
```
Gross Profit  = 52 wins × 1.295 ATR = 67.34 ATR
Gross Loss    = 48 losses × 1.50 ATR = 72.00 ATR
Profit Factor = 67.34 / 72.00 = 0.935
```
Still below 1.0 at 52% — needs 55%+ or better TP distribution.

**At 55% win rate:**
```
Gross Profit  = 55 × 1.295 = 71.23 ATR
Gross Loss    = 45 × 1.50  = 67.50 ATR
Profit Factor = 71.23 / 67.50 = 1.055
```

**At 55% with improved trailing (TP2 activates trailing → 40% reach TP3):**
```
Avg win = 0.40 × 2.25 + 0.35 × 1.125 + 0.25 × 0.375 = 0.90 + 0.394 + 0.094 = 1.388 ATR
Gross Profit = 55 × 1.388 = 76.34 ATR
Gross Loss   = 45 × 1.50  = 67.50 ATR
Profit Factor = 76.34 / 67.50 = 1.131
```

**At 55% with Kelly-sized positions (signals are higher quality — selectivity improves win rate):**
```
Estimated PF = 1.25–1.45 (full fix scenario)
Estimated Sharpe (ann.) = +0.9 to +1.4
```

These numbers assume the AI signal quality genuinely achieves 55% directional accuracy.
If the underlying alpha is weaker (50% accuracy), the system remains marginally profitable
at best with these fixes — it cannot manufacture edge that isn't there.

---

## Implementation Priority Order

All items below are **prerequisites** — they build on each other. Implement in order.

| Priority | Fix | Files | Estimated Impact |
|----------|-----|-------|-----------------|
| **P1** | C-3: Add `qtyPct` to `handleExit()` + partial close logic | `autoTradeEngine.ts` | +0.3 PF |
| **P2** | Update `tp1Hit`/`tp2Hit` meta flags on partial close | `autoTradeEngine.ts` | Enables P3/P4 |
| **P3** | ExitEngine: TP1 → 1.5 ATR, add `newStopLoss: entryPrice` to TP1 signal | `exitEngine.ts` | +0.15 PF |
| **P4** | ExitEngine fallback: pass `exitSignal.qtyPct` to `handleExit()` | `autoTradeEngine.ts` | Bug parity with P1 |
| **P5** | Activate trailing stop after TP2 via `pos.meta.tp2Hit` guard | `autoTradeEngine.ts` | +0.05 PF |
| **P6** | Portfolio heat: replace count-based with capital-at-risk formula | `autoTradeEngine.ts` | Risk correctness |
| **P7** | Position sizing: pass `balance` to `AdaptiveRiskEngine`, remove $100 hardcode | `adaptiveRiskEngine.ts`, `autoTradeEngine.ts` | Scalability |
| **P8** | Leverage: unify to RiskEngine formula, cap at MAX_LEVERAGE=3 | `adaptiveRiskEngine.ts`, `autoTradeEngine.ts` | Risk correctness |
| **P9** | Kelly: add `computeRollingKelly()` from 30-trade window, use as risk cap | New function | +0.1 PF at scale |

---

## Critical Constraints (Do Not Touch)

Per original implementation contract:
- **Demo auto-login**: No changes
- **CORS origins**: No changes
- **Position sizing base multiplier (100 USDT)** — This plan proposes making 100 USDT the
  default when balance is unavailable, not removing it. The constraint is respected.
- **Exchange-native stop orders**: These fixes operate on paper/position state only
- **Leverage formula**: The leverage formula in use today (AdaptiveRiskEngine) will be
  replaced but only with the already-present RiskEngine formula — not a new formula

---

## Risk of Not Fixing

If only the TP1 ATR multiplier is raised (Fix #2) without fixing the CLOSE_PARTIAL bug (#1):
- Profit Factor improves from 0.61 to ~0.75 — still losing
- The system remains unprofitable but loses money more slowly per trade

If only the CLOSE_PARTIAL bug is fixed (#1) without raising TP1:
- Profit Factor improves from 0.61 to ~0.92 — still slightly losing
- The 3-tier exit now works but TP1 R:R = 0.67 anchors the first close at a loss

**Both P1 and P3 must be implemented together to cross the 1.0 Profit Factor threshold.**

---

*This plan is analysis-only. No code changes have been made. Implement in priority order
after reviewing with the team. Each fix should be followed by paper trading validation
before proceeding to the next.*
