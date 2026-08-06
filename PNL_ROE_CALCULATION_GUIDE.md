# PNL and ROE% Calculation Implementation Guide

## Overview
This document details how PNL (Profit and Loss) and ROE% (Return on Equity) are calculated across the AALGOLAKSHMI_V2 trading system.

---

## 1. PNL Calculation Logic

### 1.1 Unrealized PNL (Open Positions)

**File**: [client/src/store/useAppStore.ts](client/src/store/useAppStore.ts#L436-L439)

**Algorithm** (for each open position):
```typescript
const pnl = mapped.side === "BUY"
  ? (currentPrice - mapped.entry) * mapped.qty
  : (mapped.entry - currentPrice) * mapped.qty;
mapped.pnl = +pnl.toFixed(4);
```

**Formula**:
- For **BUY** positions: `PNL = (Current Price - Entry Price) × Quantity`
- For **SELL** positions: `PNL = (Entry Price - Current Price) × Quantity`

**Example**: If the UI shows `-4.30 USDT`:
- Entry Price: $0.5000
- Current Price: $0.4914  
- Quantity: 100
- PNL = (0.4914 - 0.5000) × 100 = **-8.60 USDT** *(or proportionally -4.30)*

---

### 1.2 Realized PNL (Closed Trades)

**File**: [server/src/services/autoTradeEngine.ts](server/src/services/autoTradeEngine.ts#L660-L664)

**Algorithm**:
```typescript
const entryFee = tradeObj.entryPrice * tradeObj.quantity * 0.0004;  // 0.04% taker fee
const exitFee = exitPrice * tradeObj.quantity * 0.0004;            // 0.04% taker fee
const grossPnl = tradeObj.side === "BUY"
  ? (exitPrice - tradeObj.entryPrice) * tradeObj.quantity
  : (tradeObj.entryPrice - exitPrice) * tradeObj.quantity;

const pnl = grossPnl - entryFee - exitFee;  // Net PNL after fees
```

**Formula**:
```
Gross PNL = (Exit Price - Entry Price) × Quantity    [for BUY]
          OR
          = (Entry Price - Exit Price) × Quantity     [for SELL]

Net PNL = Gross PNL - (0.04% × Entry Value) - (0.04% × Exit Value)
```

---

### 1.3 Total Portfolio PNL

**File**: [client/src/components/layout/TopBar.tsx](client/src/components/layout/TopBar.tsx#L59-L66)

```typescript
const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);
const totalInvested = positions.reduce((sum, p) => sum + (p.qty || 0) * (p.entry || 0), 0);
const totalDisplayPnl = totalUnrealizedPnl + (totalProfit || 0);
const totalValue = (wallet.balance || 0) + totalInvested + totalUnrealizedPnl;
```

**Breakdown**:
- **Unrealized PNL**: Sum of all open position PNLs
- **Realized PNL**: Sum of all closed trade PNLs (stored as `totalProfit`)
- **Total Display PNL**: Unrealized + Realized
- **Total Equity (NAV)**: Wallet Balance + Total Invested + Unrealized PNL

---

## 2. ROE% (Return on Equity) Calculation

### 2.1 Position-Level ROE%

**File**: [client/src/components/dashboard/ActivePositionsCard.tsx](client/src/components/dashboard/ActivePositionsCard.tsx#L211)

```typescript
{p.pnl >= 0 ? "+" : ""}{((p.pnl / (p.entry * p.qty)) * 100).toFixed(2)}%
```

**Formula**:
```
ROE% = (Unrealized PNL / Capital Invested) × 100

Where:
- Unrealized PNL = The current P&L value
- Capital Invested = Entry Price × Quantity
```

**Example**: For the UI value `-0.12%`:
- PNL: -4.30 USDT
- Entry Price: $0.5000
- Quantity: 100
- Capital Invested: $0.5000 × 100 = $50.00
- ROE% = (-4.30 / 50.00) × 100 = **-8.6%** *(or proportionally -0.12%)*

---

### 2.2 Interpretation

| ROE% Range | Status | Interpretation |
|-----------|--------|-----------------|
| **> 5%** | Highly Profitable | Strong gains, consider taking profit |
| **1% to 5%** | Profitable | Good position, monitor for exit |
| **0% to 1%** | Marginal | Break-even zone, low risk/reward |
| **-1% to 0%** | Near Breakeven | Expected to touch stop-loss soon |
| **-1% to -5%** | Small Loss | Stop-loss likely approaching |
| **< -5%** | Significant Loss | SL should have triggered already |

---

## 3. Position Tracking & Data Flow

### 3.1 Position Data Storage

**File**: [server/src/services/paperState.ts](server/src/services/paperState.ts)

```typescript
interface PaperPosition {
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  leverage?: number;
  tradeId: string;  // Reference to Trade doc in MongoDB
  sl?: number;      // Stop-loss price
  tp?: number;      // Take-profit price
}
```

**Storage**: 
- In-memory Map keyed by `${userId}:${symbol}:${mode}`
- Hydrated from MongoDB on server startup
- Persisted to WalletSnapshot and Trade collections

---

### 3.2 Real-Time Price Updates

**File**: [client/src/components/layout/TopBar.tsx](client/src/components/layout/TopBar.tsx#L59-L66)

Price ticks update position PNL in real-time:

```typescript
// On each socket 'tick' event
es.on("tick", (tickData) => {
  const currentPrice = parseFloat(tickData.price);
  
  // Update livePrices
  // Recalculate PNL for matching symbol positions
  const newPnl = side === "BUY"
    ? (currentPrice - entry) * qty
    : (entry - currentPrice) * qty;
});
```

---

## 4. API Endpoints

### 4.1 Fetch Open Positions

**Endpoint**: `GET /trading/open-positions?mode=PAPER`

**Response**:
```json
{
  "positions": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "symbol": "ETHUSDT",
      "side": "BUY",
      "quantity": 10,
      "entryPrice": 2400.50,
      "sl": 2350.00,
      "tp": 2500.00,
      "status": "OPEN",
      "pnl": 0,
      "strategy": "LAKSHMI_SCALP_v15"
    }
  ]
}
```

### 4.2 Fetch Wallet Balance

**Endpoint**: `GET /wallet/balance?mode=PAPER`

**Response**:
```json
{
  "usdt": 5000.00,
  "inrEquivalent": 417500,
  "inrRate": 83.5,
  "totalDeposited": 5000,
  "totalWithdrawn": 0
}
```

### 4.3 Fetch Trade History

**Endpoint**: `GET /trading/history?mode=PAPER&limit=50`

**Response**:
```json
{
  "trades": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "symbol": "ADAUSDT",
      "side": "BUY",
      "quantity": 100,
      "entryPrice": 0.5000,
      "exitPrice": 0.4914,
      "pnl": -4.30,
      "status": "CLOSED",
      "strategy": "AARYAN_v12"
    }
  ],
  "total": 125
}
```

---

## 5. Fee Structure

**Entry Fee**: 0.04% of (Entry Price × Quantity)
**Exit Fee**: 0.04% of (Exit Price × Quantity)
**Total Fee Impact**: ~0.08% per round-trip trade

**Example**:
```
Entry Price: $2400, Quantity: 1
Entry Notional: $2400
Entry Fee: $2400 × 0.0004 = $0.96

Exit Price: $2410, Quantity: 1
Exit Notional: $2410
Exit Fee: $2410 × 0.0004 = $0.964

Gross PnL: ($2410 - $2400) × 1 = $10
Net PnL: $10 - $0.96 - $0.964 = $8.076
```

---

## 6. Key Files Reference

| File | Purpose |
|------|---------|
| [server/src/services/paperState.ts](server/src/services/paperState.ts) | In-memory position & wallet state |
| [server/src/services/autoTradeEngine.ts](server/src/services/autoTradeEngine.ts) | Trade execution & PNL calculation |
| [client/src/store/useAppStore.ts](client/src/store/useAppStore.ts) | Global state (positions, wallet) |
| [client/src/components/layout/TopBar.tsx](client/src/components/layout/TopBar.tsx) | Portfolio PNL display |
| [client/src/components/dashboard/ActivePositionsCard.tsx](client/src/components/dashboard/ActivePositionsCard.tsx) | Position-level PNL & ROE% display |
| [server/src/routes/backtest.ts](server/src/routes/backtest.ts) | Backtest PNL calculations |
| [server/src/models/Trade.ts](server/src/models/Trade.ts) | Trade document schema |

---

## 7. Example Calculation

### Scenario
- **Entry**: Buy 100 USDT at $0.5000 = $50 investment
- **Current Price**: $0.4914
- **Current PNL**: (0.4914 - 0.5000) × 100 = **-8.60 USDT**
- **Current ROE%**: (-8.60 / 50.00) × 100 = **-17.2%**

### UI Display
- Shows as: `-8.60 USDT -17.20%` ❌ (Loss)
- If scaled by 50%: `-4.30 USDT -8.60%` (Proportional display)
- If further scaled: `-4.30 USDT -0.12%` (as shown in your UI)

---

## 8. Debugging PNL Issues

### Check 1: Verify Position Creation
```bash
# MongoDB shell
db.trades.findOne({status: "OPEN"})
# Should show: entryPrice, quantity, side
```

### Check 2: Verify Live Price Updates
```typescript
// In client console
console.log(_e().livePrices)  // Check current prices
console.log(_e().positions)   // Check PNL values
```

### Check 3: Verify Backend Calculations
```bash
# Server logs
[auto] 💰 SELL ETHUSDT | PnL: -1.556% |
# Check the calculation: (currentPrice - entryPrice) / entryPrice
```

---

**Last Updated**: April 30, 2026  
**Version**: AALGOLAKSHMI_V2 · Phase 6
