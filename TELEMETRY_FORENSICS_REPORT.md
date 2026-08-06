
# Telemetry Forensics Report — AQEA V12.1 Phase 3

**Date**: 2026-06-16  
**Status**: 🔴 SYSTEMIC FAILURE — Multiple broken pipelines

---

## 1. Pipeline Architecture (Traced)

```
AQEAEngine.decide()
  └─ PredictorRegistry.getAllPredictions(fv)
       └─ BasePredictor.predict(features)
            ├─ runInference(features)         ← Model-specific inference
            └─ AIPredictionTelemetry.create() ← STORES prediction
                                                (prediction_id, model, symbol, direction, confidence, price)

setInterval (every 300,000ms / 5 min)       ← server/src/index.ts:315-321
  ├─ AITelemetryService.resolvePendingOutcomes()   ← Resolves 15m/30m/60m outcomes
  ├─ OutcomeAttributionService.resolvePendingOutcomes()
  └─ AITelemetryService.updateRollingAccuracies()  ← Computes rolling accuracy metrics
```

---

## 2. Predictions Generated? ✅ YES — But Mostly Stubs

| Model | Total Predictions | LONG | SHORT | HOLD | Notes |
|-------|-------------------|------|-------|------|-------|
| CNN_1D_V1 | 13 | 11 | 2 | 0 | ✅ Only model producing directional signals |
| PPO_EXECUTION_V1 | 16 | 0 | 0 | **16** | 🔴 100% HOLD — broken |
| TRANSFORMER_MICRO_V1 | 495 | 0 | 0 | **495** | 🔴 100% HOLD — shape mismatch fallback |
| MAMBA_V1 | 11 | 0 | 0 | **11** | 🔴 100% HOLD — stub model |
| LSTM | 868 | 0 | 0 | **868** | 🔴 100% HOLD — NotAvailablePredictor stub |
| XLSTM | 868 | 0 | 0 | **868** | 🔴 100% HOLD — NotAvailablePredictor stub |

**Total predictions**: 2,271  
**Predictions in last 24h**: 1,032

### Root Cause Analysis:
- **CNN** is the ONLY model producing real directional signals (LONG/SHORT)
- **PPO** always returns HOLD because the model outputs SKIP_TRADE (mapped to HOLD by the predictor)
- **Transformer/Mamba** return HOLD due to model errors caught and translated to neutral stubs
- **LSTM/XLSTM** are registered as `NotAvailablePredictor` stubs — they always emit HOLD with confidence=0

---

## 3. Predictions Stored? ✅ YES

- **Collection**: `aipredictiontelemetries` (Mongoose model: `AIPredictionTelemetry`)
- **Total records**: 2,271
- **Schema fields**: prediction_id, model_name, symbol, direction, confidence, timestamp, priceAtPrediction, outcome15m/30m/60m, isCorrect
- **Indexes**: prediction_id, model_name, symbol, timestamp

---

## 4. Outcomes Resolved? ✅ YES — Partially

- **Scheduler**: `setInterval` every 5 minutes (index.ts:315-321)
- **Records with outcome60m**: 1,390 / 2,271 (61.2%)
- **Remaining 881**: Either too recent (<60 min old) or Binance kline fetch failed

### Outcome Accuracy:

| Metric | Value |
|--------|-------|
| Correct (isCorrect=true) | **311** |
| Incorrect (isCorrect=false) | **1,079** |
| **Overall Accuracy** | **22.4%** |

This is **worse than random** (expected ~33% for 3 classes), because:
1. HOLD predictions are evaluated as "correct" only if price doesn't move >0.1% — but crypto always moves
2. 5 out of 6 models emit nothing but HOLD, guaranteeing near-100% LOSS outcomes

---

## 5. Rolling Accuracy Computed? ✅ YES

| Model | Rolling-50 | Rolling-100 | Rolling-500 |
|-------|-----------|-------------|-------------|
| CNN_1D_V1 | **38.5%** | 38.5% | 38.5% |
| PPO_EXECUTION_V1 | 0% | 0% | 0% |
| TRANSFORMER_MICRO_V1 | 0% | 0% | 30.4% |
| MAMBA_V1 | 0% | 0% | 0% |

- **Latest computation**: 2026-06-16T10:43:55 (today)
- **Records in ModelAccuracyMetrics**: 88

---

## 6. Failure Classification

The telemetry pipeline itself is **working correctly** — predictions are stored, outcomes are resolved, and accuracies are computed. The problem is upstream:

| Failure Point | Classification | Impact |
|--------------|---------------|--------|
| PPO always predicts HOLD | **A — Model produces no signal** | PPO is useless noise |
| Transformer shape mismatch → fallback HOLD | **A — Model fails silently** | Transformer contributes nothing |
| Mamba stub checkpoint rejected | **A — Model intentionally disabled** | Expected, non-blocking |
| LSTM/XLSTM are NotAvailablePredictor stubs | **A — Stubs emitting noise** | Pollutes telemetry with 1,736 useless records |
| CNN is the only real model | **Not a failure** | But 38.5% accuracy is below random |

### Verdict: **Classification A** — Predictions generated but most models are non-functional stubs

The telemetry infrastructure (B/C/D) is healthy. The failure is in the **models themselves**, not the pipeline.

---

## 7. Recommendations

1. **Stop logging LSTM/XLSTM telemetry** — These are `NotAvailablePredictor` stubs that pollute the database
2. **Stop evaluating PPO as a directional predictor** — It's an execution timing model, not a LONG/SHORT model
3. **Fix Transformer input pipeline** — Model expects 20 microstructure features, receives 5-9
4. **Retrain PPO** — Current weights produce uniform random output (conf=1/7=0.143)
5. **Add inference validation** — Flag when a model returns identical outputs N times consecutively
