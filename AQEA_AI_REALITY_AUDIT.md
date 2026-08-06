# AQEA AI Reality Audit (V10)

**Timestamp:** 2026-06-14

## 1. Model Verification

| Predictor | Checkpoint | Status | Reality Check |
| :--- | :--- | :--- | :--- |
| **CNN** | `cnn_1d_v9.pt` | **REAL** | Verified sequence-based inference. |
| **PPO** | `ppo_execution_v1.pt` | **REAL** | Verified actor-critic forward pass. |
| **Transformer**| `transformer_micro_v1.pt` | **REAL** | Verified microstructure inference. |
| **Mamba** | `mamba-research-v1.pt` | **FAIL** | Model loads but fails state_dict match. |
| **LSTM / xLSTM**| N/A | **STUB** | returns `HOLD` with 0 confidence. |

## 2. Default Stubs Detection

The system uses hardcoded fallback stubs in `PredictorRegistry.ts` for non-functional models.

- **`NotAvailablePredictor`:** Used for `LSTM` and `XLSTM`. Returns `HOLD` default.
- **Ensemble Weighting:** `AQEAEngine.ts` (L237) uses a **Mock Performance Object** (`mockPerf`) to weigh model contributions instead of real-time win rates.

## 3. Training Integrity

- **Indicator Mocks:** `quant_engine/train_cnn_v8.py` uses simulated TA-Lib indicators.
- **V9 Upgrade:** Successfully transitioned to real historical sequences (64 bars).

---

## AI Integrity Rating: **82/100**
The inference engine is real and utilizes legitimate deep learning checkpoints for core decisions (CNN, PPO). The primary weakness is the hardcoded ensemble weighting which assumes model performance rather than measuring it.
