"""
Background continuous-learning loop for the quant engine.

Runs train_cnn() and train_ppo() on a fixed interval in a worker thread
(torch training is synchronous/CPU-bound — running it directly on the
FastAPI event loop would freeze every inference request for the whole
training duration). After each cycle, hot-reloads whichever live
predictor singleton got a promoted checkpoint and refreshes the shared
model-validation-results snapshot main.py's /health/models reads from.

Controlled by three env vars, read at process start:
  AQEA_CONTINUOUS_LEARNING   "true" (default) / "false" — master on/off switch.
  AQEA_TRAIN_INTERVAL_SECONDS  default 21600 (6h) — time between cycles.
  AQEA_TRAIN_DEFER_SECONDS     default 600 (10m) — recheck cadence while deferred.
The very first cycle runs immediately on startup rather than waiting a
full interval, since right now there's no valid checkpoint on disk at all.

Before starting any cycle, polls the Node server's
GET /system/auto-trader-active — training is CPU-heavy enough (torch
capped to 2 threads, but a full cycle still pins several cores) that
running it while the live 24/7 auto-trader is actively ticking starves
that same process's own FastAPI inference handlers of CPU, which was
observed pushing real prediction calls past their 2500ms budget into
neutral fallback stubs, dragging ensemble confidence down and blocking
real order placement. If the auto-trader is active, the cycle is
deferred (rechecked every AQEA_TRAIN_DEFER_SECONDS) rather than run.
If the check itself fails (Node unreachable, REGISTRY_URL unset), this
fails OPEN — training proceeds rather than stalling forever on a signal
it can't get.
"""
import asyncio
import logging
import os
import time
from typing import Callable, Optional

import httpx

logger = logging.getLogger("TrainingScheduler")

ENABLED = os.getenv("AQEA_CONTINUOUS_LEARNING", "true").lower() not in ("false", "0", "no")
INTERVAL_SECONDS = int(os.getenv("AQEA_TRAIN_INTERVAL_SECONDS", str(6 * 3600)))
DEFER_SECONDS = int(os.getenv("AQEA_TRAIN_DEFER_SECONDS", str(10 * 60)))

_last_cycle_result = {"cnn": None, "ppo": None, "gbm": None, "started_at": None, "finished_at": None}


async def _is_auto_trader_active() -> bool:
    """Fails OPEN (returns False, i.e. "not active, go ahead and train")
    whenever the check itself can't be completed, so a missing/unreachable
    Node server can never permanently block continuous learning."""
    node_url = os.environ.get("REGISTRY_URL")
    if not node_url:
        return False
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{node_url}/system/auto-trader-active", timeout=3.0)
            if response.status_code == 200:
                return bool(response.json().get("active", False))
    except Exception as e:
        logger.warning(f"[TrainingScheduler] Could not reach auto-trader status check ({e}) — proceeding with training.")
    return False


def get_last_cycle_result() -> dict:
    return _last_cycle_result


def _run_training_cycle_blocking() -> dict:
    """Runs the cycle in a separate, lower-priority process (training_worker.py)
    so training can't starve live inference via the GIL, then hot-reloads any
    promoted checkpoint here. Always call via an executor."""
    import json as _json
    import subprocess
    import sys as _sys
    from pathlib import Path
    import validation_state
    from cnn_predictor import cnn_predictor
    from ppo_execution_agent import ppo_agent
    from gbm_predictor import gbm_predictor

    started = time.time()
    try:
        proc = subprocess.run(
            [_sys.executable, "training_worker.py"],
            cwd=str(Path(__file__).resolve().parent),
            stdout=subprocess.PIPE, stderr=None, text=True,
            timeout=3 * 3600,
        )
        line = next((l for l in reversed(proc.stdout.splitlines()) if l.startswith("TRAINING_RESULT ")), None)
        result = _json.loads(line[len("TRAINING_RESULT "):]) if line else {"error": f"worker exited {proc.returncode} without a result"}
    except Exception as e:
        logger.error(f"[TrainingScheduler] Training worker failed: {e}")
        result = {"error": str(e)}

    for name, reload in (("cnn", cnn_predictor.reload), ("ppo", ppo_agent.reload), ("gbm", gbm_predictor.reload)):
        if (result.get(name) or {}).get("promoted"):
            try:
                reload()
                logger.info(f"[TrainingScheduler] {name.upper()} checkpoint hot-reloaded into the live predictor.")
            except Exception as e:
                logger.error(f"[TrainingScheduler] {name.upper()} reload failed: {e}")

    try:
        validation_state.refresh()
    except Exception as e:
        logger.error(f"[TrainingScheduler] Failed to refresh validation state: {e}")

    result.setdefault("started_at", started)
    result["finished_at"] = time.time()
    return result


async def run_training_loop(on_cycle_complete: Optional[Callable[[], None]] = None):
    """`on_cycle_complete`, if given, is called (synchronously, no args)
    after every cycle. main.py uses this to retry quant-engine registration
    once a cycle promotes healthy CNN/PPO checkpoints — startup_event's own
    registration check runs before this loop's first cycle has had a
    chance to fix anything, so without this hook a fresh boot with empty
    checkpoints would train its way to HEALTHY but stay unregistered for
    the rest of the process's life."""
    if not ENABLED:
        logger.info("[TrainingScheduler] AQEA_CONTINUOUS_LEARNING=false — continuous learning disabled.")
        return

    logger.info(f"[TrainingScheduler] Starting continuous-learning loop, "
                f"interval={INTERVAL_SECONDS}s. First cycle runs immediately.")

    loop = asyncio.get_event_loop()
    global _last_cycle_result

    # Bound how long an always-active auto-trader can hold training off. On a
    # 24/7 platform /system/auto-trader-active is almost always true, so an
    # unbounded defer would starve training indefinitely — never letting a
    # fresh boot with no checkpoint on disk train even once. Defer at most
    # ~one full interval, then force a cycle.
    max_consecutive_defers = max(1, INTERVAL_SECONDS // DEFER_SECONDS)
    has_completed_cycle = False
    consecutive_defers = 0

    while True:
        # The very first cycle always runs: on a fresh boot there is no valid
        # checkpoint, so training must not be deferred behind live inference.
        if has_completed_cycle and await _is_auto_trader_active():
            if consecutive_defers < max_consecutive_defers:
                consecutive_defers += 1
                logger.info(
                    f"[TrainingScheduler] Auto-trader is active — deferring training cycle "
                    f"for {DEFER_SECONDS}s ({consecutive_defers}/{max_consecutive_defers})."
                )
                await asyncio.sleep(DEFER_SECONDS)
                continue
            logger.info(
                "[TrainingScheduler] Deferral cap reached — running a training cycle "
                "despite active auto-trader to avoid starving continuous learning."
            )
        consecutive_defers = 0

        try:
            logger.info("[TrainingScheduler] === Training cycle starting ===")
            _last_cycle_result = await loop.run_in_executor(None, _run_training_cycle_blocking)
            logger.info(f"[TrainingScheduler] === Training cycle complete: {_last_cycle_result} ===")
            has_completed_cycle = True
        except Exception as e:
            logger.error(f"[TrainingScheduler] Unhandled error in training cycle: {e}")

        if on_cycle_complete is not None:
            try:
                on_cycle_complete()
            except Exception as e:
                logger.error(f"[TrainingScheduler] on_cycle_complete callback failed: {e}")

        await asyncio.sleep(INTERVAL_SECONDS)
