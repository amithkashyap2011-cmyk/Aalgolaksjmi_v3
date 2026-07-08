"""
Continuous CNN trainer.

Differences from the old train_cnn_v8..v12.py one-off scripts:
  - Trains on real, freshly-fetched Binance data (data_pipeline.py) across
    the full symbol universe, instead of a fixed 5000-row slice of a CSV
    that doesn't exist on disk.
  - Warm-starts from the current checkpoint and fine-tunes at a lower LR,
    instead of discarding all prior learning on every run — this is what
    makes retraining "continuous" instead of "repeat from scratch".
  - Trains and evaluates with the SAME z-score normalization inference
    uses (feature_schema.py) — the old scripts trained on raw unnormalized
    values while inference normalized, a train/inference skew that alone
    could make the model near-useless regardless of reported accuracy.
  - Recomputes the schema's MEANS/STDS from the live data distribution and
    persists them, since the checked-in schema's stats (mean close ~10089)
    predate the current BTC price regime and are meaningless for low-priced
    alts like SHIBUSDT.
  - Chronological (not random) train/validation split, plus a safety gate:
    a new checkpoint only overwrites the live one if it doesn't regress
    validation F1 beyond a small tolerance. The previous checkpoint is
    always backed up first so a bad promotion can be rolled back.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import classification_report
from torch.utils.data import DataLoader, TensorDataset

from data_pipeline import (SYMBOLS, INTERVAL, add_cnn_features, build_cnn_windows,
                           fetch_klines_paginated)
from cnn_predictor import CNN1D

logger = logging.getLogger("TrainCNN")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT / "models" / "cnn"
CHECKPOINT_PATH = MODEL_DIR / "checkpoints" / "cnn_1d_v1.pt"
BACKUP_PATH = MODEL_DIR / "checkpoints" / "cnn_1d_v1.bak.pt"
STATE_PATH = MODEL_DIR / "train_state.json"
SCHEMA_PATH = PROJECT_ROOT / "shared" / "schemas" / "feature_schema.json"

FEATURE_COLS = ["open", "high", "low", "close", "volume",
                "ret_1", "vol_1", "dist_ma", "hi_low", "std_14", "ma_fast", "ma_slow"]
FEATURE_NAMES_SCHEMA_ORDER = ["open", "high", "low", "close", "volume",
                              "ret_1", "vol_1", "dist_ma", "hi_low", "std_14", "ma_fast", "ma_slow"]

FORWARD_HORIZON = 5
VAL_FRACTION = 0.2
REGRESSION_TOLERANCE = 0.05  # allow a small dip in F1 before refusing to promote
SEQ_LEN = 64

# How many 5m bars of history to train on per symbol (env-overridable).
# 6000 bars ~= 20 days; the old single-request fetch capped at 1000 (~3.5 days).
TRAIN_BARS = int(os.getenv("AQEA_CNN_TRAIN_BARS", "6000"))

# A LONG/SHORT label must at least clear a futures round trip (~2x taker
# fee + slippage) — otherwise the model is trained to trade moves that
# lose money even when it is right.
FEE_FLOOR = float(os.getenv("AQEA_CNN_FEE_FLOOR", "0.0010"))

# Never promote a checkpoint that can't beat random guessing on 3 classes.
MIN_PROMOTE_F1 = 0.34

# Bumped whenever the input representation changes incompatibly.
# v2 = real 64-bar windows + within-window stationarization (v1 was the
# current bar repeated 64 times). On a version change we retrain from
# scratch and reset the promotion baseline — v1 F1 numbers were measured
# on a different task and can't gate v2.
INPUT_VERSION = 2


def _load_state() -> dict:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception:
            pass
    return {}


def _save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


def _label_symbol(future_return: np.ndarray, train_cut: int) -> np.ndarray:
    """Labels one symbol's forward returns.

    Thresholds are per-symbol quantiles computed on the TRAINING rows only
    (rows before train_cut) — the old version took quantiles over the pooled
    train+val frame across all symbols, which (a) leaked the validation
    distribution into the labels and (b) let high-vol coins (SHIB, DOGE)
    monopolize the LONG/SHORT tails while BTC collapsed into HOLD.

    Each threshold is also floored at FEE_FLOOR so a LONG/SHORT label always
    represents a move that would survive round-trip trading costs."""
    train_returns = future_return[:train_cut]
    q_low, q_high = np.nanquantile(train_returns, [0.33, 0.67])
    up_thr = max(float(q_high), FEE_FLOOR)
    dn_thr = min(float(q_low), -FEE_FLOOR)

    labels = np.full(len(future_return), 2, dtype=np.int64)  # HOLD
    labels[future_return > up_thr] = 0                       # LONG
    labels[future_return < dn_thr] = 1                       # SHORT
    return labels


def _build_windowed_dataset() -> dict:
    """Fetches TRAIN_BARS of history per symbol and produces real 64-bar
    training/validation windows (no leakage: labels' thresholds come from
    each symbol's training rows; the split is chronological per symbol)."""
    X_train_parts, y_train_parts, X_val_parts, y_val_parts = [], [], [], []

    for sym in SYMBOLS:
        try:
            raw = fetch_klines_paginated(sym, INTERVAL, TRAIN_BARS)
        except Exception as e:
            logger.warning(f"[TrainCNN] Failed to fetch {sym}: {e}")
            continue
        if raw.empty:
            continue

        g = add_cnn_features(raw).dropna(subset=FEATURE_COLS).reset_index(drop=True)
        g["future_return"] = g["close"].shift(-FORWARD_HORIZON) / g["close"] - 1

        windows, end_rows = build_cnn_windows(g, SEQ_LEN)
        if len(windows) == 0:
            continue

        future = g["future_return"].values.astype(np.float64)
        n = len(g)
        cut = int(n * (1 - VAL_FRACTION))
        labels_all = _label_symbol(future, cut)

        # A window is usable when its final row still has a defined forward
        # return (the last FORWARD_HORIZON rows don't).
        usable = ~np.isnan(future[end_rows])
        windows, end_rows = windows[usable], end_rows[usable]
        labels = labels_all[end_rows]

        in_train = end_rows < cut
        X_train_parts.append(windows[in_train])
        y_train_parts.append(labels[in_train])
        X_val_parts.append(windows[~in_train])
        y_val_parts.append(labels[~in_train])

    if not X_train_parts:
        return {"X_train": np.empty((0, SEQ_LEN, len(FEATURE_COLS)), np.float32),
                "y_train": np.empty(0, np.int64),
                "X_val": np.empty((0, SEQ_LEN, len(FEATURE_COLS)), np.float32),
                "y_val": np.empty(0, np.int64)}

    return {"X_train": np.concatenate(X_train_parts),
            "y_train": np.concatenate(y_train_parts),
            "X_val": np.concatenate(X_val_parts),
            "y_val": np.concatenate(y_val_parts)}


def _write_schema(means: np.ndarray, stds: np.ndarray) -> None:
    payload = {
        "FEATURE_NAMES": FEATURE_NAMES_SCHEMA_ORDER,
        "MEANS": [round(float(m), 6) for m in means],
        "STDS": [round(float(s), 6) for s in stds],
        "DIMENSION": len(FEATURE_NAMES_SCHEMA_ORDER),
        # v2: stats are computed over stationarized 64-bar windows (see
        # data_pipeline.stationarize_windows), not raw per-bar values.
        "INPUT_VERSION": INPUT_VERSION,
    }
    tmp_path = SCHEMA_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(payload, indent=2))
    tmp_path.replace(SCHEMA_PATH)  # atomic on POSIX — inference never sees a half-written file


def _normalize(X: np.ndarray, means: np.ndarray, stds: np.ndarray) -> np.ndarray:
    return (X - means) / (stds + 1e-8)


def _update_training_report(report: dict, hyperparameters: dict) -> None:
    payload = {
        "model": "CNN_1D_V1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metrics": report,
        "hyperparameters": hyperparameters,
    }
    report_file = PROJECT_ROOT / "AQEA_V8_TRAINING_REPORT.md"
    if not report_file.exists():
        return
    content = report_file.read_text()
    import re
    new_json = f"```json\n{json.dumps(payload, indent=2)}\n```"
    if re.search(r"### CNN_1D_V1\n```json.*?```", content, flags=re.DOTALL):
        content = re.sub(r"### CNN_1D_V1\n```json.*?```", f"### CNN_1D_V1\n{new_json}", content, flags=re.DOTALL)
        report_file.write_text(content)


def train_cnn(warm_start: bool = True) -> dict:
    logger.info(f"[TrainCNN] Fetching {TRAIN_BARS} bars/symbol of real history from Binance...")
    data = _build_windowed_dataset()
    X_train, y_train = data["X_train"], data["y_train"]
    X_val, y_val = data["X_val"], data["y_val"]

    if len(X_train) < 500 or len(X_val) < 100:
        msg = (f"Insufficient windows to train reliably (train={len(X_train)}, "
               f"val={len(X_val)}) — skipping this cycle.")
        logger.warning(f"[TrainCNN] {msg}")
        return {"promoted": False, "reason": msg}

    # z-score stats over the stationarized TRAINING windows only (every bar
    # of every window counts) — persisted to the schema so inference
    # normalizes identically.
    flat = X_train.reshape(-1, X_train.shape[2])
    means = flat.mean(axis=0)
    stds = flat.std(axis=0)

    X_train = _normalize(X_train, means, stds).astype(np.float32)
    X_val = _normalize(X_val, means, stds).astype(np.float32)

    # (N, seq, F) -> (N, F, seq) as CNN1D expects
    X_train_t = torch.from_numpy(X_train).permute(0, 2, 1).contiguous()
    y_train_t = torch.from_numpy(y_train)
    X_val_t = torch.from_numpy(X_val).permute(0, 2, 1).contiguous()

    state = _load_state()
    same_input_version = state.get("input_version") == INPUT_VERSION

    model = CNN1D(input_features=len(FEATURE_COLS))
    # A checkpoint trained on a different input representation (e.g. v1's
    # repeated single bar) is not a useful starting point for v2 windows.
    have_prior = warm_start and CHECKPOINT_PATH.exists() and same_input_version
    if have_prior:
        try:
            model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location="cpu"))
            logger.info("[TrainCNN] Warm-started from existing checkpoint.")
        except Exception as e:
            logger.warning(f"[TrainCNN] Could not warm-start ({e}) — training from scratch.")
            have_prior = False
    elif warm_start and not same_input_version:
        logger.info(f"[TrainCNN] Input representation changed (v{state.get('input_version')} -> "
                    f"v{INPUT_VERSION}) — training from scratch and resetting the promotion baseline.")

    lr = 0.0005 if have_prior else 0.001
    epochs = 8 if have_prior else 15

    # The fee floor makes HOLD the majority class by design — weight the
    # loss so LONG/SHORT aren't optimized away into permanent HOLD.
    counts = np.bincount(y_train, minlength=3).astype(np.float64)
    class_weights = torch.tensor(len(y_train) / (3.0 * np.maximum(counts, 1.0)), dtype=torch.float32)
    logger.info(f"[TrainCNN] Class counts LONG/SHORT/HOLD: {counts.astype(int).tolist()}")

    loader = DataLoader(TensorDataset(X_train_t, y_train_t), batch_size=64, shuffle=True)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = optim.Adam(model.parameters(), lr=lr)

    logger.info(f"[TrainCNN] Training ({'fine-tune' if have_prior else 'from scratch'}) "
                f"on {len(X_train)} windows / {len(SYMBOLS)} symbols, lr={lr}, epochs={epochs}")
    for epoch in range(epochs):
        model.train()
        for xb, yb in loader:
            optimizer.zero_grad()
            loss = criterion(model(xb), yb)
            loss.backward()
            optimizer.step()

    model.eval()
    with torch.no_grad():
        val_preds = torch.argmax(model(X_val_t), dim=1).numpy()
    report = classification_report(y_val, val_preds, output_dict=True, zero_division=0)
    # sklearn/numpy scalars (numpy.float64, numpy.bool_ from the >= below)
    # aren't JSON-serializable by FastAPI's encoder — cast to native types
    # at the boundary rather than fighting it downstream.
    new_f1 = float(report["macro avg"]["f1-score"])
    new_accuracy = float(report["accuracy"])
    logger.info(f"[TrainCNN] Validation macro F1: {new_f1:.4f}, accuracy: {new_accuracy:.4f}")

    # Baseline resets on an input-version change — a v1 F1 measured on the
    # repeated-bar task can't gate a v2 windowed model. The random-guess
    # floor still applies regardless.
    prior_f1 = state.get("last_promoted_f1") if same_input_version else None
    promote = bool(new_f1 >= MIN_PROMOTE_F1
                   and (prior_f1 is None or new_f1 >= prior_f1 - REGRESSION_TOLERANCE))

    if promote:
        if CHECKPOINT_PATH.exists():
            BACKUP_PATH.write_bytes(CHECKPOINT_PATH.read_bytes())
        CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
        torch.save(model.state_dict(), CHECKPOINT_PATH)
        _write_schema(means, stds)
        state["last_promoted_f1"] = new_f1
        state["last_promoted_at"] = datetime.now(timezone.utc).isoformat()
        logger.info(f"[TrainCNN] Promoted new checkpoint (F1 {new_f1:.4f} vs prior {prior_f1}).")
    else:
        logger.warning(f"[TrainCNN] REFUSED promotion — new F1 {new_f1:.4f} is below the random-guess "
                        f"floor ({MIN_PROMOTE_F1}) or regresses past tolerance vs prior {prior_f1}. "
                        f"Live checkpoint left untouched.")

    # Explicit flag rather than comparing last_attempt_at/last_promoted_at
    # timestamps — those two are set via separate datetime.now() calls
    # microseconds apart even on a normal promotion, so string-comparing
    # them for "was this refused" is always true and always wrong.
    state["last_attempt_promoted"] = promote
    state["last_attempt_at"] = datetime.now(timezone.utc).isoformat()
    state["last_attempt_f1"] = new_f1
    state["last_attempt_accuracy"] = new_accuracy
    state["rows_trained"] = int(len(X_train))
    state["rows_validated"] = int(len(X_val))
    if promote:
        state["input_version"] = INPUT_VERSION
    _save_state(state)

    _update_training_report(report, {"epochs": epochs, "batch_size": 64, "seq_len": SEQ_LEN,
                                      "features": FEATURE_COLS, "warm_start": have_prior, "lr": lr,
                                      "input_version": INPUT_VERSION, "train_bars": TRAIN_BARS,
                                      "fee_floor": FEE_FLOOR})

    return {"promoted": promote, "f1": new_f1, "accuracy": new_accuracy,
            "rows_trained": int(len(X_train)), "rows_validated": int(len(X_val))}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(train_cnn(), indent=2, default=str))
