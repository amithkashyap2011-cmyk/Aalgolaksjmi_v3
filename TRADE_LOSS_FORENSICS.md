# Trade Loss Forensics — AQEA V12.1 Phase 4

**Date**: 2026-06-16  
**Source**: MongoDB `trades` collection, 48 closed trades (all PAPER mode)

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Closed Trades | 48 |
| Wins | 19 |
| Losses | 29 |
| **Win Rate** | **39.6%** |
| **Profit Factor** | **0.09** |
| Total PnL | **-221.47 USDT** |
| **Expectancy** | **-4.61 USDT/trade** |
| Mode | 100% PAPER |
| Strategies Used | AQEA_V8.0 (20), AQEA_V3.0 (28) |

---

## Two Distinct Eras

The 48 trades split into two strategy versions with dramatically different characteristics:

### Era 1: AQEA_V3.0 (Trades #32–48, older)
- Leverage: **3x**
- Stop-losses: **Symbol-specific** (BTCUSDT: ~64444, ETHUSDT: ~1662, etc.)
- Individual trade PnL range: -128.62 to +6.87
- Contains catastrophic losses (XRPUSDT: -128.62, BTCUSDT: -50.64, BNBUSDT: -40.49)

### Era 2: AQEA_V8.0 (Trades #1–31, newer)  
- Leverage: **10x**
- Stop-losses: **ALL set to 62720** regardless of symbol ← 🔴 **CRITICAL BUG**
- Take-profits: **ALL set to 64960** regardless of symbol ← 🔴 **CRITICAL BUG**
- Individual trade PnL range: -0.97 to +0.57
- Small consistent losses due to immediate stop-out

---

## 🔴 ROOT CAUSE #1: Universal Stop-Loss/Take-Profit Bug (AQEA_V8.0)

Every single AQEA_V8.0 trade has:
```
sl: 62720    ← This is a BTC price level, NOT valid for DOGE, SHIB, XRP, SOL, etc.
tp: 64960    ← Same — a BTC price level applied to all symbols
```

**Evidence**:
- Trade #24: DOGEUSDT entry=0.08963, sl=62720 (69,900,000% away from price)
- Trade #29: SHIBUSDT entry=0.00000512, sl=62720 (trillions of % away)
- Trade #21: BTCUSDT entry=66859.75, sl=62720 (6.2% below — accidentally reasonable)

**Root Cause**: The stop-loss value is being set from BTCUSDT context regardless of which symbol is being traded. Likely a shared variable or context leak in the AQEA engine.

---

## 🔴 ROOT CAUSE #2: Catastrophic V3.0 Short Squeeze (Trades #32–34)

Three trades lost **-219.75 USDT** combined:

| # | Symbol | Side | Entry | Exit | PnL | Holding Period |
|---|--------|------|-------|------|-----|----------------|
| 32 | XRPUSDT | SELL | 1.1328 | 1.2866 | **-128.62** | ~22h |
| 33 | BTCUSDT | SELL | 63797 | 67170 | **-50.64** | ~22h |
| 34 | BNBUSDT | SELL | 603.01 | 628.27 | **-40.49** | ~22h |

These were all shorts opened during a bearish regime that reversed into a massive rally. They were held for ~22 hours without being stopped out. The stop-losses (1.136, 63949, 604.66) were too close to entry and should have triggered much earlier.

---

## Loss Cause Classification (All 29 Losing Trades)

| Cause | Count | PnL Impact | Description |
|-------|-------|------------|-------------|
| **STOPLOSS_ERROR** | 20 | -7.21 | V8.0: Universal SL=62720 (wrong symbol) |
| **TREND_FILTER_ERROR** | 3 | -219.75 | V3.0: Shorted during reversal, held 22h |
| **MODEL_ERROR** | 4 | -1.56 | TRENDING_BULL regime + BUY = correct reading but price dropped |
| **DATA_ERROR** | 2 | -0.25 | Minor losses likely from stale price data |

### Breakdown by Impact:
1. **TREND_FILTER_ERROR**: 96.3% of losses (-219.75 USDT) — 3 catastrophic shorts
2. **STOPLOSS_ERROR**: 3.2% of losses (-7.21 USDT) — universal SL bug
3. **MODEL_ERROR**: 0.7% of losses (-1.56 USDT) — minor directional errors

---

## Winning Trade Analysis (19 Wins)

| Metric | Value |
|--------|-------|
| Average Win | +0.97 USDT |
| Largest Win | +6.87 USDT (SHIBUSDT short) |
| Win sources | Mostly V3.0 short scalps on correct trend |

---

## Key Findings

1. **The universal SL=62720 bug** in AQEA_V8.0 means stop-losses are never triggered for non-BTC symbols, and take-profits are equally broken. This renders the risk engine useless.

2. **Three catastrophic V3.0 shorts** account for 99.2% of total losses. These were not stopped because:
   - Stops were set but price gapped through them
   - No maximum holding period enforcement
   - No trailing stop implementation

3. **Win rate of 39.6%** with **Profit Factor of 0.09** means the system generates frequent small wins and catastrophic large losses — classic anti-pattern of no position management.

4. **All trades are PAPER mode** — no live capital at risk.

---

## Recommendations

1. **Fix the universal SL/TP bug** — Stop-loss must be symbol-relative (e.g., ATR-based), not a hardcoded BTC level
2. **Add maximum holding period** — Auto-close positions held longer than configurable threshold
3. **Add trailing stops** — Prevent winners from becoming losers
4. **Add per-trade max loss circuit breaker** — Kill any position that loses > 5% of account
5. **Do NOT go live** until SL bug is fixed and verified over 100+ paper trades
