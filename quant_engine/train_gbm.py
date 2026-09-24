"""
Gradient-boosted trees on the same real Binance candles and features as the
CNN (train_cnn.py), for the 5-bar (25 min) direction.

Why: an offline check (2026-09-24) found a tree model on the latest bars beat
the CNN on the same validation data (macro F1 0.39 vs 0.34-0.36; random
~0.33). This trains it properly: stationarized inputs (price relative to the
last close, so the model can't key on which coin it is), per-symbol training-
only label thresholds, chronological splits, and a walk-forward check across
several windows before anything is saved.

Runs SHADOW-only: the server records its votes but they never trade. The
promotion gate below only decides which checkpoint the shadow predictor uses.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import classification_report, f1_score

from data_pipeline import SYMBOLS, INTERVAL, add_cnn_features, build_cnn_windows, fetch_klines_paginated
import train_cnn as C

logger = logging.getLogger("TrainGBM")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT / "models" / "gbm"
CHECKPOINT_PATH = MODEL_DIR / "gbm_v1.joblib"
STATE_PATH = MODEL_DIR / "train_state.json"

FORWARD_HORIZON = 5          # bars; longer horizons showed no edge
LOOKBACK_ROWS = 8            # latest stationarized bars fed to the trees
TRAIN_BARS = int(os.getenv("AQEA_GBM_TRAIN_BARS", str(C.TRAIN_BARS)))
VAL_FRACTION = 0.2
WALK_FORWARD_FOLDS = 3

# Promotion needs a real margin over 3-class random (~0.33), on the final
# split AND on average across the walk-forward windows.
MIN_PROMOTE_F1 = 0.36
MIN_WALK_FORWARD_F1 = 0.35

HYPERPARAMS = dict(max_iter=300, learning_rate=0.05, max_leaf_nodes=31,
                   l2_regularization=1.0, class_weight="balanced", random_state=0)


def _load_state() -> dict:
    try:
        return json.loads(STATE_PATH.read_text())
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


def window_to_row(windows: np.ndarray) -> np.ndarray:
    """(N, seq, F) stationarized windows -> (N, LOOKBACK_ROWS*F) tree input.
    Shared by training and gbm_predictor so both see identical features."""
    tail = windows[:, -LOOKBACK_ROWS:, :]
    return tail.reshape(tail.shape[0], -1).astype(np.float32)


def _symbol_frames() -> list:
    """Per symbol: (rows, future_returns) in chronological order."""
    out = []
    for sym in SYMBOLS:
        try:
            raw = fetch_klines_paginated(sym, INTERVAL, TRAIN_BARS)
        except Exception as e:
            logger.warning(f"[TrainGBM] Failed to fetch {sym}: {e}")
            continue
        if raw.empty:
            continue
        g = add_cnn_features(raw).dropna(subset=C.FEATURE_COLS).reset_index(drop=True)
        future = (g["close"].shift(-FORWARD_HORIZON) / g["close"] - 1).values.astype(np.float64)
        windows, end_rows = build_cnn_windows(g, C.SEQ_LEN)
        usable = ~np.isnan(future[end_rows])
        if usable.sum() < 200:
            continue
        out.append((window_to_row(windows[usable]), future[end_rows[usable]]))
    return out


def _split(frames: list, train_end: float, test_end: float):
    """Chronological per-symbol split at fractions of each symbol's history.
    Label thresholds come from each symbol's training rows only."""
    Xtr, ytr, Xte, yte = [], [], [], []
    for X, fut in frames:
        n = len(X)
        a, b = int(n * train_end), int(n * test_end)
        if a < 100 or b - a < 20:
            continue
        labels = C._label_symbol(fut, a)
        Xtr.append(X[:a]); ytr.append(labels[:a])
        Xte.append(X[a:b]); yte.append(labels[a:b])
    if not Xtr:
        return None
    return np.concatenate(Xtr), np.concatenate(ytr), np.concatenate(Xte), np.concatenate(yte)


def _macro_f1(y, p) -> float:
    return float(f1_score(y, p, average="macro", zero_division=0))


def walk_forward(frames: list) -> list:
    """Expanding-window folds before the final validation slice: train on the
    first k/(K+1) of the pre-validation history, test on the next slice."""
    scores = []
    span = 1 - VAL_FRACTION
    for k in range(1, WALK_FORWARD_FOLDS + 1):
        tr_end = span * k / (WALK_FORWARD_FOLDS + 1)
        te_end = span * (k + 1) / (WALK_FORWARD_FOLDS + 1)
        s = _split(frames, tr_end, te_end)
        if s is None:
            continue
        Xtr, ytr, Xte, yte = s
        m = HistGradientBoostingClassifier(**HYPERPARAMS).fit(Xtr, ytr)
        scores.append(_macro_f1(yte, m.predict(Xte)))
    return scores


def train_gbm() -> dict:
    logger.info(f"[TrainGBM] Fetching {TRAIN_BARS} bars/symbol of real history from Binance...")
    frames = _symbol_frames()
    s = _split(frames, 1 - VAL_FRACTION, 1.0)
    if s is None:
        return {"promoted": False, "reason": "insufficient data"}
    Xtr, ytr, Xv, yv = s
    if len(Xtr) < 1000 or len(Xv) < 200:
        return {"promoted": False, "reason": f"insufficient rows (train={len(Xtr)}, val={len(Xv)})"}

    wf = walk_forward(frames)
    wf_mean = float(np.mean(wf)) if wf else 0.0

    model = HistGradientBoostingClassifier(**HYPERPARAMS).fit(Xtr, ytr)
    preds = model.predict(Xv)
    report = classification_report(yv, preds, output_dict=True, zero_division=0)
    new_f1 = float(report["macro avg"]["f1-score"])
    accuracy = float(report["accuracy"])
    random_f1 = _macro_f1(yv, np.random.default_rng(0).integers(0, 3, len(yv)))

    # Incumbent scored on the SAME validation set (never a stored number).
    prior_f1 = None
    if CHECKPOINT_PATH.exists():
        try:
            prior_f1 = _macro_f1(yv, joblib.load(CHECKPOINT_PATH).predict(Xv))
        except Exception as e:
            logger.warning(f"[TrainGBM] Could not score incumbent ({e}).")

    promote = bool(new_f1 >= MIN_PROMOTE_F1 and wf_mean >= MIN_WALK_FORWARD_F1
                   and (prior_f1 is None or new_f1 > prior_f1))
    logger.info(f"[TrainGBM] val F1 {new_f1:.4f} (random {random_f1:.4f}, incumbent {prior_f1}), "
                f"walk-forward {['%.3f' % x for x in wf]} mean {wf_mean:.4f} -> {'PROMOTE' if promote else 'keep'}")

    if promote:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, CHECKPOINT_PATH)

    state = _load_state()
    state.update({
        "last_attempt_at": datetime.now(timezone.utc).isoformat(),
        "last_attempt_f1": new_f1,
        "last_attempt_accuracy": accuracy,
        "last_attempt_random_f1": random_f1,
        "last_attempt_incumbent_f1": prior_f1,
        "last_attempt_walk_forward_f1": wf,
        "last_attempt_promoted": promote,
        "rows_trained": int(len(Xtr)),
        "rows_validated": int(len(Xv)),
        "horizon_bars": FORWARD_HORIZON,
        "lookback_rows": LOOKBACK_ROWS,
    })
    if promote:
        state["last_promoted_at"] = state["last_attempt_at"]
        state["last_promoted_f1"] = new_f1
    _save_state(state)

    return {"promoted": promote, "f1": new_f1, "accuracy": accuracy, "random_f1": random_f1,
            "walk_forward_f1": wf, "incumbent_f1": prior_f1,
            "rows_trained": int(len(Xtr)), "rows_validated": int(len(Xv))}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(train_gbm(), indent=2, default=str))
