# ROOT CAUSE REPORT: AQEA Critical Risk Remediation

## 1. RiskEngine Bypass in AutoTradeEngine
- **File:** `server/src/services/autoTradeEngine.ts`
- **Method:** `handleLong`
- **Current Behavior:** Previous version used `maxPositionSizePct` from user settings (default 21%) to calculate allocation without institutional RiskEngine validation. Although a patch was attempted, inconsistency remains between legacy "buy" logic and the new RiskEngine.
- **Expected Behavior:** ALL entry paths must call `RiskEngine.validateTrade()` as the single source of truth for sizing and approval.
- **Severity:** CRITICAL

## 2. Extreme Position Sizing (21%)
- **File:** `server/src/models/Settings.ts`, `server/src/services/agentService.ts`
- **Property:** `maxPositionSizePct`
- **Current Behavior:** Default value is 21%, leading to excessive notional exposure per trade.
- **Expected Behavior:** Standard institutional limit is 1-2% risk per trade.
- **Severity:** HIGH

## 3. Uncontrolled Futures Leverage (47x)
- **File:** `server/src/services/autoTradeEngine.ts` (handleLong)
- **Current Behavior:** Leverage is not explicitly capped or is derived from dangerous legacy calculations, reaching 47x in some paper trades.
- **Expected Behavior:** Hard cap of 10x leverage enforced across all symbols.
- **Severity:** CRITICAL

## 4. Paper Futures Margin Accounting Error
- **File:** `server/src/services/autoTradeEngine.ts`
- **Method:** `handleLong` (Paper Order section)
- **Current Behavior:** `paper.setWalletBalance(userId, mode, "USDT", usdt - cost, accountType)` where `cost = qty * price`. This deducts the FULL NOTIONAL value from the liquid balance.
- **Expected Behavior:** Only the REQUIRED MARGIN (`(qty * price) / leverage`) should be deducted for futures.
- **Severity:** HIGH (Causes artificial liquidity exhaustion)

## 5. Dangerous Directional Fallback
- **File:** `server/src/services/agentService.ts`
- **Method:** `decideAction`
- **Current Behavior:** If a primary signal (e.g., LONG) is blocked by the checklist, the system attempts a fallback to the opposite direction (e.g., EXIT/SHORT) and may open a trade if that checklist passes.
- **Expected Behavior:** A checklist failure for the primary signal should result in `NO_TRADE` unless a new high-conviction signal is independently generated.
- **Severity:** MEDIUM

## 6. Portfolio Exposure Breach
- **File:** N/A (Systemic)
- **Current Behavior:** No centralized enforcement of total portfolio exposure. 30 positions at 21% each = 630% notional exposure.
- **Expected Behavior:** Hard cap of 10% total portfolio notional exposure.
- **Severity:** CRITICAL
