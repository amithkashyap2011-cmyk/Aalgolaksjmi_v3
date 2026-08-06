# AQEA Gating Audit (V10)

**Timestamp:** 2026-06-14

## 1. Enforcement Check

Every trade entry in `engine.ts` is required to pass through a multi-factor "Gating Layer".

| Rule | Enforcement | Status |
| :--- | :--- | :--- |
| **CNN Confidence >= 0.70** | `if (cnnPrediction.confidence >= 0.70)` | ✅ **ENFORCED** |
| **Trend Guard** | `if (regime.state === "TRENDING_BULL" && score > 20)` | ✅ **ENFORCED** |
| **Order Flow Agreement**| `if (ofResult.votingScore >= 70)` | ✅ **ENFORCED** |
| **Risk Approval** | `if (risk.allowed)` | ✅ **ENFORCED** |

## 2. Violation Report

Audit of 8 total paper trades:
- **Rule Violations:** **NONE**. All closed trades in the DB contain metadata confirming they were triggered by the AQEA_V3.0 strategy and passed all active gates at the time of entry.

---

## Gating Score: **100/100**
The orchestrator correctly enforces all defined gating rules. No "orphaned" or "risk-bypass" trades were found in the database.
