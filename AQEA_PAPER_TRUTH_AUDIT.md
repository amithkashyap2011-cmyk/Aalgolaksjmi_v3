# AQEA Paper Trade Truth Audit (V10)

**Timestamp:** 2026-06-14
**Sample Size:** 8 Trades (6 CLOSED, 2 OPEN/PENDING)

## 1. Storage Verification

- **Storage Method:** MongoDB `trades` collection.
- **Data Integrity:** **PARTIAL**.
- **Found Fields:** `entryPrice`, `exitPrice`, `quantity`, `openedAt`, `closedAt`, `leverage`.
- **Missing/Mocked Fields:**
    - `fees`: **NOT STORED** (Assumed 0.0 in DB).
    - `slippage`: **NOT STORED** (Execution assumed at mid-price).

## 2. PnL Calculation Reality Check

Audit of Trade `6a2e98fd8b38a2676b53cca0`:
- **Calculated PnL (DB):** 8.064
- **Reality PnL (Net of Fees):**
    - Gross: 8.064
    - Entry Fee (0.05%): ~0.50
    - Exit Fee (0.05%): ~0.50
    - Slippage (0.02%): ~0.20
    - **Net Truth PnL:** ~6.864
- **Inflation Rate:** Current DB PnL is **~17% higher** than real-market outcomes.

## 3. Decision Factor Traceability

- **CNN Confidence:** VERIFIED (Captured in `meta.aqea`).
- **Regime:** VERIFIED (Captured in `meta.aqea`).
- **Order Flow:** VERIFIED (Captured in `meta.aqea`).

---

## FINAL VERDICT: **FAILED FOR PRODUCTION**
**Reason:** Paper trading PnL does not account for execution drag, leading to a false sense of profitability.
