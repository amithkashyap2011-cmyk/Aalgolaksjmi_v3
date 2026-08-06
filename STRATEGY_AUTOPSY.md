# STRATEGY AUTOPSY: WORST 20 LOSSES

### #1 XRPUSDT (SELL) - PnL: $-128.62
- **Strategy:** AQEA_V3.0
- **Entry Reason:** N/A
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Legacy V3.0 Controller (Bypasses AI Safety Gates)
- **Source Ref:** server/src/services/autoTradeEngine.ts (Legacy logic permitting unweighted entries)
- **Trade Blocked?** SHOULD HAVE BEEN BLOCKED. The engine allowed this trade because it did not validate the strategy ID against modern safety gates.

### #2 BTCUSDT (SELL) - PnL: $-50.64
- **Strategy:** AQEA_V3.0
- **Entry Reason:** N/A
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Legacy V3.0 Controller (Bypasses AI Safety Gates)
- **Source Ref:** server/src/services/autoTradeEngine.ts (Legacy logic permitting unweighted entries)
- **Trade Blocked?** SHOULD HAVE BEEN BLOCKED. The engine allowed this trade because it did not validate the strategy ID against modern safety gates.

### #3 BNBUSDT (SELL) - PnL: $-40.49
- **Strategy:** AQEA_V3.0
- **Entry Reason:** N/A
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Legacy V3.0 Controller (Bypasses AI Safety Gates)
- **Source Ref:** server/src/services/autoTradeEngine.ts (Legacy logic permitting unweighted entries)
- **Trade Blocked?** SHOULD HAVE BEEN BLOCKED. The engine allowed this trade because it did not validate the strategy ID against modern safety gates.

### #4 ETHUSDT (SELL) - PnL: $-5.39
- **Strategy:** AQEA_V3.0
- **Entry Reason:** N/A
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=LONG, PPO=HOLD
- **Approval:** Legacy V3.0 Controller (Bypasses AI Safety Gates)
- **Source Ref:** server/src/services/autoTradeEngine.ts (Legacy logic permitting unweighted entries)
- **Trade Blocked?** SHOULD HAVE BEEN BLOCKED. The engine allowed this trade because it did not validate the strategy ID against modern safety gates.

### #5 ETHUSDT (SELL) - PnL: $-4.51
- **Strategy:** AQEA_V3.0
- **Entry Reason:** N/A
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Legacy V3.0 Controller (Bypasses AI Safety Gates)
- **Source Ref:** server/src/services/autoTradeEngine.ts (Legacy logic permitting unweighted entries)
- **Trade Blocked?** SHOULD HAVE BEEN BLOCKED. The engine allowed this trade because it did not validate the strategy ID against modern safety gates.

### #6 XRPUSDT (BUY) - PnL: $-1.20
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #7 DOGEUSDT (BUY) - PnL: $-0.97
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #8 XRPUSDT (BUY) - PnL: $-0.86
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #9 SOLUSDT (BUY) - PnL: $-0.82
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #10 BNBUSDT (SELL) - PnL: $-0.75
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=HOLD, PPO=HOLD
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #11 SHIBUSDT (SELL) - PnL: $-0.71
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** TP3_HIT
- **Model Votes:** CNN=N/A, PPO=N/A
- **Analysis:** Loss attributed to AQEA_V8.0 due to lack of specific AI metadata or late exit.

### #12 ETHUSDT (BUY) - PnL: $-0.70
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #13 BTCUSDT (BUY) - PnL: $-0.61
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** TP3_HIT
- **Model Votes:** CNN=N/A, PPO=N/A
- **Analysis:** Loss attributed to AQEA_V8.0 due to lack of specific AI metadata or late exit.

### #14 SHIBUSDT (BUY) - PnL: $-0.51
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #15 BNBUSDT (BUY) - PnL: $-0.51
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #16 DOGEUSDT (SELL) - PnL: $-0.49
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** TP3_HIT
- **Model Votes:** CNN=N/A, PPO=N/A
- **Analysis:** Loss attributed to AQEA_V8.0 due to lack of specific AI metadata or late exit.

### #17 ETHUSDT (BUY) - PnL: $-0.47
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #18 DOGEUSDT (SELL) - PnL: $-0.47
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** TP3_HIT
- **Model Votes:** CNN=N/A, PPO=N/A
- **Analysis:** Loss attributed to AQEA_V8.0 due to lack of specific AI metadata or late exit.

### #19 SOLUSDT (BUY) - PnL: $-0.46
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

### #20 ETHUSDT (BUY) - PnL: $-0.45
- **Strategy:** AQEA_V8.0
- **Entry Reason:** Adaptive SL at 2x ATR. Regime: SIDEWAYS_ACCUMULATION. Quality: 77. Weather Adj: 1.00x
- **Exit Reason:** STOP_LOSS
- **Model Votes:** CNN=N/A, PPO=N/A
- **Approval:** Hybrid Engine (Track A/B) / Exit Engine
- **Source Ref:** server/src/services/aqea/exitEngine.ts (evaluateExit)
- **Trade Blocked?** NO. Exit was correct (STOP_LOSS), but the entry occurred in a low-conviction environment or SL was too tight for current volatility.

