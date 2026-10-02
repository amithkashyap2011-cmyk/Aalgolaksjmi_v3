"""
Shared checkpoint-promotion gate for the CNN / GBM / LSTM trainers.

Why this exists (2026-09-30 audit of live graded predictions): the trainers
promoted on 3-class macro-F1 alone. That metric mostly rewards forecasting
*how much* the price will move (the HOLD class), not *which way*, and none of
the models had a positive net return per call after fees. Promotions were also
decided on differences far inside the noise (a CNN replaced its incumbent for
+0.00015 F1).

A candidate is now promoted only if it
  1. clears the trainer's own floor (beats random / not collapsed),
  2. beats the incumbent by a real margin on the SAME held-out set, and
  3. shows a positive NET edge: mean return of its LONG/SHORT calls minus the
     round-trip fee, with a block-bootstrap confidence interval whose lower
     bound is above zero (set AQEA_PROMOTE_REQUIRE_ECON_EDGE=0 to only report it).

The edge is always computed and stored in the train state even when it is not
enforced, so progress toward a real edge is visible cycle to cycle.
"""
import os
from typing import Optional, Tuple

import numpy as np

LONG, SHORT, HOLD = 0, 1, 2  # class ids used by every trainer

# Round-trip cost of a directional call: futures taker 2 x 0.04%.
FEE_ROUND_TRIP = float(os.getenv("AQEA_PROMOTE_FEE", "0.0008"))
# Minimum F1 improvement over the incumbent (same validation set).
MIN_F1_MARGIN = float(os.getenv("AQEA_PROMOTE_MIN_F1_MARGIN", "0.01"))
REQUIRE_EDGE = os.getenv("AQEA_PROMOTE_REQUIRE_ECON_EDGE", "1") != "0"
# Too few calls => the interval is meaningless; treat the edge as unproven.
MIN_EDGE_CALLS = int(os.getenv("AQEA_PROMOTE_MIN_EDGE_CALLS", "200"))
BOOT_BLOCK = 50
BOOT_SAMPLES = 500


def atomic_save(path, writer) -> None:
    """Write a checkpoint via `writer(tmp_path)` then os.replace() it into place,
    so a crash mid-save can never leave a torn file that a hot-reload or a
    restart would load (a bare torch.save/joblib.dump truncates in place)."""
    path = os.fspath(path)
    tmp = f"{path}.tmp"
    try:
        writer(tmp)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def directional_returns(pred, future_ret) -> Tuple[np.ndarray, np.ndarray]:
    """Gross per-call return of the LONG/SHORT predictions (LONG earns the
    forward return, SHORT its negative). HOLD calls and undefined returns are
    dropped. Order is preserved so block bootstrapping keeps autocorrelation."""
    pred = np.asarray(pred)
    ret = np.asarray(future_ret, dtype=np.float64)
    keep = ((pred == LONG) | (pred == SHORT)) & np.isfinite(ret)
    sign = np.where(pred == LONG, 1.0, -1.0)
    return (sign * ret)[keep], keep


def block_bootstrap_ci(x, block: int = BOOT_BLOCK, n_boot: int = BOOT_SAMPLES,
                       alpha: float = 0.05, seed: int = 0) -> Tuple[float, float, float]:
    """Mean and (1-alpha) CI by resampling contiguous blocks — predictions on
    overlapping 25-minute windows are strongly autocorrelated, so an i.i.d.
    interval would be far too narrow."""
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    if n == 0:
        return float("nan"), float("-inf"), float("inf")
    block = max(1, min(block, n))
    starts = np.arange(0, n - block + 1)
    n_blocks = int(np.ceil(n / block))
    rng = np.random.default_rng(seed)
    means = np.empty(n_boot)
    for b in range(n_boot):
        picks = starts[rng.integers(0, len(starts), size=n_blocks)]
        sample = np.concatenate([x[s:s + block] for s in picks])[:n]
        means[b] = sample.mean()
    lo, hi = np.quantile(means, [alpha / 2, 1 - alpha / 2])
    return float(x.mean()), float(lo), float(hi)


def economic_edge(pred, future_ret, fee: Optional[float] = None) -> dict:
    """Net-of-fee edge of the directional calls on a held-out set."""
    fee = FEE_ROUND_TRIP if fee is None else fee
    gross, _ = directional_returns(pred, future_ret)
    n = int(len(gross))
    if n == 0:
        return {"n_calls": 0, "mean_gross": None, "mean_net": None, "ci_lo": None, "ci_hi": None,
                "hit_rate": None, "fee": fee, "sufficient": False}
    net = gross - fee
    mean_net, lo, hi = block_bootstrap_ci(net)
    return {
        "n_calls": n,
        "mean_gross": float(gross.mean()),
        "mean_net": float(mean_net),
        "ci_lo": float(lo),
        "ci_hi": float(hi),
        "hit_rate": float((gross > 0).mean()),
        "fee": float(fee),
        "sufficient": bool(n >= MIN_EDGE_CALLS),
    }


def decide_promotion(cand_f1: float, incumbent_f1: Optional[float], edge: dict, *,
                     floor_f1: float, extra_ok: bool = True, extra_reason: str = "",
                     require_edge: Optional[bool] = None) -> Tuple[bool, str]:
    """Returns (promote, reason). `extra_ok`/`extra_reason` carry a trainer's
    own extra checks (e.g. LSTM collapse detection, GBM walk-forward)."""
    require_edge = REQUIRE_EDGE if require_edge is None else require_edge
    if not extra_ok:
        return False, extra_reason or "trainer-specific check failed"
    if cand_f1 < floor_f1:
        return False, f"macro F1 {cand_f1:.4f} is below the floor {floor_f1}"
    if incumbent_f1 is not None and cand_f1 < incumbent_f1 + MIN_F1_MARGIN:
        return False, (f"macro F1 {cand_f1:.4f} does not beat incumbent {incumbent_f1:.4f} "
                       f"by the required margin {MIN_F1_MARGIN} on the same held-out set")
    if require_edge:
        if not edge.get("sufficient"):
            return False, f"too few directional calls ({edge.get('n_calls', 0)} < {MIN_EDGE_CALLS}) to prove a net edge"
        if not (edge["ci_lo"] is not None and edge["ci_lo"] > 0):
            return False, (f"no proven net edge after fees: mean {edge['mean_net']:+.4%} per call, "
                           f"95% CI [{edge['ci_lo']:+.4%}, {edge['ci_hi']:+.4%}]")
    return True, "ok"
