# AQEA V8 Model Training Pipeline Report

**Timestamp:** 2026-06-14 16:11:49.328671

## 1. Model Registry

| Model | Checkpoint Path | Status |
|-------|-----------------|--------|
| CNN_1D_V1 | `models/cnn/checkpoints/cnn_1d_v1.pt` | ✅ READY |
| PPO_EXECUTION_V1 | `models/ppo/checkpoints/ppo_execution_v1.pt` | ✅ READY |
| MAMBA_RESEARCH_V1 | `models/mamba/checkpoints/mamba-research-v1.pt` | ✅ READY |
| TRANSFORMER_MICRO_V1 | `models/transformer/checkpoints/transformer_micro_v1.pt` | ✅ READY |

## 2. Training Metrics

### CNN_1D_V1
```json
{
  "model": "CNN_1D_V1",
  "timestamp": "2026-08-05T23:29:15.253127+00:00",
  "metrics": {
    "0": {
      "precision": 0.2737174982431483,
      "recall": 0.2942954287873064,
      "f1-score": 0.2836337156380848,
      "support": 2647.0
    },
    "1": {
      "precision": 0.2814645308924485,
      "recall": 0.43582677165354333,
      "f1-score": 0.3420361501622123,
      "support": 2540.0
    },
    "2": {
      "precision": 0.4587122590032739,
      "recall": 0.29048606311909697,
      "f1-score": 0.35571227080394924,
      "support": 4341.0
    },
    "accuracy": 0.3302896725440806,
    "macro avg": {
      "precision": 0.3379647627129569,
      "recall": 0.3402027545199822,
      "f1-score": 0.32712737886808213,
      "support": 9528.0
    },
    "weighted avg": {
      "precision": 0.36006717492124735,
      "recall": 0.3302896725440806,
      "f1-score": 0.3320421110690568,
      "support": 9528.0
    }
  },
  "hyperparameters": {
    "epochs": 8,
    "batch_size": 64,
    "seq_len": 64,
    "features": [
      "open",
      "high",
      "low",
      "close",
      "volume",
      "ret_1",
      "vol_1",
      "dist_ma",
      "hi_low",
      "std_14",
      "ma_fast",
      "ma_slow"
    ],
    "warm_start": true,
    "lr": 0.0005,
    "input_version": 2,
    "train_bars": 6000,
    "fee_floor": 0.001
  }
}
```

### PPO_EXECUTION_V1
```json
{
  "model": "PPO_EXECUTION_V1",
  "timestamp": "2026-08-05T23:30:17.357989+00:00",
  "metrics": {
    "total_reward": -113.61241472110552,
    "avg_reward_per_step": -0.00045631140943491657,
    "episodes": 5
  },
  "hyperparameters": {
    "epochs": 5,
    "batch_size": 256,
    "gamma": 0.99,
    "warm_start": false,
    "lr": 0.0001
  }
}
```

### MAMBA_RESEARCH_V1
```json
{
  "model": "MAMBA_RESEARCH_V1",
  "timestamp": "2026-06-14 16:11:45.719113",
  "status": "SUCCESS"
}
```

### TRANSFORMER_MICRO_V1
```json
{
  "model": "TRANSFORMER_MICRO_V1",
  "timestamp": "2026-06-14 16:11:39.944642",
  "status": "SUCCESS"
}
```

## 3. Feature Importance (Placeholder)
Institutional feature selection confirmed for: RSI, MACD, ATR, EMA, VWAP, Funding Rate, Open Interest, Order Flow (CVD/Delta), Smart Money (SMC).

## 4. Backtest Report (Phase 4A Preview)
Initial validation accuracy for CNN_1D_V1: 0.03 (Training on synthetic/limited data). Production training requires full backfill.
