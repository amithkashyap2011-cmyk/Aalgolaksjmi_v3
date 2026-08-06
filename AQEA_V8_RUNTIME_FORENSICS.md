# AQEA V8.2 CNN Runtime Forensics Report

**Timestamp:** 2026-06-14

## Executive Summary
The CNN model is technically healthy but behaviorally collapsed at runtime due to a **Critical Feature Misalignment** between the TypeScript orchestrator and the Python inference engine. The model is receiving indicators (RSI, MACD) in slots trained for entirely different metrics (Returns, Volatility), leading to extreme input saturation.

---

## 1. Forensic Audit Results

| Item | Status | Observation |
| :--- | :--- | :--- |
| **Checkpoint Verification** | ✅ **VERIFIED** | Loaded: `2f361d61...`. Timestamp: `Jun 14 17:28`. Matches retrained V8.1. |
| **Inference Architecture** | ✅ **VERIFIED** | Input: 12, Hidden: 128, Output: 3. Matches training spec. |
| **Feature Normalization** | ❌ **FAILED** | **CRITICAL DISCREPANCY:** TS sends [RSI, MACD, ATR, EMA], but Model expects [Returns, Vol, Dist_MA, Std]. |
| **Prediction Distribution** | ❌ **FAILED** | Stress test: 0% HOLD. Manual tests show saturation (Logits: `[-1.1, 2.38, -8.3]`). |
| **Weight Integrity** | ✅ **VERIFIED** | FC2 bias is near-zero. Weights are not being overwritten. |
| **Debug Endpoint** | ✅ **VERIFIED** | `POST /debug/cnn` active and used to trace raw/normalized tensors. |

---

## 2. Root Cause Analysis
The model was retrained in Phase 3 using a new set of 12 institutional features (Log Returns, Rolling Volatility, Distance from MA). However, the `CNNPredictor.ts` service was not updated to match this mapping. 

**Example of corruption:**
- Model expects `ret_1` (Mean: 0, Std: 0.01) in Slot 6.
- TS sends `rsi` (Value: 50) in Slot 6.
- Normalized value becomes: `(50 - 0) / 0.01 = 5000.0`.
- The CNN input layer sees a value of **5,000 standard deviations from the mean**, causing an immediate neuron blowout and biased output.

---

## 3. Success Criteria Verification
- **LONG %:** 24%
- **SHORT %:** 76%
- **HOLD %:** 0%
- **RESULT:** **FAIL** (Missing HOLD class).

## 4. Next Steps
1. Synchronize feature mapping in `server/src/services/aqea/ai/CNNPredictor.ts` to match `quant_engine/train_cnn_v8.py`.
2. Update `CNNPredictor.py` to handle both legacy and V8 feature sets or version the API.
3. Rerun Stress Test to verify healthy distribution.
