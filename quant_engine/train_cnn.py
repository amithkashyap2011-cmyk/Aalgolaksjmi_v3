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
try:
    torch.set_num_threads(2)
    torch.set_num_interop_threads(2)
except Exception:
    pass
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import classification_report
from torch.utils.data import DataLoader, TensorDataset

from data_pipeline import (SYMBOLS, INTERVAL, add_cnn_features, build_cnn_windows,
                           fetch_klines_paginated)
from cnn_predictor import CNN1D
import promotion_gate

logger = logging.getLogger("TrainCNN")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT / "models" / "cnn"
CHECKPOINT_PATH = MODEL_DIR / "checkpoints" / "cnn_1d_v1.pt"
BACKUP_PATH = MODEL_DIR / "checkpoints" / "cnn_1d_v1.bak.pt"
STATE_PATH = MODEL_DIR / "train_state.json"
SCHEMA_PATH = PROJECT_ROOT / "shared" / "schemas" / "feature_schema.json"
# The normalization stats belong to the checkpoint they were fitted with:
# rolling back the weights without them silently mis-scales every input.
SCHEMA_BACKUP_PATH = SCHEMA_PATH.with_suffix(".bak.json")

FEATURE_COLS = ["open", "high", "low", "close", "volume",
                "ret_1", "vol_1", "dist_ma", "hi_low", "std_14", "ma_fast", "ma_slow"]
FEATURE_NAMES_SCHEMA_ORDER = ["open", "high", "low", "close", "volume",
                              "ret_1", "vol_1", "dist_ma", "hi_low", "std_14", "ma_fast", "ma_slow"]

FORWARD_HORIZON = 5
VAL_FRACTION = 0.2
# Early stopping needs its own slice so the final validation set is used exactly
# once (reporting + promotion). Layout per symbol, oldest -> newest:
#   train | embargo | tune (early stopping) | embargo | validation
TUNE_FRACTION = 0.12
SEQ_LEN = 64
SEED = 0

# How many 5m bars of history to train on per symbol (env-overridable).
# 12000 bars ~= 42 days (was 6000 ~= 21 days: a single market regime). Raising it
# further grows peak RAM roughly linearly (8 symbols x bars x 64 x 12 float32),
# which matters on the 8 GB host, so it stays env-tunable.
TRAIN_BARS = int(os.getenv("AQEA_CNN_TRAIN_BARS", "12000"))

# A LONG/SHORT label must at least clear a futures round trip (~2x taker
# fee + slippage) — otherwise the model is trained to trade moves that
# lose money even when it is right.
FEE_FLOOR = float(os.getenv("AQEA_CNN_FEE_FLOOR", "0.0010"))

# Floor only: never promote a checkpoint that can't beat random guessing on 3
# classes. The real gate is promotion_gate.decide_promotion (margin over the
# incumbent + a proven positive net edge after fees).
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


def _split_masks(end_rows: np.ndarray, n: int, tune_fraction: float, horizon: int = None):
    """Boolean masks (train, tune, val) over windows identified by the row each
    one ends on, plus the two cut points. Layout, oldest -> newest:
    train | embargo | tune | embargo | validation. The embargo is `horizon` rows
    because a label looks that many bars ahead."""
    H = FORWARD_HORIZON if horizon is None else horizon
    cut_val = int(n * (1 - VAL_FRACTION))
    cut_tune = int(n * (1 - VAL_FRACTION - tune_fraction)) if tune_fraction > 0 else cut_val
    in_train = end_rows + H < cut_tune
    in_val = end_rows >= cut_val
    in_tune = ((end_rows >= cut_tune) & (end_rows + H < cut_val)) if tune_fraction > 0 else np.zeros_like(in_train)
    return in_train, in_tune, in_val, cut_tune, cut_val


def _empty_dataset() -> dict:
    e = np.empty((0, SEQ_LEN, len(FEATURE_COLS)), np.float32)
    z = np.empty(0, np.int64)
    return {"X_train": e, "y_train": z, "X_tune": e.copy(), "y_tune": z.copy(),
            "X_val": e.copy(), "y_val": z.copy(), "r_val": np.empty(0, np.float64)}


def _build_windowed_dataset(tune_fraction: float = 0.0) -> dict:
    """Fetches TRAIN_BARS of history per symbol and produces real 64-bar
    windows split chronologically per symbol:

        train | embargo | tune | embargo | validation

    * The embargo is FORWARD_HORIZON rows: a label looks that many bars ahead,
      so without it the last training labels were computed from prices inside
      the next slice.
    * `tune` (only when tune_fraction > 0) is for early stopping, so the
      validation slice is touched exactly once (report + promotion). The old LSTM
      picked its best epoch on the validation set and then reported that number.
    * Label thresholds come from each symbol's TRAINING rows only.
    * `r_val` is the raw forward return of each validation window, so trainers
      can score the net-of-fee return of the model's calls, not only F1."""
    H = FORWARD_HORIZON
    keys = ("X_train", "y_train", "X_tune", "y_tune", "X_val", "y_val", "r_val")
    parts = {k: [] for k in keys}

    for sym in SYMBOLS:
        try:
            raw = fetch_klines_paginated(sym, INTERVAL, TRAIN_BARS)
        except Exception as e:
            logger.warning(f"[TrainCNN] Failed to fetch {sym}: {e}")
            continue
        if raw.empty:
            continue

        g = add_cnn_features(raw).dropna(subset=FEATURE_COLS).reset_index(drop=True)
        g["future_return"] = g["close"].shift(-H) / g["close"] - 1

        windows, end_rows = build_cnn_windows(g, SEQ_LEN)
        if len(windows) == 0:
            continue

        future = g["future_return"].values.astype(np.float64)
        n = len(g)
        _, _, _, cut_tune, cut_val = _split_masks(np.empty(0, dtype=np.int64), n, tune_fraction)
        if cut_tune - H < 200:
            continue
        # Thresholds only from returns whose whole look-ahead closes before `tune`.
        labels_all = _label_symbol(future, cut_tune - H)

        # A window is usable when its final row still has a defined forward
        # return (the last FORWARD_HORIZON rows don't).
        usable = ~np.isnan(future[end_rows])
        windows, end_rows = windows[usable], end_rows[usable]
        labels = labels_all[end_rows]
        rets = future[end_rows]

        in_train, in_tune, in_val, _, _ = _split_masks(end_rows, n, tune_fraction)
        parts["X_train"].append(windows[in_train]); parts["y_train"].append(labels[in_train])
        parts["X_val"].append(windows[in_val]); parts["y_val"].append(labels[in_val])
        parts["r_val"].append(rets[in_val])
        if tune_fraction > 0:
            parts["X_tune"].append(windows[in_tune]); parts["y_tune"].append(labels[in_tune])
        del windows

    if not parts["X_train"]:
        return _empty_dataset()

    out = _empty_dataset()
    for k in keys:
        if parts[k]:
            out[k] = np.concatenate(parts[k])
    return out


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


def _normalize_inplace(X: np.ndarray, means: np.ndarray, stds: np.ndarray) -> np.ndarray:
    """Same result as _normalize without allocating a second copy of a large
    float32 window array (matters on the 8 GB host)."""
    X -= means.astype(np.float32)
    X /= (stds.astype(np.float32) + 1e-8)
    return X


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


def _predict(model: nn.Module, X_t: torch.Tensor) -> np.ndarray:
    model.eval()
    with torch.no_grad():
        return torch.argmax(model(X_t), dim=1).numpy()


def _macro_f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    report = classification_report(y_true, y_pred, labels=[0, 1, 2], output_dict=True, zero_division=0)
    return float(report["macro avg"]["f1-score"])


def _to_tensor(X: np.ndarray) -> torch.Tensor:
    # (N, seq, F) -> (N, F, seq) as CNN1D expects
    return torch.from_numpy(X).permute(0, 2, 1).contiguous()


def _score_incumbent(X_val_raw: np.ndarray, y_val: np.ndarray, r_val: np.ndarray):
    """Macro F1 (and net edge) of the live checkpoint on THIS validation set,
    normalized with the INCUMBENT's own saved statistics. The old code fed the
    incumbent inputs normalized with the CANDIDATE's new statistics, so the
    comparison was skewed by a normalization mismatch."""
    if not CHECKPOINT_PATH.exists() or not SCHEMA_PATH.exists():
        return None, None
    try:
        schema = json.loads(SCHEMA_PATH.read_text())
        if schema.get("INPUT_VERSION") != INPUT_VERSION:
            return None, None
        means = np.array(schema["MEANS"], dtype=np.float32)
        stds = np.array(schema["STDS"], dtype=np.float32)
        incumbent = CNN1D(input_features=len(FEATURE_COLS))
        incumbent.load_state_dict(torch.load(CHECKPOINT_PATH, map_location="cpu"))
        preds = _predict(incumbent, _to_tensor(_normalize(X_val_raw, means, stds).astype(np.float32)))
        return _macro_f1(y_val, preds), promotion_gate.economic_edge(preds, r_val)
    except Exception as e:
        logger.warning(f"[TrainCNN] Could not score incumbent ({e}).")
        return None, None


def rollback_cnn() -> bool:
    """Restore the previous checkpoint AND the normalization stats it was fitted
    with. Returns False if there is nothing to roll back to."""
    if not (BACKUP_PATH.exists() and SCHEMA_BACKUP_PATH.exists()):
        return False
    CHECKPOINT_PATH.write_bytes(BACKUP_PATH.read_bytes())
    tmp = SCHEMA_PATH.with_suffix(".json.tmp")
    tmp.write_bytes(SCHEMA_BACKUP_PATH.read_bytes())
    tmp.replace(SCHEMA_PATH)
    state = _load_state()
    state["rolled_back_at"] = datetime.now(timezone.utc).isoformat()
    _save_state(state)
    return True


def train_cnn(warm_start: bool = False) -> dict:
    """Train from scratch each cycle and promote only through promotion_gate.

    `warm_start` is off by default and ignored unless AQEA_CNN_ALLOW_WARM_START=1:
    the previous checkpoint has already trained on most of the current
    validation window (each cycle refetches a rolling ~6-week history), so a
    warm-started candidate inherits that leakage and its validation F1 is not an
    honest out-of-sample number."""
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    logger.info(f"[TrainCNN] Fetching {TRAIN_BARS} bars/symbol of real history from Binance...")
    data = _build_windowed_dataset(tune_fraction=TUNE_FRACTION)
    X_train, y_train = data["X_train"], data["y_train"]
    X_tune, y_tune = data["X_tune"], data["y_tune"]
    X_val_raw, y_val, r_val = data["X_val"], data["y_val"], data["r_val"]

    if len(X_train) < 500 or len(X_tune) < 100 or len(X_val_raw) < 100:
        msg = (f"Insufficient windows to train reliably (train={len(X_train)}, "
               f"tune={len(X_tune)}, val={len(X_val_raw)}) — skipping this cycle.")
        logger.warning(f"[TrainCNN] {msg}")
        return {"promoted": False, "reason": msg}

    # z-score stats over the stationarized TRAINING windows only (every bar
    # of every window counts) — persisted to the schema so inference
    # normalizes identically. Train/tune are normalized in place (memory).
    flat = X_train.reshape(-1, X_train.shape[2])
    means = flat.mean(axis=0)
    stds = flat.std(axis=0)
    del flat

    X_train = _normalize_inplace(X_train, means, stds)
    X_tune = _normalize_inplace(X_tune, means, stds)
    X_val = _normalize(X_val_raw, means, stds).astype(np.float32)  # raw copy kept for the incumbent

    X_train_t, y_train_t = _to_tensor(X_train), torch.from_numpy(y_train)
    X_tune_t, X_val_t = _to_tensor(X_tune), _to_tensor(X_val)
    del X_train, X_tune

    state = _load_state()
    same_input_version = state.get("input_version") == INPUT_VERSION

    model = CNN1D(input_features=len(FEATURE_COLS))
    allow_warm = os.getenv("AQEA_CNN_ALLOW_WARM_START") == "1"
    have_prior = bool(warm_start and allow_warm and CHECKPOINT_PATH.exists() and same_input_version)
    if warm_start and not allow_warm:
        logger.info("[TrainCNN] warm_start ignored (would contaminate validation) — training from scratch.")
    if have_prior:
        try:
            model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location="cpu"))
            logger.info("[TrainCNN] Warm-started from existing checkpoint (validation is contaminated).")
        except Exception as e:
            logger.warning(f"[TrainCNN] Could not warm-start ({e}) — training from scratch.")
            have_prior = False

    lr = 0.0005 if have_prior else 0.001
    max_epochs = 8 if have_prior else 15
    patience = 3

    # The fee floor makes HOLD the majority class by design — weight the
    # loss so LONG/SHORT aren't optimized away into permanent HOLD.
    counts = np.bincount(y_train, minlength=3).astype(np.float64)
    class_weights = torch.tensor(len(y_train) / (3.0 * np.maximum(counts, 1.0)), dtype=torch.float32)
    logger.info(f"[TrainCNN] Class counts LONG/SHORT/HOLD: {counts.astype(int).tolist()}")

    loader = DataLoader(TensorDataset(X_train_t, y_train_t), batch_size=64, shuffle=True)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = optim.Adam(model.parameters(), lr=lr)

    logger.info(f"[TrainCNN] Training ({'fine-tune' if have_prior else 'from scratch'}) "
                f"on {len(X_train_t)} windows / {len(SYMBOLS)} symbols, tune={len(X_tune_t)}, lr={lr}, "
                f"max_epochs={max_epochs}")
    best_tune_f1, best_state, stale, epochs_run = -1.0, None, 0, 0
    for epoch in range(max_epochs):
        model.train()
        for xb, yb in loader:
            optimizer.zero_grad()
            loss = criterion(model(xb), yb)
            loss.backward()
            optimizer.step()
        epochs_run = epoch + 1
        tune_f1 = _macro_f1(y_tune, _predict(model, X_tune_t))
        if tune_f1 > best_tune_f1 + 1e-4:
            best_tune_f1, best_state, stale = tune_f1, {k: v.clone() for k, v in model.state_dict().items()}, 0
        else:
            stale += 1
            if stale >= patience:
                break
    if best_state is not None:
        model.load_state_dict(best_state)

    # The validation set is used exactly once, here.
    val_preds = _predict(model, X_val_t)
    report = classification_report(y_val, val_preds, labels=[0, 1, 2], output_dict=True, zero_division=0)
    new_f1 = float(report["macro avg"]["f1-score"])
    new_accuracy = float(report["accuracy"])
    majority_rate = float(np.bincount(y_val, minlength=3).max() / len(y_val))
    edge = promotion_gate.economic_edge(val_preds, r_val)
    logger.info(f"[TrainCNN] Validation macro F1: {new_f1:.4f}, accuracy: {new_accuracy:.4f} "
                f"(majority-class rate {majority_rate:.4f}); net edge per directional call "
                f"{edge['mean_net']} over {edge['n_calls']} calls, 95% CI [{edge['ci_lo']}, {edge['ci_hi']}]")

    prior_f1, prior_edge = (None, None)
    if same_input_version:
        prior_f1, prior_edge = _score_incumbent(X_val_raw, y_val, r_val)
        if prior_f1 is None:
            prior_f1 = state.get("last_promoted_f1") if CHECKPOINT_PATH.exists() else None
        else:
            logger.info(f"[TrainCNN] Incumbent macro F1 on the same validation set: {prior_f1:.4f}")

    promote, reason = promotion_gate.decide_promotion(new_f1, prior_f1, edge, floor_f1=MIN_PROMOTE_F1)

    if promote:
        if CHECKPOINT_PATH.exists():
            BACKUP_PATH.write_bytes(CHECKPOINT_PATH.read_bytes())
        if SCHEMA_PATH.exists():
            SCHEMA_BACKUP_PATH.write_bytes(SCHEMA_PATH.read_bytes())
        CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
        torch.save(model.state_dict(), CHECKPOINT_PATH)
        _write_schema(means, stds)
        state["last_promoted_f1"] = new_f1
        state["last_promoted_at"] = datetime.now(timezone.utc).isoformat()
        logger.info(f"[TrainCNN] Promoted new checkpoint (F1 {new_f1:.4f} vs prior {prior_f1}).")
    else:
        logger.warning(f"[TrainCNN] REFUSED promotion — {reason}. Live checkpoint left untouched.")

    # Explicit flag rather than comparing last_attempt_at/last_promoted_at
    # timestamps — those two are set via separate datetime.now() calls
    # microseconds apart even on a normal promotion.
    state["last_attempt_promoted"] = promote
    state["last_attempt_reason"] = reason
    state["last_attempt_at"] = datetime.now(timezone.utc).isoformat()
    state["last_attempt_f1"] = new_f1
    state["last_attempt_incumbent_f1"] = prior_f1
    state["last_attempt_accuracy"] = new_accuracy
    state["last_attempt_majority_rate"] = majority_rate
    state["last_attempt_edge"] = edge
    state["last_attempt_incumbent_edge"] = prior_edge
    state["rows_trained"] = int(len(X_train_t))
    state["rows_tuned"] = int(len(X_tune_t))
    state["rows_validated"] = int(len(X_val_t))
    state["epochs_run"] = epochs_run
    if promote:
        state["input_version"] = INPUT_VERSION
    _save_state(state)

    _update_training_report(report, {"epochs": epochs_run, "batch_size": 64, "seq_len": SEQ_LEN,
                                      "features": FEATURE_COLS, "warm_start": have_prior, "lr": lr,
                                      "input_version": INPUT_VERSION, "train_bars": TRAIN_BARS,
                                      "fee_floor": FEE_FLOOR, "tune_fraction": TUNE_FRACTION})

    return {"promoted": promote, "reason": reason, "f1": new_f1, "accuracy": new_accuracy,
            "edge": edge, "rows_trained": int(len(X_train_t)), "rows_validated": int(len(X_val_t))}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(train_cnn(), indent=2, default=str))
