# AALGOLAKSHMI V2 — Strategy Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Auto‑Trade Engine                       │
│  (scheduler: every 60s per AUTO symbol per user)            │
│                          │                                  │
│                    ┌─────▼─────┐                            │
│                    │  Agent    │                             │
│                    │  Service  │                             │
│                    └──┬───┬───┘                              │
│               ┌──────┘   └───────┐                          │
│         ┌─────▼─────┐     ┌──────▼──────┐                   │
│         │ Indicator │     │  Behaviour  │                   │
│         │  Service  │     │   Model     │                   │
│         │ (stream)  │     │  (animals)  │                   │
│         └─────┬─────┘     └──────┬──────┘                   │
│               └──────┬───────────┘                          │
│                ┌─────▼─────┐                                │
│                │   Score   │                                │
│                │ Functions │                                │
│                └─────┬─────┘                                │
│                ┌─────▼─────┐                                │
│                │ Checklist │  ← 24 Spokes (Gayatri)        │
│                │ (guards)  │                                │
│                └─────┬─────┘                                │
│                ┌─────▼─────┐                                │
│                │  Decision │  → LONG / EXIT / NO_TRADE     │
│                └───────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Indicator Service (`indicatorService.ts`)

### Design Principles
- **Streaming/Incremental**: Every indicator is a class that updates
  with a single new bar, maintaining internal state.
- **Ring Buffers**: SMA, Bollinger, and StdDev use a fixed‑capacity
  `RingBuffer<number>` for O(1) push, O(n) sum.
- **No recomputation**: EMA uses the incremental formula
  `EMA_new = price * k + EMA_old * (1 − k)` where `k = 2 / (period + 1)`.
- **RSI** uses Wilder's smoothed averages after an initial accumulation period.

### Indicators Provided

| Indicator      | Class               | Params         |
|----------------|---------------------|----------------|
| EMA            | `StreamingEMA`      | period         |
| SMA            | `StreamingSMA`      | period         |
| RSI            | `StreamingRSI`      | period (14)    |
| MACD           | `StreamingMACD`     | 12, 26, 9      |
| ATR            | `StreamingATR`      | period (14)    |
| Bollinger      | `StreamingBollinger`| period, stdMul |
| Std Deviation  | `StreamingStdDev`   | period         |

### Snapshot
`computeSnapshot(bars: OHLC[])` feeds all bars through every indicator
and returns an `IndicatorSnapshot` with all final values.

---

## 2. Behaviour Model (`behaviourModel.ts`)

### Animal Definitions

| Animal   | Archetype                  | Favours LONG when…                           | Favours EXIT/avoid when…                    |
|----------|----------------------------|----------------------------------------------|---------------------------------------------|
| Eagle    | Higher‑TF trend            | HTF trend is bullish                         | HTF trend is bearish                        |
| Tiger    | Conviction                 | RSI < 35 (oversold)                          | RSI > 70 (overbought)                      |
| Cheetah  | Fast breakout              | Price > upper Bollinger                      | Price < lower Bollinger                     |
| Fox      | Short‑term vol scalper     | Volatility ratio > 3%                        | Volatility < 0.5%                           |
| Tortoise | Conservative               | Trades today < 3                             | Trades today > 5                            |
| Dog      | Discipline                 | Daily loss < 70% of limit                    | Daily loss > 100% of limit                  |
| Owl      | Reversal hunter            | RSI < 30 AND MACD histogram > 0              | RSI > 70 AND MACD histogram < 0            |
| Cow      | Steady mean reversion      | Price 2%+ below EMA21                        | Price 4%+ above EMA21                       |
| Spider   | Correlation‑aware          | Few open positions                           | Many open positions                         |
| Lion     | Aggressive trend cont.     | EMA9 > EMA21 > EMA55 (bull alignment)        | EMA9 < EMA21 < EMA55 (bear alignment)      |

### Scoring
Each animal returns a raw score in [−1, +1].
The score is multiplied by the animal's normalised weight (0–1 from user settings).
All weighted scores are averaged to produce a **blend score**.

---

## 3. Agent Service (`agentService.ts`)

### Pipeline

```
buildContext(symbol, mode, userId)
  │
  ├─ Fetch 200× 5m bars → computeSnapshot
  ├─ Fetch 60× 1h bars → HTF trend check
  ├─ Load user Settings (risk + weights)
  ├─ Query today's trades (P&L + count)
  ├─ Read open positions from paperState
  └─ Blend animal scores
  │
  ▼
AgentContext
  │
  ├─ scoreLong(ctx)    → 0‑1
  ├─ scoreExit(ctx)    → 0‑1
  └─ scoreNoTrade(ctx) → 0‑1
  │
  ▼
decideAction(ctx) → { action, confidences, contributions, checklist }
```

### Score Functions

**scoreLong** accumulates:
- RSI in 35‑55 sweet spot: +0.25
- RSI oversold (<30): +0.15
- RSI overbought (>70): −0.20
- EMA9 > EMA21: +0.20
- MACD histogram > 0: +0.15
- Near lower Bollinger: +0.15
- HTF bullish: +0.10
- Animal blend × 0.30

**scoreExit** accumulates:
- RSI > 70: +0.35
- EMA bearish cross: +0.20
- MACD histogram < 0: +0.20
- Bollinger upper breach: +0.15
- Negative animal blend: +0.20

**scoreNoTrade** starts at 0.30 (safety bias):
- Low volatility: +0.30
- RSI dead zone (45‑55): +0.15
- Overtrading (>6): +0.25
- Near daily loss limit: +0.30

### Decision Logic
- LONG wins if score > 0.35 and beats other scores
- EXIT wins if score > 0.30 and beats other scores
- Otherwise NO_TRADE
- **LONG is overridden to NO_TRADE if the 24‑spoke checklist blocks it**

---

## 4. Pre‑Trade Checklist — "24 Spokes" (`checklist.ts`)

Inspired by the 24 spokes of the Gayatri / Dharma Chakra.

### Categories

| # | Category   | Checks (8 each) |
|---|------------|------------------|
| 1‑8   | TREND      | EMA alignment, RSI zone, MACD, Bollinger, HTF, ATR, extension |
| 9‑16  | RISK       | Position size, daily loss, SL, TP, R:R ratio, open count, trailing, Ohm Sync |
| 17‑24 | BEHAVIOUR  | Animal blend, Dog cap, Tortoise cooldown, Cheetah vol, Eagle active, Spider corr, Lion trend, Confidence threshold |

### Mandatory Checks (must ALL pass to allow a trade)
- T1: EMA9 > EMA21
- T3: RSI in 30‑70
- T6: HTF trend aligned
- R1: Position size within limit
- R2: Daily loss within limit
- R3: SL will be set
- R5: Risk:Reward ≥ 1:1.5
- R6: Open positions < 5
- B1: Animal blend > 0
- B2: Trades today < 8
- B8: Confidence > 0.15

---

## 5. Auto‑Trade Engine (`autoTradeEngine.ts`)

### Scheduler
- `setInterval` running every 60 seconds.
- Iterates over `autoEnabledUsers` (Set for O(1) add/delete/has).
- For each user, loads `Settings.allowedSymbols`.
- For each symbol: `recommend()` → log Alert → act.

### Position Management
- Uses `paperState.ts` Maps for O(1) lookup by `userId:symbol:mode`.
- **LONG handler**: checks existing position (O(1)), calculates quantity
  from risk config, places order (Binance LIVE or paper simulation).
- **EXIT handler**: looks up position (O(1)), sells, updates Trade doc,
  credits wallet, removes position.

### Data Structures
- `positions: Map<string, PaperPosition>` — key = `userId:symbol:mode`
- `wallets: Map<string, Map<string, number>>` — key = `userId:mode`
- `autoEnabledUsers: Set<string>` — O(1) membership test

---

## 6. Testing Strategy

All scoring functions are **pure/deterministic** given an `AgentContext`.
Unit tests can:

1. Construct a mock `AgentContext` with known indicator values.
2. Assert `scoreLong(ctx)` returns expected range.
3. Assert `decideAction(ctx)` returns expected action.
4. Assert checklist passes/fails on crafted inputs.
5. Test each animal scorer individually.
6. Test `RingBuffer` push/at/sum with known sequences.
7. Test streaming indicators against batch-computed reference values.
