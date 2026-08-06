# Model Readiness Report — AQEA V12.1 Phase 2

**Date**: 2026-06-16  
**Test Method**: Direct Python inference with `torch` (quant engine offline, tested via script)

---

## Summary

| Model | Checkpoint | Size | Loads | Inference | Registry Status | **VERDICT** |
|-------|-----------|------|-------|-----------|-----------------|-------------|
| **CNN** | `cnn_1d_v1.pt` | 66KB | ✅ | ✅ `SHORT` conf=1.0 | enabled, weight=0.15 | **PASS** |
| **PPO** | `ppo_execution_v1.pt` | 232KB | ✅ | ✅ `SKIP_TRADE` conf=0.16 | enabled, weight=0.15 | **DEGRADED** |
| **Mamba** | `mamba-research-v1.pt` | 19KB | ❌ | ❌ Stub rejected | disabled, weight=0 | **OFFLINE** |
| **Transformer** | `transformer_micro_v1.pt` | 3.3MB | ✅ | ❌ Shape mismatch | enabled (shadow) | **FAIL** |

---

## Detailed Results

### CNN-1D — ✅ PASS

```
[CNN] Initializing with checkpoint: models/cnn/checkpoints/cnn_1d_v1.pt
[CNN] Found checkpoint. Size: 0.06 MB
[CNN] Successfully loaded weights
[CNN] Verification PASS: Input=12, Schema=12
[CNN] INFERENCE_OK dir=SHORT conf=1.0000
```

- **Architecture**: Conv1d(12→32→64) → MaxPool → Dense(128→3)
- **Feature Schema**: 12 features (FeatureSchemaV8) — matches model input layer
- **Concern**: Confidence = 1.0000 is suspicious (model may be overfit or data is trivial test input)
- **Telemetry**: 13 predictions, 5 correct, 8 wrong. Rolling-50 accuracy: **38.5%**
- **Registry**: `id: "cnn-lstm"`, enabled: true, weight: 0.15

### PPO Execution Agent — ⚠️ DEGRADED

```
[PPO] Initializing with checkpoint: models/ppo/checkpoints/ppo_execution_v1.pt
[PPO] Found checkpoint. Size: 0.23 MB
[PPO] Successfully loaded weights
[PPO] INFERENCE_OK action=SKIP_TRADE conf=0.1557
```

- **Architecture**: Linear(32→256→128) → Actor(7 actions) + Critic(1)
- **Actions**: SKIP_TRADE, NORMAL_SIZE, REDUCE_SIZE, INCREASE_SIZE, CONSERVATIVE_EXIT, STANDARD_EXIT, AGGRESSIVE_EXIT
- **Problem**: Model ALWAYS outputs SKIP_TRADE with conf ~0.155 (≈1/7 = uniform distribution)
- **Root Cause**: Model weights appear random/untrained — confidence equals the uniform distribution probability
- **Telemetry**: 16 predictions, ALL are HOLD, 0 correct out of 16 resolved
- **Rolling accuracy**: **0%** across all windows (r50, r100, r500)

### Mamba — 🔳 OFFLINE (Expected)

```
[Mamba] Found checkpoint. Size: 0.02 MB
[Mamba] WARNING: Checkpoint is a stub (< 5MB). Marking as DEGRADED.
```

- **Checkpoint exists** but is only 19KB — a stub placeholder, not a real trained model
- **Built-in guard**: `if size_mb < 5.0` → rejects the checkpoint
- **Registry**: `id: "mamba-hybrid"`, enabled: false, weight: 0
- **Expected behavior** — Mamba was never trained for production

### Transformer Micro — 🔴 FAIL

```
[Transformer] Found checkpoint. Size: 3.27 MB
[Transformer] Successfully loaded weights
[TRANSFORMER] INFERENCE_FAIL: mat1 and mat2 shapes cannot be multiplied (30x5 and 20x64)
```

- **Architecture**: `TransformerMicroModel(input_dim=20, d_model=64, nhead=4, num_layers=3)`
- **Expects**: Sequences of shape `(batch, seq_len, 20)` — 20 microstructure features per bar
- **Received in test**: `(1, 30, 5)` — wrong feature count
- **The TS-side caller** (`ensembleService.ts:332`) passes `SequenceInput` (9 features max), NOT the 20 microstructure features the Transformer expects
- **Checkpoint is real** (3.3MB, loads successfully) but the **feature pipeline sends wrong shape**
- **Registry**: Not directly listed — runs via shadow mode only
- **Telemetry**: 495 predictions, ALL are HOLD, rolling accuracy: 30% (r500 only)

---

## Checkpoint Inventory

```
models/
├── cnn/checkpoints/
│   ├── cnn_1d_v1.pt     (67,608 bytes)  ← ACTIVE
│   └── cnn_1d_v9.pt     (250,153 bytes) ← UNUSED
├── ppo/checkpoints/
│   └── ppo_execution_v1.pt (238,082 bytes) ← ACTIVE (random weights)
├── mamba/checkpoints/
│   └── mamba-research-v1.pt (19,002 bytes) ← STUB
└── transformer/checkpoints/
    └── transformer_micro_v1.pt (3,429,727 bytes) ← ACTIVE (shape mismatch)
```

---

## Model Registry Weights (modelRegistry.ts)

| ID | Name | Enabled | Weight | Status |
|----|------|---------|--------|--------|
| xgboost | XGBoost | ✅ | 0.30 | healthy |
| lightgbm | LightGBM | ✅ | 0.20 | healthy |
| transformer | Transformer | ✅ | 0.20 | healthy |
| cnn-lstm | CNN-LSTM | ✅ | 0.15 | healthy |
| ppo-agent | PPO Agent | ✅ | 0.15 | healthy |
| mamba-hybrid | Mamba-3 | ❌ | 0.00 | unavailable |
| xlstm | xLSTM | ✅ | 0.20 | healthy |
| deepseek-v3 | DeepSeek-V3 | ✅ | 0.15 | healthy |
| claude-3.5-sonnet | Claude 3.5 | ✅ | 0.10 | healthy |

> ⚠️ **Registry marks PPO and Transformer as "healthy" when they are functionally broken.**
> The health check only verifies the Python quant service is running, not that inference produces valid outputs.
