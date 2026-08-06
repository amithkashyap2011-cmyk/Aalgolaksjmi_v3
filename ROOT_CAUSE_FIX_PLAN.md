# ROOT_CAUSE_FIX_PLAN.md

## #1 Legacy Strategy Leakage (AQEA_V3.0)
*   **Exact File:** `server/src/services/autoTradeEngine.ts`
*   **Exact Function:** `processSymbol`
*   **Exact Code Path:** The logic that initiates trades based on the `strategy` field fails to cross-reference against the mandatory `AQEA_V8.0` safety gate. This allows unmanaged legacy entries to bypass modern risk weighting.
*   **Expected Profit Impact:** +$230.08 (Eradication of 94% of total monetary loss).

## #2 Exit Engine Sensitivity (STOP_LOSS)
*   **Exact File:** `server/src/services/aqea/exitEngine.ts`
*   **Exact Function:** `evaluateExit`
*   **Exact Code Path:** Line 57-58: `if (isLong ? currentPrice <= state.sl : currentPrice >= state.sl)`. The hardcoded comparison lacks a volatility buffer (e.g., 0.1% or ATR-linked margin), causing noise-driven exits in the current `SIDEWAYS_ACCUMULATION` regime.
*   **Expected Profit Impact:** +$10.00 (Reduction of noise exits while maintaining protection).
