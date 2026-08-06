# FALLBACK AUDIT REPORT: Directional Fallback Logic

## 1. Investigation Findings
- **Log Entry:** `DIRECTIONAL FALLBACK ADAUSDT: EXIT → LONG`
- **Cause:** In `agentService.ts`, the `decideAction` method implemented a recovery loop where a checklist failure for the primary signal triggered an attempt to validate the opposite direction.
- **Risk:** This logic effectively bypassed the intentional "NO_TRADE" cooling period and forced a market entry during periods of low consensus or high volatility.
- **Institutional Violation:** Fallback entries are statistically less stable and often result in "Revenge Entry" patterns in noisy environments.

## 2. Remediation Applied
- **File:** `server/src/services/agentService.ts`
- **Change:** Removed the `fallbackUsed` block entirely.
- **New Behavior:** Any checklist failure (Mandatory or Risk category) result in an immediate `NO_TRADE` decision.
- **Safety Enforcement:** The `RiskEngine.validateTrade` call in `autoTradeEngine.ts` acts as the final gate, ensuring no trade can open if exposure or drawdown limits are breached, regardless of the signal source.

## 3. Fallback Status
- **Status:** **DISABLED**
- **Effective Date:** 2026-06-10
- **Validation:** Integration tests confirm that `decideAction` returns `NO_TRADE` upon primary checklist failure.
