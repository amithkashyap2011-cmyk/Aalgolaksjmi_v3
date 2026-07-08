"""
Records the REAL 32-dim state vectors the TS server sends to
/predict/ppo-execution, so PPO can train on the exact input distribution it
serves — instead of MarketReplayEnv's synthetic states, which zero-fill 26
of the 32 slots (regime / order-flow / smart-money / CNN-signal / risk) that
production populates.

Storage is an append-only JSONL file next to the PPO checkpoints:
one {"ts": epoch_ms, "symbol": ..., "state": [32 floats]} per line.
Appends are lock-guarded (FastAPI sync endpoints run in a threadpool) and
must never fail a live inference request — record() swallows its own errors.

train_ppo.py joins each record's timestamp with real candles to compute the
realized next-bar return, which is what the reward function needs.
"""
import json
import logging
import threading
import time
from pathlib import Path

logger = logging.getLogger("PPOReplayBuffer")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BUFFER_PATH = PROJECT_ROOT / "models" / "ppo" / "replay_buffer.jsonl"

# Compaction keeps the newest records; at ~20 requests/min this is roughly
# a week of live states.
MAX_RECORDS = 200_000

_write_lock = threading.Lock()


def record(state_vector, symbol=None) -> None:
    """Append one live state observation. Never raises — recording is a
    side effect of inference and must not break it."""
    try:
        line = json.dumps({
            "ts": int(time.time() * 1000),
            "symbol": symbol,
            "state": [float(x) for x in state_vector],
        })
        with _write_lock:
            BUFFER_PATH.parent.mkdir(parents=True, exist_ok=True)
            with BUFFER_PATH.open("a") as f:
                f.write(line + "\n")
    except Exception as e:
        logger.warning(f"[PPOReplayBuffer] Failed to record state: {e}")


def load_records() -> list:
    """Returns all parseable records, oldest first. Corrupt lines (e.g. a
    torn write from a crash) are skipped, not fatal."""
    if not BUFFER_PATH.exists():
        return []
    records = []
    with BUFFER_PATH.open() as f:
        for line in f:
            try:
                r = json.loads(line)
                if isinstance(r.get("state"), list) and r.get("ts"):
                    records.append(r)
            except (json.JSONDecodeError, TypeError):
                continue
    records.sort(key=lambda r: r["ts"])
    return records


def compact(max_records: int = MAX_RECORDS) -> None:
    """Rewrite the buffer keeping only the newest max_records entries.
    Atomic replace so a concurrent record() append can at worst lose the
    single line written between load and replace."""
    try:
        records = load_records()
        if len(records) <= max_records:
            return
        keep = records[-max_records:]
        tmp = BUFFER_PATH.with_suffix(".jsonl.tmp")
        with tmp.open("w") as f:
            for r in keep:
                f.write(json.dumps(r) + "\n")
        with _write_lock:
            tmp.replace(BUFFER_PATH)
        logger.info(f"[PPOReplayBuffer] Compacted buffer to {len(keep)} records.")
    except Exception as e:
        logger.warning(f"[PPOReplayBuffer] Compaction failed: {e}")
