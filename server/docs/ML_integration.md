# ML & DL Integration Guide

## Overview

AALGOLAKSHMI V2 uses a **three‑layer** decision architecture:

```
┌──────────────────────────────────────────────┐
│            Fused Decision Engine              │
│                                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│   │  Rule‑   │  │   ML     │  │   DL     │  │
│   │  Based   │  │ (forest/ │  │ (LSTM/   │  │
│   │ (50%)    │  │  XGB)    │  │  Xformer)│  │
│   │          │  │ (25%)    │  │ (25%)    │  │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│        └──────┬───────┴──────┬─────┘         │
│               ▼              ▼               │
│         Weighted Fusion (scaled by conf)     │
│               │                              │
│         ┌─────▼─────┐                        │
│         │ Checklist  │  ← ALWAYS enforced    │
│         │ (24 spoke) │  ← no model bypass    │
│         └─────┬─────┘                        │
│               ▼                              │
│     LONG / EXIT / NO_TRADE                   │
└──────────────────────────────────────────────┘
```

### Blending Weights

| Layer       | Weight | Notes                               |
|-------------|--------|-------------------------------------|
| Rule‑Based  | 0.50   | Indicators + animal behaviour model |
| ML Model    | 0.25   | Scaled by `mlPrediction.confidence` |
| DL Model    | 0.25   | Scaled by `dlPrediction.confidence` |

When a model returns `confidence = 0` (stub), its effective weight is 0 and the surplus is redistributed to the rule‑based layer.

**Risk enforcement is absolute** — the 24‑spoke checklist always has final veto regardless of model outputs.

---

## 1. ML Layer — Classical Models

### File: `server/src/services/mlModelService.ts`

#### Interface

```typescript
interface MLFeatures {
  // Indicators (23 features total)
  rsi14, ema9, ema21, ema55, sma200, macdHist, atr14,
  bollingerBW, stdDev20, changePercent,
  // Animal weights (10 features)
  wEagle, wTiger, wCheetah, wFox, wTortoise,
  wDog, wOwl, wCow, wSpider, wLion,
  // Risk state (3 features)
  dailyPnlRatio, tradesToday, openPositionCount
}

interface MLPrediction {
  profitProbability: number;  // 0–1
  expectedReturn: number;     // e.g. 0.012 = +1.2%
  confidence: number;         // 0–1 (0 = stub/unknown)
  modelName: string;
}

async function predict(features: MLFeatures): Promise<MLPrediction>
```

#### Current state: **Stub** — returns `{ profitProbability: 0.5, confidence: 0 }`

### How to train & deploy

#### Step 1 — Export training data from MongoDB

```python
# scripts/export_training_data.py
import pymongo, pandas as pd, json

client = pymongo.MongoClient("mongodb://127.0.0.1:27017")
db = client["aalgolakshmi"]

# Each closed trade with its context snapshot = one training sample
trades = list(db.trades.find({"status": "CLOSED"}))

rows = []
for t in trades:
    row = {
        "symbol": t["symbol"],
        "side": t["side"],
        "entryPrice": t["entryPrice"],
        "exitPrice": t.get("exitPrice", t["entryPrice"]),
        "pnl": t.get("pnl", 0),
        "profitable": 1 if t.get("pnl", 0) > 0 else 0,
        # Add indicator features from the trade's meta/context
        # (you'll extend the Trade model to store context snapshot)
    }
    rows.append(row)

df = pd.DataFrame(rows)
df.to_csv("training_data.csv", index=False)
print(f"Exported {len(df)} samples")
```

#### Step 2 — Train with scikit‑learn / XGBoost

```python
# scripts/train_ml_model.py
import pandas as pd, joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

df = pd.read_csv("training_data.csv")

FEATURES = [
    "rsi14", "ema9", "ema21", "ema55", "sma200",
    "macdHist", "atr14", "bollingerBW", "stdDev20", "changePercent",
    "wEagle", "wTiger", "wCheetah", "wFox", "wTortoise",
    "wDog", "wOwl", "wCow", "wSpider", "wLion",
    "dailyPnlRatio", "tradesToday", "openPositionCount",
]
TARGET = "profitable"

X = df[FEATURES].fillna(0)
y = df[TARGET]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Option A: Random Forest
rf = RandomForestClassifier(n_estimators=200, max_depth=8)
rf.fit(X_train, y_train)
print(f"RF accuracy: {rf.score(X_test, y_test):.4f}")
joblib.dump(rf, "models/rf_model.pkl")

# Option B: XGBoost
xgb = XGBClassifier(n_estimators=200, max_depth=6, learning_rate=0.05)
xgb.fit(X_train, y_train)
print(f"XGB accuracy: {xgb.score(X_test, y_test):.4f}")
joblib.dump(xgb, "models/xgb_model.pkl")
```

#### Step 3 — Serve with FastAPI

```python
# ml_service/main.py
from fastapi import FastAPI
from pydantic import BaseModel
import joblib, numpy as np

app = FastAPI()
model = joblib.load("models/xgb_model.pkl")

class Features(BaseModel):
    rsi14: float; ema9: float; ema21: float; ema55: float
    sma200: float; macdHist: float; atr14: float
    bollingerBW: float; stdDev20: float; changePercent: float
    wEagle: float; wTiger: float; wCheetah: float; wFox: float
    wTortoise: float; wDog: float; wOwl: float; wCow: float
    wSpider: float; wLion: float
    dailyPnlRatio: float; tradesToday: int; openPositionCount: int

@app.post("/predict")
def predict(f: Features):
    X = np.array([[getattr(f, k) for k in Features.model_fields]])
    prob = model.predict_proba(X)[0][1]  # P(profitable)
    return {
        "profitProbability": float(prob),
        "expectedReturn": float(prob - 0.5) * 0.02,  # rough mapping
        "confidence": 0.8,    # set based on validation metrics
        "modelName": "xgb-v1",
    }
```

Run: `uvicorn ml_service.main:app --host 0.0.0.0 --port 8000`

#### Step 4 — Connect from Node.js

Replace the stub in `mlModelService.ts`:

```typescript
export async function predict(features: MLFeatures): Promise<MLPrediction> {
  const res = await fetch("http://localhost:8000/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(features),
  });
  if (!res.ok) throw new Error(`ML service error: ${res.status}`);
  return res.json() as Promise<MLPrediction>;
}
```

---

## 2. DL Layer — Sequence Models

### File: `server/src/services/dlModelService.ts`

#### Interface

```typescript
interface SequenceBar {
  open: number; high: number; low: number; close: number; volume: number;
  rsi?: number; ema9?: number; ema21?: number; macdHist?: number;
}

interface SequenceInput {
  symbol: string;
  timeframe: string;
  window: SequenceBar[];   // 60–120 timesteps
}

interface DLPrediction {
  directionScore: number;  // >0.5 bullish, <0.5 bearish
  predictedMove: number;   // e.g. +0.008 = +0.8%
  confidence: number;      // 0–1
  attentionWeights?: number[];
  modelName: string;
}

async function predictSequence(input: SequenceInput): Promise<DLPrediction>
```

#### Current state: **Stub** — returns `{ directionScore: 0.5, confidence: 0 }`

### How to train & deploy

#### Step 1 — Prepare sequential data

```python
# scripts/prepare_sequences.py
import pymongo, numpy as np

client = pymongo.MongoClient("mongodb://127.0.0.1:27017")
db = client["aalgolakshmi"]

# Fetch raw klines or use Binance CSV exports
# Shape each sample: (window_size, features) → label
WINDOW = 60
FEATURES = ["open", "high", "low", "close", "volume", "rsi", "ema9", "ema21", "macdHist"]

# ... load bars, compute indicators, create sliding windows
# X.shape = (num_samples, 60, 9)
# y.shape = (num_samples,)  → 1 if price rose > 0.5% in next 5 bars, else 0

np.save("X_train.npy", X_train)
np.save("y_train.npy", y_train)
```

#### Step 2 — Train LSTM / Transformer

```python
# scripts/train_dl_model.py
import torch, torch.nn as nn
import numpy as np

X = torch.tensor(np.load("X_train.npy"), dtype=torch.float32)
y = torch.tensor(np.load("y_train.npy"), dtype=torch.float32)

class LSTMModel(nn.Module):
    def __init__(self, input_dim=9, hidden=128, layers=2):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden, layers, batch_first=True, dropout=0.2)
        self.head = nn.Sequential(nn.Linear(hidden, 64), nn.ReLU(), nn.Linear(64, 1), nn.Sigmoid())

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.head(out[:, -1, :]).squeeze(-1)

model = LSTMModel()
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = nn.BCELoss()

for epoch in range(50):
    pred = model(X)
    loss = loss_fn(pred, y)
    opt.zero_grad(); loss.backward(); opt.step()
    if epoch % 10 == 0:
        print(f"Epoch {epoch}: loss={loss.item():.4f}")

torch.save(model.state_dict(), "models/lstm_v1.pt")
```

#### Step 3 — Serve with FastAPI

```python
# dl_service/main.py
from fastapi import FastAPI
from pydantic import BaseModel
import torch, numpy as np

app = FastAPI()
model = LSTMModel()  # same class definition
model.load_state_dict(torch.load("models/lstm_v1.pt"))
model.eval()

class Bar(BaseModel):
    open: float; high: float; low: float; close: float; volume: float
    rsi: float = 50; ema9: float = 0; ema21: float = 0; macdHist: float = 0

class SeqInput(BaseModel):
    symbol: str; timeframe: str; window: list[Bar]

@app.post("/predict")
def predict(inp: SeqInput):
    arr = np.array([[getattr(b, f) for f in ["open","high","low","close","volume","rsi","ema9","ema21","macdHist"]] for b in inp.window])
    x = torch.tensor(arr, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        score = model(x).item()
    return {
        "directionScore": score,
        "predictedMove": (score - 0.5) * 0.02,
        "confidence": 0.75,
        "modelName": "lstm-v1",
    }
```

Run: `uvicorn dl_service.main:app --host 0.0.0.0 --port 8001`

#### Step 4 — Connect from Node.js

Replace the stub in `dlModelService.ts`:

```typescript
export async function predictSequence(input: SequenceInput): Promise<DLPrediction> {
  const res = await fetch("http://localhost:8001/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`DL service error: ${res.status}`);
  return res.json() as Promise<DLPrediction>;
}
```

---

## 3. Fusion Logic (in `agentService.ts`)

### How it works

```
fusedLong = RULE_W × rLong + ML_W × mlConf × mlLong + DL_W × dlConf × dlLong
fusedExit = RULE_W × rExit + ML_W × mlConf × mlExit + DL_W × dlConf × dlExit
fusedNo   = RULE_W × rNo   + ML_W × mlConf × mlNo   + DL_W × dlConf × dlNo
```

- When ML/DL confidence = 0 (stubs), effective weight = 0 → all weight goes to rule‑based
- When ML/DL are trained, their confidence rises → they contribute proportionally
- **Checklist always has final veto** — no model can bypass:
  - `maxDailyLoss`
  - `maxPositionSizePct`
  - Mandatory trend alignment checks
  - Dog/Tortoise frequency checks

### Customising weights

Edit `RULE_WEIGHT`, `ML_WEIGHT`, `DL_WEIGHT` constants at the top of `decideAction()` in `agentService.ts`. They should always sum to 1.0.

---

## 4. Environment Variables

Add to `.env` when deploying Python services:

```env
ML_SERVICE_URL=http://localhost:8000
DL_SERVICE_URL=http://localhost:8001
```

---

## 5. Extending the Trade model

To capture training labels, add a `contextSnapshot` field to the Trade schema:

```typescript
contextSnapshot: {
  type: mongoose.Schema.Types.Mixed,
  default: null,
}
```

Then in `autoTradeEngine.ts`, save the `MLFeatures` object as `meta.contextSnapshot` on each trade so you can export complete labelled training data.

---

## 6. Retraining schedule

1. Export data weekly (or after N new trades)
2. Retrain models with the latest data
3. A/B test: run old model + new model side by side in PAPER mode
4. Promote when new model's Sharpe > old model's Sharpe on holdout
5. Update the FastAPI service with the new model weights

---

## 7. Input Validation (Phase 5)

Both services now validate inputs before sending to the remote model:

### ML Feature Validation

```typescript
import { validateFeatures } from "./mlModelService";

// Clamps RSI to 0-100, weights to 0-1, floors ATR/BW/StdDev at 0,
// integer-floors tradesToday and openPositionCount
const safe = validateFeatures(rawFeatures);
```

All 23 features are range-checked. Invalid values are clamped to sane
defaults rather than rejected, ensuring the model always receives
well-formed input.

### DL Sequence Validation

```typescript
import { validateSequenceInput, MIN_WINDOW_SIZE } from "./dlModelService";

const result = validateSequenceInput(input);
if (!result.valid) console.log(result.error);
```

Checks:
- `symbol` is non-empty
- `timeframe` is non-empty
- `window.length >= MIN_WINDOW_SIZE` (10 bars)

If validation fails, `predictSequence()` returns the stub prediction
(confidence = 0) and logs a warning.

---

## 8. Health Check Endpoints (Phase 5)

Both services expose a `healthCheck()` function to verify connectivity:

```typescript
import { healthCheck as mlHealth } from "./mlModelService";
import { healthCheck as dlHealth } from "./dlModelService";

const ml = await mlHealth();
// { available: boolean, url: string, latencyMs: number, modelName: string|null, error: string|null }

const dl = await dlHealth();
```

When `ML_SERVICE_URL` / `DL_SERVICE_URL` is not set, health check
immediately returns `{ available: false, error: "...not configured" }`.

When a URL is configured, it pings `<url>/health` with the configured
timeout and reports latency + model name.

---

## 9. Timeout & Graceful Fallback (Phase 5)

### Environment Variables

| Variable        | Default | Description                      |
|-----------------|---------|----------------------------------|
| `ML_SERVICE_URL`| `""`    | ML micro-service URL (empty=stub)|
| `ML_TIMEOUT_MS` | `3000`  | ML HTTP timeout in ms            |
| `DL_SERVICE_URL`| `""`    | DL micro-service URL (empty=stub)|
| `DL_TIMEOUT_MS` | `5000`  | DL HTTP timeout in ms            |

### Fallback behaviour

Both `predict()` and `predictSequence()` use `AbortController` for
timeout enforcement. On **any** error (timeout, HTTP error, network
failure), they:

1. Log a `console.warn` with the error details
2. Return the **stub prediction** (confidence = 0)
3. **Never throw** — the agent continues with rule-based scoring only

This ensures the trading engine degrades gracefully when ML/DL services
are unavailable.

---

## 10. Agreement Bonus & EXIT Veto (Phase 5)

### ML/DL Agreement Bonus

When **both** ML and DL models:
- Agree on direction (both bullish OR both bearish)
- Have meaningful confidence (both > 0.3)

A small **agreement bonus** (up to `AGREEMENT_BONUS_MAX = 0.08`) is
added to the agreed-upon side. This rewards model consensus without
letting it dominate.

```
agreementBonus = min(AGREEMENT_BONUS_MAX, min(mlConf, dlConf) × 0.1)
```

### EXIT Daily-Loss Veto

When `|dailyPnl| >= maxDailyLoss`, the engine vetoes EXIT actions to
NO_TRADE. This prevents the system from taking further action (including
closing positions that might trigger new trades) when the daily loss
limit has been breached.

### Fusion Metadata

Every `Decision` now includes a `fusion` field:

```typescript
interface FusionMeta {
  effRuleWeight: number;   // effective rule layer weight
  effMLWeight: number;     // effective ML weight (scaled by confidence)
  effDLWeight: number;     // effective DL weight (scaled by confidence)
  modelsAgree: boolean;    // whether ML & DL agreed on direction
  agreementBonus: number;  // bonus applied (0 if no agreement)
}
```

### Configurable Weights

Weights are now **exported constants** from `agentService.ts`:

```typescript
export const RULE_WEIGHT = 0.50;
export const ML_WEIGHT   = 0.25;
export const DL_WEIGHT   = 0.25;
export const AGREEMENT_BONUS_MAX = 0.08;
```

---

## 11. Test Coverage (Phase 5)

| Suite                | TC Range     | Count | Description                               |
|----------------------|-------------|-------|-------------------------------------------|
| `mlDlStubs.test.ts`  | TC-K1–K14   | 14    | buildMLFeatures, predict, buildSequenceInput, predictSequence |
| `phase5ML.test.ts`   | TC-M1–M30   | 30    | Validation, health check, stubs, fallback, fusion, agreement, EXIT veto |
| `agentService.test.ts`| TC-J1–J25  | 25    | scoreLong, scoreExit, scoreNoTrade, decideAction |
| **Total Phase 5**    |             | **69**| Combined ML/DL integration test cases     |
