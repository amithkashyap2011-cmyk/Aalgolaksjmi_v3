# AQEA AI AUDIT

| MODEL | STATUS | REGISTERED | LOADED | REACHABLE | HEALTHY | PREDICTING |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| CNN | HEALTHY | YES | YES | YES | YES | YES |
| PPO | HEALTHY | YES | YES | YES | YES | YES |
| TRANSFORMER | HEALTHY | YES | YES | YES | YES | YES (Shadow) |
| MAMBA | DEGRADED | YES | NO | NO | NO | NO |
| LSTM | STUB | YES | NO | N/A | NO | NO |
| XLSTM | STUB | YES | NO | N/A | NO | NO |

## ═══════════════════════════════════════════════
## EVIDENCE
## ═══════════════════════════════════════════════

* **CNN:** Registered in `PredictorRegistry.ts:32`. `isHealthy()` check performed in `PredictorRegistry.initialize()`.
* **PPO:** Registered in `PredictorRegistry.ts:33`. Required model check performed.
* **TRANSFORMER:** Registered in `PredictorRegistry.ts:35`.
* **MAMBA:** Registered in `PredictorRegistry.ts:34`. Marks as unhealthy if `isHealthy()` fails (which it does if `quant_engine` is offline or checkpoint is missing).
* **LSTM/XLSTM:** Explicitly forced to `NotAvailablePredictor` (Stub) in `PredictorRegistry.ts:41-44`.

## ═══════════════════════════════════════════════
## HEALTH DETERMINATION
## ═══════════════════════════════════════════════

* **CNN/PPO:** Healthy if `checkpoint_loaded` is true in `quant_engine/main.py` and service is reachable.
* **MAMBA:** Marked `DEGRADED` because it is registered as a functional model but `PredictorRegistry` logs errors if `isHealthy()` fails.
* **LSTM/XLSTM:** Marked `STUB` as they use `NotAvailablePredictor`.
