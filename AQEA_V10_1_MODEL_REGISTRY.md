# AQEA V10.1 Model Registry Audit

**Timestamp:** 2026-06-14

## Executive Summary
The model registry has been purged of non-functional stubs and incompatible checkpoints to ensure ensemble weighting only considers real-market inference.

---

## 1. Active Ensemble Status

| Predictor | Version | Status | Reasoning |
| :--- | :--- | :--- | :--- |
| **CNN** | **V9_SEQUENCE** | ✅ **ACTIVE** | Verified 64-bar sequence inference. |
| **PPO** | **V1_EXECUTION**| ✅ **ACTIVE** | Verified actor-critic policy output. |
| **Transformer**| **V1_MICRO** | ✅ **ACTIVE** | Functional microstructure predictor. |

## 2. Research Only (Deactivated)

| Predictor | Status | Reasoning |
| :--- | :--- | :--- |
| **Mamba** | **RESEARCH_ONLY** | Checkpoint state_dict mismatch. |
| **LSTM** | **RESEARCH_ONLY** | Placeholder stub (Always HOLD). |
| **xLSTM** | **RESEARCH_ONLY** | Placeholder stub (Always HOLD). |

---

## 3. Enforcement Verified
Startup sequence now explicitly marks these models as `RESEARCH_ONLY` in the `PredictorRegistry`. Any attempt to weigh these models in the active ensemble will result in a 0.0 contribution weight.
