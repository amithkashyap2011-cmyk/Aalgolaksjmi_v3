"""
Bi-LSTM trainer on REAL market history (v2, 2026-09-27).

v1 trained on np.random.randn sequences with injected fake up/down ramps and
was served a single feature row tiled 16 times, so it never saw real price
dynamics or any temporal signal. Live it collapsed to LONG at ~0.998
confidence (42,639 LONG vs 492 SHORT in 24h) and was demoted to SHADOW.

v2 reuses the CNN's real-data pipeline end to end:
  * train_cnn._build_windowed_dataset(): TRAIN_BARS of 5m Binance history per
    symbol, real 64-bar stationarized windows, per-symbol fee-floored
    LONG/SHORT/HOLD labels, chronological train/val split (no leakage);
  * the same 12 features, so live inference can rebuild windows with the
    same code (lstm_predictor._fetch_window).

Promotion gate — a checkpoint is saved only if it
  * beats random 3-class guessing (macro F1 >= MIN_PROMOTE_F1), and
  * is not collapsed (every class predicted on >= MIN_CLASS_SHARE of the
    validation windows and no class on more than MAX_CLASS_SHARE).
The model stays SHADOW in the server regardless; it only earns a vote from
live graded accuracy.
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import classification_report
from torch.utils.data import DataLoader, TensorDataset

from lstm_predictor import BiLSTM
from train_cnn import FEATURE_COLS, MIN_PROMOTE_F1, SEQ_LEN, TRAIN_BARS, _build_windowed_dataset, _normalize

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("TrainLSTM")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT / "models" / "lstm"
CHECKPOINT_PATH = MODEL_DIR / "checkpoints" / "bilstm_v2.pt"
SCHEMA_PATH = MODEL_DIR / "lstm_schema.json"
STATE_PATH = MODEL_DIR / "train_state.json"

INPUT_VERSION = 2
MAX_EPOCHS = 15
PATIENCE = 3
BATCH_SIZE = 256
MIN_CLASS_SHARE = 0.10
MAX_CLASS_SHARE = 0.70
CLASSES = ["LONG", "SHORT", "HOLD"]  # label ids 0/1/2, same as train_cnn


def _macro_f1(model: nn.Module, X: torch.Tensor, y: np.ndarray) -> tuple:
    model.eval()
    with torch.no_grad():
        preds = torch.argmax(model(X), dim=1).numpy()
    report = classification_report(y, preds, output_dict=True, zero_division=0, labels=[0, 1, 2], target_names=CLASSES)
    return float(report["macro avg"]["f1-score"]), preds, report


def train_lstm() -> dict:
    torch.set_num_threads(2)  # share the CPU with the live server + quant engine
    logger.info(f"[TrainLSTM] Fetching {TRAIN_BARS} bars/symbol of real history (CNN pipeline)...")
    data = _build_windowed_dataset()
    X_train, y_train, X_val, y_val = data["X_train"], data["y_train"], data["X_val"], data["y_val"]
    if len(X_train) < 500 or len(X_val) < 100:
        msg = f"Insufficient windows (train={len(X_train)}, val={len(X_val)})"
        logger.warning(f"[TrainLSTM] {msg}")
        return {"promoted": False, "reason": msg}

    flat = X_train.reshape(-1, X_train.shape[2])
    means, stds = flat.mean(axis=0), flat.std(axis=0)
    X_train = _normalize(X_train, means, stds).astype(np.float32)
    X_val = _normalize(X_val, means, stds).astype(np.float32)

    X_train_t, y_train_t = torch.from_numpy(X_train), torch.from_numpy(y_train)
    X_val_t = torch.from_numpy(X_val)  # LSTM takes (batch, seq, features)

    # Inverse-frequency class weights: labels are ~tercile-balanced per symbol,
    # but the fee floor pushes low-vol coins (BTC) toward HOLD.
    counts = np.bincount(y_train, minlength=3).astype(np.float64)
    weights = torch.tensor(counts.sum() / (3 * np.maximum(counts, 1)), dtype=torch.float32)

    model = BiLSTM(input_features=len(FEATURE_COLS), hidden_dim=64, num_layers=2)
    criterion = nn.CrossEntropyLoss(weight=weights)
    optimizer = optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-5)
    loader = DataLoader(TensorDataset(X_train_t, y_train_t), batch_size=BATCH_SIZE, shuffle=True)

    best_f1, best_state, stale = -1.0, None, 0
    for epoch in range(MAX_EPOCHS):
        model.train()
        for xb, yb in loader:
            optimizer.zero_grad()
            loss = criterion(model(xb), yb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
        f1, _, _ = _macro_f1(model, X_val_t, y_val)
        logger.info(f"[TrainLSTM] epoch {epoch + 1}/{MAX_EPOCHS} val macro F1 {f1:.4f}")
        if f1 > best_f1 + 1e-4:
            best_f1, best_state, stale = f1, {k: v.clone() for k, v in model.state_dict().items()}, 0
        else:
            stale += 1
            if stale >= PATIENCE:
                break

    model.load_state_dict(best_state)
    f1, preds, report = _macro_f1(model, X_val_t, y_val)
    shares = np.bincount(preds, minlength=3) / max(len(preds), 1)
    majority = float(np.bincount(y_val, minlength=3).max() / len(y_val))
    collapsed = bool(shares.min() < MIN_CLASS_SHARE or shares.max() > MAX_CLASS_SHARE)
    promote = bool(f1 >= MIN_PROMOTE_F1 and not collapsed)

    result = {
        "model": "LSTM_SEQUENCE_V1",
        "input_version": INPUT_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "train_windows": int(len(X_train)),
        "val_windows": int(len(X_val)),
        "val_macro_f1": round(f1, 4),
        "val_accuracy": round(float(report["accuracy"]), 4),
        "majority_class_rate": round(majority, 4),
        "prediction_shares": {c: round(float(s), 4) for c, s in zip(CLASSES, shares)},
        "per_class_f1": {c: round(float(report[c]["f1-score"]), 4) for c in CLASSES},
        "collapsed": collapsed,
        "promoted": promote,
        "reason": "ok" if promote else ("collapsed onto one class" if collapsed else f"macro F1 {f1:.4f} < {MIN_PROMOTE_F1}"),
    }

    if promote:
        CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
        torch.save(model.state_dict(), CHECKPOINT_PATH)
        tmp = SCHEMA_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps({
            "FEATURE_NAMES": FEATURE_COLS, "SEQ_LEN": SEQ_LEN, "INPUT_VERSION": INPUT_VERSION,
            "MEANS": [round(float(m), 6) for m in means], "STDS": [round(float(s), 6) for s in stds],
        }, indent=2))
        tmp.replace(SCHEMA_PATH)
        logger.info(f"[TrainLSTM] Promoted {CHECKPOINT_PATH.name} (macro F1 {f1:.4f}).")
    else:
        logger.warning(f"[TrainLSTM] NOT promoted: {result['reason']}")

    STATE_PATH.write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    print(json.dumps(train_lstm(), indent=2))
