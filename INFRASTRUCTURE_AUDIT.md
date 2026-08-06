# Infrastructure Audit — AALGOLAKSHMI V3
**Date:** 2026-06-24  
**Scope:** Memory leaks, event listener leaks, WebSocket leaks, database connection leaks, API rate-limit risks, Binance API failure scenarios, race conditions, concurrent order execution bugs.  
**Rule:** Findings only — no code modified.

---

## Severity Legend
| Tag | Meaning |
|-----|---------|
| `[CRITICAL]` | Can cause data loss, duplicate orders, or process crash |
| `[HIGH]` | Causes degraded performance or silent failure under load |
| `[MEDIUM]` | Grows over time or fails during adverse conditions |
| `[LOW]` | Theoretical risk or minor inefficiency |

---

## 1. Race Conditions & Concurrent Order Execution

---

### R-1: TOCTOU Race — Position Check vs. Position Creation (Duplicate Trade Bug)

**Severity:** `[CRITICAL]`  
**Files:** `server/src/services/autoTradeEngine.ts:548, 700`

**Root Cause:**  
`handleLong()` and `handleShort()` each begin with a guard:
```typescript
const existing = paper.getPosition(userId, symbol, mode, accountType);
if (existing) { /* reject */ return; }
```
Then, **multiple async operations occur before** `paper.setPosition()` is called (Trade.create, binance.placeOrder, alert.create). During those async gaps, the 60-second scheduler can tick again and call `processSymbol()` for the same user/symbol. The second invocation reads `getPosition()` — which still returns `undefined` because `setPosition()` hasn't been called yet — and proceeds to place another order.

**Execution sequence (race):**
```
Tick 1:  handleLong() reads existing=undefined          → proceeds
Tick 1:  await Trade.create(...)                        ← async gap (50-200ms)
Tick 2:  handleLong() reads existing=undefined          → ALSO proceeds (position not yet set!)
Tick 1:  paper.setPosition(...)                         ← too late
Tick 2:  paper.setPosition(...)                         ← second position created
```
Result: two open trades for the same symbol + two DB records + double capital deduction.

In LIVE mode this means two market orders placed on Binance before either position is recorded.

**Recommended Fix:**  
Add a per-symbol execution lock (a `Set<string>` of in-flight keys):
```typescript
const executingSymbols = new Set<string>();

async function handleLong(...) {
  const lockKey = `${userId}:${symbol}:${mode}`;
  if (executingSymbols.has(lockKey)) return;
  executingSymbols.add(lockKey);
  try {
    // ... existing logic
  } finally {
    executingSymbols.delete(lockKey);
  }
}
```

---

### R-2: `handleExit` Has No Re-entrant Guard — Double Exit on Same Position

**Severity:** `[CRITICAL]`  
**Files:** `server/src/services/autoTradeEngine.ts:890`

**Root Cause:**  
Within a single `processSymbol()` call, `handleExit()` can be called up to **6 times** from different exit paths:
1. V40 max-loss circuit breaker (line 434)
2. V40 max-hold-time guard (line 447)
3. AutoCloseEngine trigger (line 466)
4. PositionManager CLOSE_FULL (line 502)
5. PositionManager CLOSE_PARTIAL (line 505 — always calls full exit)
6. ExitEngine SL/TP signal (line 531)

Each of these checks `paper.getPosition()` independently. If path 1 (V40 max-loss) fires and calls `handleExit()`, it begins:
- `await Trade.findByIdAndUpdate(...)` — async
- `paper.removePosition(...)` — happens LAST (line 947)

Any of paths 2–6 that evaluates `paper.getPosition()` in the same tick **before** `removePosition()` completes will also see the position still present and call `handleExit()` again. The result:
- Two LIVE sell orders placed on Binance
- Two `Trade.findByIdAndUpdate()` calls — second one updates `exitPrice` and `pnl` with new kline data
- Balance credited twice (double profit credit)

**Recommended Fix:**  
Check at the top of `handleExit()`:
```typescript
async function handleExit(userId, symbol, mode, accountType, reason) {
  const pos = paper.getPosition(userId, symbol, mode, accountType);
  if (!pos) return;
  paper.removePosition(userId, symbol, mode, accountType); // Remove FIRST to prevent re-entry
  // ... then do DB update and exchange call
}
```
Removing the position immediately (before any `await`) eliminates the re-entrant window.

---

### R-3: Wallet Balance Deducted Before Order Confirmation

**Severity:** `[HIGH]`  
**Files:** `server/src/services/autoTradeEngine.ts:677-700` (PAPER path)

**Root Cause:**  
In the PAPER long handler:
```typescript
paper.setWalletBalance(userId, mode, "USDT", walletBalance - marginRequired, accountType);  // Deducted here
const trade = await Trade.create({...});   // async DB write
paper.setPosition(userId, symbol, mode, ...);  // Position set after DB write
```
If `Trade.create()` throws (MongoDB unavailable, validation error), the wallet balance is already reduced but no Trade document exists and no position is set. The user's in-memory balance is permanently incorrect until server restart / hydration. There is no rollback.

**Recommended Fix:**  
Deduct wallet balance only after successful `Trade.create()`:
```typescript
const trade = await Trade.create({...});
paper.setWalletBalance(userId, mode, "USDT", walletBalance - marginRequired, accountType);
paper.setPosition(...);
```

---

### R-4: `processSubscriptionQueue` Not Atomic — Concurrent Subscribe Calls Can Create Two Combined Sockets

**Severity:** `[HIGH]`  
**Files:** `server/src/services/binanceService.ts:438–477`

**Root Cause:**  
`isProcessingQueue` flag gates re-entrant calls:
```typescript
async function processSubscriptionQueue() {
  if (isProcessingQueue || subscriptionQueue.length === 0) return;
  isProcessingQueue = true;
  // ...
  finally { isProcessingQueue = false; }
}
```
This works for sequential calls, but `subscribeTicker()` is called from `io.on("subscribe")` which is a synchronous event handler. Multiple Socket.IO clients subscribing simultaneously (e.g., page load in two browser tabs) call `subscribeTicker()` synchronously before `processSubscriptionQueue()` has cleared the first item. Both find `isProcessingQueue = false` on their first tick, then race to set it. The micro-task queue ordering means two invocations of `processSubscriptionQueue()` can proceed concurrently, resulting in two `createCombinedSocket()` calls for the same `type` key:
```typescript
if (!existing) {
  const cs = createCombinedSocket([sub.symbol], sub.io, sub.isFutures);
  combinedSockets.set(type, cs);   // SECOND write overwrites first
}
```
The first `CombinedSocket` (with its listeners) is orphaned — its WebSocket connection is open but no longer referenced, and it will never be closed. This is a WebSocket leak.

---

### R-5: `cooldowns` Map Never Purges Expired Entries

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/autoTradeEngine.ts:65, 291`

**Root Cause:**  
```typescript
const cooldowns = new Map<string, number>();
// ...
const expiry = cooldowns.get(cooldownKey) || 0;
if (expiry > Date.now()) { return; }  // Skip if active
```
Expired entries are checked but never deleted. The map grows by one entry per symbol per cooldown activation, indefinitely. With 10 symbols, 10 users, and hourly cooldowns over 30 days, this accumulates 3,000+ entries. The entries are expired (harmless) but never freed.

Additionally, `clearUserState()` only deletes keys that `startsWith(userId)`, but cooldown keys are `userId:symbol` — this is fine. However, there is no path that periodically purges expired entries for active users.

**Recommended Fix:**  
Delete after checking:
```typescript
if (expiry > Date.now()) { return; }
cooldowns.delete(cooldownKey);  // Purge expired entry
```

---

## 2. Memory Leaks

---

### M-1: `PositionManager.signalState` Static Map Never Cleaned Up for Closed Positions

**Severity:** `[HIGH]`  
**Files:** `server/src/services/aqea/positionManager.ts:23–75`

**Root Cause:**  
```typescript
private static signalState = new Map<string, number>();
// Key: `${userId}:${symbol}:${direction}`
```
This map tracks consecutive opposite-direction signals to require 3 confirmations before closing. Entries are set to 0 when confirmation breaks, but entries for closed positions are **never deleted** — only reset to 0. For each closed position, a zero-valued entry remains permanently:
```typescript
this.signalState.set(stateKey, 0);   // Reset but never delete
```
Over the lifetime of the server, every traded symbol accumulates two entries (one for each direction). With 10 symbols and 10 users: 200 permanent entries growing per unique user/symbol pair.

**Recommended Fix:**
```typescript
if (count >= 3) {
  this.signalState.delete(stateKey);  // Delete, don't just zero
  return { action: "CLOSE_FULL", ... };
} else {
  this.signalState.set(stateKey, count);  // Only set when > 0
}
```

---

### M-2: `ShadowSimulator.positions` Static Map Leaks Orphaned Virtual Positions

**Severity:** `[HIGH]`  
**Files:** `server/src/services/aqea/shadowSimulator.ts:23–56`

**Root Cause:**  
```typescript
private static positions = new Map<string, ShadowPosition>();
```
Shadow positions are opened on every non-HOLD decision:
```typescript
ShadowSimulator.openPosition(userId, symbol, side, ...);   // Opens virtual position
```
The `openPosition()` guard prevents opening if a position already exists:
```typescript
if (this.positions.has(key)) return;
```
But the close path (`closePosition()` inside `update()`) removes the entry only when TP3 is hit or SL is hit via `ExitEngine.evaluateExit()`. If the real trade is force-closed by V40, max-hold-time, or PositionManager — paths that do NOT call `ShadowSimulator.closePosition()` — the shadow position remains in the map indefinitely and blocks future shadow entries for that symbol.

Over weeks with 10 symbols: up to 10 permanently stuck virtual positions that never close and never release memory.

**Recommended Fix:**  
Call `ShadowSimulator.closePosition()` or explicitly delete from the map whenever `handleExit()` is called.

---

### M-3: `AnalyticsCache` Has No Eviction — Grows Unboundedly for Many Users/Symbols

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/analyticsCache.ts:19–45`

**Root Cause:**  
```typescript
private static cache = new Map<string, CacheEntry<any>>();
```
Entries expire (`expiry > Date.now()` check) but are only removed on explicit `invalidate()` calls or overwrite on the next cache miss. Expired entries for inactive users and symbols accumulate indefinitely. With 100 users × 20 symbols = 2,000 entries that each hold performance metrics objects (~1–5 KB each). After a month, this could retain 10–50 MB of heap in stale data.

**Recommended Fix:**  
Add a periodic sweep:
```typescript
static {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of this.cache.entries()) {
      if (v.expiry < now) this.cache.delete(k);
    }
  }, 60_000).unref();
}
```

---

### M-4: `BasePredictor` Telemetry Counters Grow Without Bound

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/aqea/ai/BasePredictor.ts:14–17`

**Root Cause:**  
```typescript
protected predictionCount = 0;
protected errorCount = 0;
protected totalLatencyMs = 0;
```
These instance counters increment every prediction call. At 60-second ticks × 10 symbols × CNN+PPO+Transformer = 1,800 increments per hour. After 30 days: `totalLatencyMs` ≈ 1,800 × 24 × 30 × 100ms avg ≈ **130,000,000,000** (130 billion) — a JavaScript safe integer, but `avgLatencyMs = totalLatencyMs / predictionCount` will still compute correctly. The real risk is that `totalLatencyMs` approaches `Number.MAX_SAFE_INTEGER` (9 × 10¹⁵) after ~1.4 years of continuous operation. Not an immediate concern, but worth resetting periodically.

---

### M-5: `priceCache` in `binanceService.ts` Never Evicts Unsubscribed Symbols

**Severity:** `[LOW]`  
**Files:** `server/src/services/binanceService.ts:21, 503, 524`

**Root Cause:**  
```typescript
const priceCache = new Map<string, number>();
```
Prices are written on every tick received from Binance WebSocket. When a symbol is unsubscribed, `unsubscribeTicker()` removes it from `subscribedSymbolKeys` and `cs.symbols`, but **does not delete it from `priceCache`**. Stale prices for removed symbols persist forever. This is minor (each entry is ~50 bytes) but means prices are returned as "current" via `getTickerPriceSync()` for symbols no longer being monitored.

---

## 3. Event Listener Leaks

---

### EL-1: WebSocket Reconnect Creates New Listeners on Each Reconnect

**Severity:** `[HIGH]`  
**Files:** `server/src/services/binanceService.ts:677–763`

**Root Cause:**  
`createCombinedSocket()` is called fresh on every reconnect (via the `ws.on("close")` handler calling `subscribeTicker()` → `processSubscriptionQueue()` → `createCombinedSocket()`). Each call does:
```typescript
ws.on("open", () => { ... });
ws.on("message", (raw) => handleMessage(cs, raw as Buffer));
ws.on("close", (code, reason) => { ... });
ws.on("error", (err) => { ... });
```
The old `WebSocket` instance is closed (not `terminate()`d in the close path), and Node.js garbage-collects it once all references are released. Since `cs` (which holds the old `ws`) is captured in each closure, the old ws object is held alive until the closure is GC'd. In practice this is a transient leak that resolves within a GC cycle, but during reconnect storms (Binance goes down for 5 minutes), each reconnect attempt creates a new ws object before the old one is collected.

More critically: if `createCombinedSocket()` is called while `combinedSockets.get(type)` still exists (race condition R-4 above), the old CombinedSocket's `ws` has **no more references** except the closure's `cs` variable. The ws stays CONNECTING or OPEN with no one calling `close()` on it — a true leak.

---

### EL-2: `SystemManager` Extends `EventEmitter` with No Max Listeners Override

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/systemManager.ts:27`

**Root Cause:**  
`SystemManager extends EventEmitter`. The default EventEmitter max listener count is 10. If more than 10 components attach `stateChanged` or `serviceRegistered` listeners (routes, services, monitoring), Node.js prints a MaxListenersExceededWarning and may indicate a listener leak. The code adds listeners via `this.emit()` calls but it's not clear how many external `systemManager.on("stateChanged", ...)` handlers are registered. There is no `setMaxListeners()` call and no cleanup in any shutdown path.

**Recommended Fix:**  
```typescript
constructor() {
  super();
  this.setMaxListeners(50); // Allow institutional-scale listeners
}
```

---

### EL-3: Socket.IO `subscribe` Does Not Prevent Duplicate Subscriptions Per Client

**Severity:** `[MEDIUM]`  
**Files:** `server/src/index.ts:269–281`

**Root Cause:**  
```typescript
socket.on("subscribe", (payload) => {
  subscribeTicker(symbol, io, isFutures);
});
```
`subscribeTicker()` has a dedup guard (`subscribedSymbolKeys.has(symKey)`), so a second subscription for the same symbol is a no-op at the Binance layer. However, there is no per-socket tracking of which symbols a client has subscribed to. On socket `disconnect`, no cleanup is performed:
```typescript
socket.on("disconnect", (reason) => {
  log(`socket client disconnected: ${socket.id} (${reason})`);
  // NO unsubscribeTicker() call
});
```
If all connected clients disconnect, Binance WebSocket streams continue running indefinitely even though no Socket.IO clients exist to receive the data. The watchdog timeout (30 seconds of silence) would eventually trigger a reconnect, but an idle stream with zero consumers runs forever consuming bandwidth and Binance API weight.

---

## 4. WebSocket Leaks

---

### WS-1: `ws.close()` Called on Error, But Close Handler Re-subscribes Indefinitely

**Severity:** `[HIGH]`  
**Files:** `server/src/services/binanceService.ts:757–759, 740–754`

**Root Cause:**  
```typescript
ws.on("error", (err) => {
  console.error(`[binance-ws] Combined ${type} WebSocket error:`, err.message);
  ws.close();   // triggers "close" event
});
```
The `close` handler triggers reconnect:
```typescript
ws.on("close", (code, reason) => {
  const delay = Math.min(30000, Math.pow(2, cs.reconnectAttempts) * 1000);
  setTimeout(() => {
    cs.reconnectAttempts++;
    subscribeTicker(s, io, isFutures);  // re-subscribes
  }, delay);
});
```
The backoff is `min(30s, 2^n seconds)`, which caps at 30 seconds. If Binance's WebSocket server is returning a permanent error (e.g., IP banned, stream limit exceeded, TLS certificate mismatch), the system will reconnect every 30 seconds **indefinitely** with no circuit breaker. There is no maximum reconnect count and no alerting after N failures.

After 1000 reconnects: `cs.reconnectAttempts = 1000` but `2^1000` is clamped to 30 seconds, so behavior is stable. The missing piece is **human notification** and the ability to stop reconnecting after the system operator needs to act.

---

### WS-2: Watchdog `setTimeout` Leaks on Each Reconnect Attempt

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/binanceService.ts:741–750`

**Root Cause:**  
```typescript
setTimeout(() => {
  cs.reconnectAttempts++;
  const symsToReconnect = Array.from(cs.symbols);
  symsToReconnect.forEach(s => subscribedSymbolKeys.delete(`${s}-${type}`));
  if (symsToReconnect.length > 0) {
    symsToReconnect.forEach(s => subscribeTicker(s, io, isFutures));
  }
}, delay);
```
This `setTimeout` is **not stored in any variable** and cannot be cancelled. If `unsubscribeTicker()` is called while the reconnect timer is pending (e.g., user changes symbols during a network blip), the `setTimeout` fires after the unsubscribe and re-creates the socket even though the user no longer wants the subscription. The reconnect fires into a cleared `subscribedSymbolKeys` set, re-adds the symbol, and creates a new socket.

---

### WS-3: `intentionalClose` Set Can Permanently Block Reconnect

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/binanceService.ts:424, 739, 752`

**Root Cause:**  
```typescript
const intentionalClose = new Set<string>();
// In unsubscribeTicker():
if (cs.symbols.size === 0) {
  intentionalClose.add(type);   // "spot" or "futures"
  cs.ws.close();
}
// In close handler:
if (!intentionalClose.has(typeKey)) { /* reconnect */ }
else { intentionalClose.delete(typeKey); }
```
The `intentionalClose` key is the channel type (`"spot"` or `"futures"`), not the connection ID. If `unsubscribeTicker()` adds `"spot"` to `intentionalClose`, then the close event fires and removes it. This works for clean single-path closes.

However, if a network error fires `ws.on("error")` → `ws.close()` simultaneously with `unsubscribeTicker()` calling `ws.close()`, two close events can fire. The first removes `"spot"` from `intentionalClose`, the second sees it as absent and triggers a reconnect — despite the intent to close. This leaves an orphaned socket reconnecting for a channel the system has logically closed.

---

## 5. Binance API Rate Limit Risks

---

### API-1: No Rate Limit Tracking — IP Ban Risk Under Multi-User Load

**Severity:** `[CRITICAL]`  
**Files:** `server/src/services/binanceService.ts` (all REST functions)

**Root Cause:**  
Every `fetch()` call in `binanceService.ts` has **zero** `AbortSignal`, **zero** timeout, and **zero** response-header inspection for rate limit headers. Binance returns:
- `X-MBX-USED-WEIGHT-1M`: current 1-minute weight used
- `X-MBX-ORDER-COUNT-1M`: orders per minute
- HTTP 429 with `Retry-After` header when limited
- HTTP 418 (permanent IP ban) when limit repeatedly violated

None of these are read or handled. The `signedPost` helpers simply throw on any non-OK status:
```typescript
if (!res.ok) throw new Error(`Binance Spot ${res.status}: ${await res.text()}`);
```
A 429 causes the current trade execution to throw and be caught/logged, but the next tick fires in 60 seconds and makes the same calls regardless.

**Per-tick API call budget analysis:**

| Component | Calls per symbol | Weight (each) |
|-----------|-----------------|---------------|
| `agentService.buildContext` | 1 `getKlines` (200 bars) | 2 |
| `MultiTimeframeEngine` | 5 `getKlines` (250 bars each) | 2 each = 10 |
| `OrderFlowEngine` | 4 calls (OI, funding, liquidations, orderbook) | 2+2+1+5=10 |
| BTCDOM ticker | 1 `getTickerPrice` | 2 |
| `handleExit` | 1 `getKlines` (1 bar) | 2 |
| **Total per symbol** | **~12 calls** | **~26 weight** |

With 10 symbols × 26 weight = **260 weight/tick** (safe for 1 user).  
With 5 users × 260 = **1,300 weight** — **over the 1,200 weight/min limit** even before WebSocket reconnects trigger additional REST calls.

All users share the same server IP. Binance rate limits by IP, not by API key.

**Recommended Fix:**  
1. Parse `X-MBX-USED-WEIGHT-1M` from every response header
2. Back off automatically when weight > 900 (75% of limit)
3. Handle 429 with `Retry-After` delay
4. Deduplicate kline calls: if two users want BTCUSDT 15m data, fetch once and share the result

---

### API-2: `getKlines` Called 5× Per Symbol in MultiTimeframeEngine — No Caching

**Severity:** `[HIGH]`  
**Files:** `server/src/services/aqea/multiTimeframeEngine.ts:49–51`

**Root Cause:**  
```typescript
const results = await Promise.all(
  timeframes.map(tf => this.analyzeTimeframe(symbol, tf))
);
// Each analyzeTimeframe calls: getKlines(symbol, tf, undefined, undefined, 250)
```
For BTCUSDT, five separate REST calls fetch 250 bars each: `1m`, `5m`, `15m`, `1h`, `4h`. If two users both have BTCUSDT in their watchlist, this fires **10 REST calls** for the same symbol data each tick. There is no shared kline cache at the MultiTimeframeEngine level.

The 5-minute `AnalyticsCache` exists for performance metrics but not for raw klines. A kline cache with a 30-second TTL would reduce this to 5 calls per symbol regardless of user count.

---

### API-3: All Fetch Calls in `binanceService.ts` Have No Timeout

**Severity:** `[HIGH]`  
**Files:** `server/src/services/binanceService.ts:84–128`

**Root Cause:**  
```typescript
async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);  // No AbortSignal, no timeout
  if (!res.ok) throw new Error(`...`);
  return res.json() as Promise<T>;
}
```
None of the 11 `fetch()` calls in `binanceService.ts` use `AbortSignal.timeout()`. If Binance's API server hangs (common during high-volatility periods), a single fetch can hold the async chain for 30+ seconds (Node.js default socket timeout). During that time:
- The 60-second tick is blocked for the hung symbol
- Subsequent ticks stack up (not guarded — `tick()` does not check if a previous tick is running)
- All 5 users' processing is blocked in sequence

The `RecoveryManager.checkBinance()` does use `AbortSignal.timeout(2000)` but that only runs the health ping — not the actual trade data fetches.

**Recommended Fix:**  
Wrap all `publicGet` and `signedGet` helpers:
```typescript
async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`...`);
  return res.json() as Promise<T>;
}
```

---

### API-4: Tick Does Not Guard Against Overlapping Execution

**Severity:** `[HIGH]`  
**Files:** `server/src/services/autoTradeEngine.ts:191`

**Root Cause:**  
```typescript
intervalId = setInterval(() => tick().catch(console.error), ms);
```
`setInterval` fires every 60 seconds regardless of whether the previous `tick()` has completed. If processing 5 users × 10 symbols takes >60 seconds (which it can when Binance is slow — each symbol has 12 API calls that could each take 1–2s), the next tick starts while the first is still running. This:
1. Doubles the API weight consumed in that minute
2. Causes R-1 races (two ticks processing the same user/symbol simultaneously)
3. Can exceed Binance rate limits transiently

**Recommended Fix:**  
Use a `isTickRunning` guard or switch to recursive `setTimeout`:
```typescript
async function scheduleTick() {
  await tick().catch(console.error);
  setTimeout(scheduleTick, ms);
}
scheduleTick();
```

---

## 6. Binance API Failure Scenarios

---

### BF-1: LIVE Order Placement Has No Retry — Single Network Error Prevents Trade

**Severity:** `[HIGH]`  
**Files:** `server/src/services/autoTradeEngine.ts:642–675`

**Root Cause:**  
```typescript
try {
  const result = await binance.placeOrder(apiKey, apiSecret, {...});
  // success path
} catch (err: any) {
  console.log(`[TRADE_BLOCKED] LIVE_ERROR symbol=${symbol} err=${err.message}`);
  await Alert.create({ ... });
}
```
A transient 502 or network timeout on the order placement creates an alert and silently drops the trade. There is no retry with exponential backoff. Consequentially:
- The AQEA decision was `LONG` with high confidence
- The signal opportunity is missed entirely
- No reconciliation check verifies whether the order actually landed at Binance (Binance may have received it despite the timeout)

This last point is the most dangerous: if a `placeOrder` call times out but Binance actually executed the order, the server has no record of an open position. A real live position exists on Binance with no monitoring, no stop-loss enforcement, no exit path.

**Recommended Fix:**  
After any `placeOrder` failure, immediately query `GET /api/v3/openOrders` or `GET /fapi/v1/positionRisk` to verify whether an order exists before declaring failure.

---

### BF-2: `setFuturesLeverage` Called Before Every Order — Not Idempotent Failure Mode

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/autoTradeEngine.ts:642`

**Root Cause:**  
```typescript
if (accountType === "FUTURES") await binance.setFuturesLeverage(apiKey, apiSecret, symbol, leverage);
const result = await binance.placeOrder(apiKey, apiSecret, {...});
```
`setFuturesLeverage` is a signed POST to Binance and consumes order count rate limit weight. If it fails (e.g., 400 "Invalid leverage" or 503), the order is not placed. If it succeeds but the `placeOrder` fails, the leverage has been changed on the account permanently. On the next tick, `setFuturesLeverage` is called again — which is fine — but there is a window between leverage set and order failure where manual trades by the user would be at the new (possibly higher) leverage without their knowledge.

---

### BF-3: Exit Price Fetched via Kline After Live Sell — Timing Gap Creates Wrong PnL

**Severity:** `[HIGH]`  
**Files:** `server/src/services/autoTradeEngine.ts:910–911`

**Root Cause:**  
```typescript
// In handleExit — even for LIVE mode:
const klines = await binance.getKlines(symbol, "1m", undefined, undefined, 1);
const exitPrice = klines.length ? parseFloat(klines[0].close) : pos.entryPrice;
```
For LIVE exits, the actual Binance order result from `placeOrder()` (which contains `cummulativeQuoteQty` and `executedQty`) is **not used**. Instead, the exit price is derived from the 1-minute kline close price fetched _after_ the order. This:
1. Can differ from actual fill price by up to 1 ATR during high volatility
2. Makes the stored `pnl` incorrect — users see wrong P&L in the dashboard
3. `placeOrder()` returns `avgPrice` or `cummulativeQuoteQty / executedQty` which is the true fill price

The `handleExit()` function does not receive the `placeOrder` result to extract the true fill price — this is a structural issue.

---

### BF-4: Binance Liquidation API (`getLiquidations`) Uses Non-Standard Adapter

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/aqea/orderFlowEngine.ts:50–57`

**Root Cause:**  
```typescript
const liqs = results[2].status === "fulfilled" ? results[2].value : [];
```
`this.adapter.getLiquidations()` is called via `BinanceAdapter` from a "quantum" subdirectory. The Binance Futures public API does not have a direct liquidation endpoint for historical data — recent liquidations are available via WebSocket stream (`allForceOrders`). If this adapter is stubbing or approximating, the liquidation pressure signal is noise.

---

## 7. Database Connection Leaks

---

### DB-1: No MongoDB Connection Pool Size Configured

**Severity:** `[MEDIUM]`  
**Files:** `server/src/index.ts:99`

**Root Cause:**  
```typescript
await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
```
No `maxPoolSize`, `minPoolSize`, or `socketTimeoutMS` is set. Mongoose defaults to `maxPoolSize: 5`. With 5 users each triggering 12+ parallel DB queries per tick (Trade.find, Settings.findOne, Trade.create, WalletSnapshot.findOneAndUpdate, AqeaAudit.create, AqeaTradeAnalytics.create, etc.), the pool is exhausted quickly and queries queue. Under load:
- `serverSelectionTimeoutMS: 5000` determines how long to wait for a pool connection
- Queued DB operations accumulate behind the 5-connection pool
- Each `await` in the trade pipeline holds a connection for its full duration

**Recommended Fix:**  
```typescript
await mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 20,
  minPoolSize: 5,
  socketTimeoutMS: 30000,
});
```

---

### DB-2: `AqeaAuditService.log()` and `FeatureStore.store()` Fire-and-Forget Under MongoDB Failure

**Severity:** `[MEDIUM]`  
**Files:** `server/src/services/aqea/AqeaAudit.ts:32`, `server/src/services/aqea/featureStore.ts:54`

**Root Cause:**  
Both services check `mongoose.connection.readyState !== 1` and return early. But `FeatureStore.store()` is called from `engine.ts` with:
```typescript
import("./featureStore.js").then(({ FeatureStore }) => {
  FeatureStore.store({...}).catch(err => console.error(...));
});
```
This dynamic import is non-blocking. During MongoDB reconnection (which takes up to 15 seconds per `RecoveryManager`), every tick generates 10 × (users × symbols) feature vectors that are silently dropped. There is no retry queue or backpressure mechanism. Training data is permanently lost during outages.

---

### DB-3: `hydrate()` Runs All Queries Sequentially, Blocking Server Startup

**Severity:** `[LOW]`  
**Files:** `server/src/services/paperState.ts:194–252`

**Root Cause:**  
```typescript
const snapshots = await WalletSnapshot.find().lean();
for (const snap of snapshots) { ... }

const openTrades = await Trade.find({ status: "OPEN" }).lean();
for (const t of openTrades) {
  // Potentially: await Trade.deleteOne({ _id: t._id }); — inside the loop
}
```
The ghost vaporizer calls `await Trade.deleteOne()` inside a `for` loop over all open trades. For N ghost trades, this fires N sequential DELETE operations. With 50 open trades in the DB (10 of which are ghosts), this is 10 sequential round-trips to MongoDB before hydration completes. Server is in `WAITING_FOR_QUANT` state during this time, but the blocking adds latency.

**Recommended Fix:** Collect ghost IDs, then `Trade.deleteMany({ _id: { $in: ghostIds } })`.

---

## 8. Summary Table

| ID | Category | Severity | Description |
|----|----------|----------|-------------|
| R-1 | Race Condition | `[CRITICAL]` | TOCTOU gap allows duplicate order placement for same symbol |
| R-2 | Race Condition | `[CRITICAL]` | handleExit can be called 6× on same position — double close |
| R-3 | Race Condition | `[HIGH]` | Wallet balance deducted before Trade.create() — no rollback |
| R-4 | Race Condition | `[HIGH]` | Concurrent subscribe calls can orphan a WebSocket connection |
| R-5 | Memory | `[MEDIUM]` | cooldowns Map never purges expired entries |
| M-1 | Memory | `[HIGH]` | PositionManager.signalState never removes closed position entries |
| M-2 | Memory | `[HIGH]` | ShadowSimulator positions leak when real trade is force-closed |
| M-3 | Memory | `[MEDIUM]` | AnalyticsCache has no TTL eviction — grows unboundedly |
| M-4 | Memory | `[MEDIUM]` | BasePredictor counters grow without reset (numeric overflow risk after ~1yr) |
| M-5 | Memory | `[LOW]` | priceCache never evicts unsubscribed symbols |
| EL-1 | Event Leak | `[HIGH]` | WS reconnect race can orphan a socket with attached event listeners |
| EL-2 | Event Leak | `[MEDIUM]` | SystemManager EventEmitter has no setMaxListeners — warning risk |
| EL-3 | Event Leak | `[MEDIUM]` | Socket.IO disconnect does not unsubscribe Binance streams |
| WS-1 | WebSocket | `[HIGH]` | No reconnect circuit breaker — retries every 30s forever |
| WS-2 | WebSocket | `[MEDIUM]` | Reconnect setTimeout not cancellable — fires after unsubscribe |
| WS-3 | WebSocket | `[MEDIUM]` | intentionalClose race can leave orphaned reconnecting socket |
| API-1 | Rate Limit | `[CRITICAL]` | No weight tracking — IP ban risk with 5+ users × 10 symbols |
| API-2 | Rate Limit | `[HIGH]` | MTF fetches 5 klines per symbol per tick, no shared cache |
| API-3 | Rate Limit | `[HIGH]` | All fetch() calls have no AbortSignal — hang risk |
| API-4 | Rate Limit | `[HIGH]` | Tick does not guard against overlapping execution |
| BF-1 | API Failure | `[HIGH]` | LIVE order has no retry — missed trade or ghost position risk |
| BF-2 | API Failure | `[MEDIUM]` | setFuturesLeverage before order — failure leaves leverage changed |
| BF-3 | API Failure | `[HIGH]` | Exit uses kline close price, not actual fill price — wrong PnL |
| BF-4 | API Failure | `[MEDIUM]` | Liquidation adapter may be stub — order flow signal unreliable |
| DB-1 | DB Leak | `[MEDIUM]` | MongoDB pool size not configured — defaults to 5 connections |
| DB-2 | DB Leak | `[MEDIUM]` | Feature vectors silently dropped during MongoDB outage |
| DB-3 | DB Leak | `[LOW]` | hydrate() ghost deletion is N sequential DELETEs — slow startup |

---

## Fix Priority Order

1. **R-2** — Add re-entrancy guard to `handleExit` (remove position first before any await)
2. **R-1** — Add execution lock set to `handleLong` / `handleShort`
3. **API-4** — Guard `tick()` against overlapping execution with `isTickRunning` flag
4. **API-1** — Parse `X-MBX-USED-WEIGHT-1M` headers and auto-throttle
5. **API-3** — Add `AbortSignal.timeout(8000)` to all `publicGet/signedPost/signedGet` helpers
6. **BF-1** — After order failure, query open positions to detect ghost fills
7. **BF-3** — Use `cummulativeQuoteQty / executedQty` from placeOrder result as exit price
8. **R-3** — Move wallet balance deduction after `Trade.create()`
9. **M-1** — Delete (not zero) `signalState` entries for closed positions
10. **M-2** — Call `ShadowSimulator.closePosition()` from `handleExit()`
11. **M-3** — Add periodic TTL eviction to `AnalyticsCache`
12. **WS-1** — Add circuit breaker after 20 consecutive reconnect failures
13. **API-2** — Add shared kline cache (30s TTL) keyed by symbol+timeframe
14. **EL-3** — Call `unsubscribeTicker()` on Socket.IO client disconnect
15. **DB-1** — Configure MongoDB pool size to 20
16. **R-4, WS-2, WS-3, DB-2, DB-3, EL-1, EL-2, M-4, M-5** — in any order

---

*Audit complete. No files were modified during this review.*
