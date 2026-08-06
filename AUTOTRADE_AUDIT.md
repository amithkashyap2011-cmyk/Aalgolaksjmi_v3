# AUTOTRADE AUDIT

## ═══════════════════════════════════════════════
## ENGINE STATUS
## ═══════════════════════════════════════════════

| COMPONENT | STATUS | OBSERVATION | EVIDENCE |
| :--- | :--- | :--- | :--- |
| Scheduler | RUNNING | 60s interval active | `autoTradeEngine.ts:144` |
| tick() | ACTIVE | Processes all enabled users | `autoTradeEngine.ts:187` |
| processUser() | ACTIVE | Checks heat & allowed symbols | `autoTradeEngine.ts:204` |
| AI Decision | ACTIVE | Calls AQEAEngine.decide | `autoTradeEngine.ts:295` |
| Execution Path | REACHABLE | handleLong/Short implemented | `autoTradeEngine.ts:326` |
| Shadow Validation | ACTIVE | Tracks outcomes every 5m | `autoTradeEngine.ts:147` |
| Paper Monitor | ACTIVE | 100-trade gate monitoring | `autoTradeEngine.ts:161` |

## ═══════════════════════════════════════════════
## EXECUTION FLOW (LONG)
## ═══════════════════════════════════════════════

1.  `autoTradeEngine.ts` -> `AQEAEngine.decide()`
2.  `handleLong()` called if decision is `LONG`.
3.  Risk profiling via `AdaptiveRiskEngine`.
4.  Size calculation with `WeatherAlpha` multipliers.
5.  Order placement (Binance REST for LIVE, `paperState` for PAPER).
6.  `Trade` document persisted to MongoDB.
7.  `Position` updated in memory.

## ═══════════════════════════════════════════════
## SYSTEM RELIABILITY
## ═══════════════════════════════════════════════

*   **Heat Enforcement:** Correctly prevents over-exposure (Line 217).
*   **Cooldowns:** Prevents over-trading on specific symbols (Line 277).
*   **Exit Management:** `AutoCloseEngine` and `PositionManager` provide dynamic AI exits (Line 345).
