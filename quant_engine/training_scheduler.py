"""
Background continuous-learning loop for the quant engine.

Runs train_cnn() and train_ppo() on a fixed interval in a worker thread
(torch training is synchronous/CPU-bound — running it directly on the
FastAPI event loop would freeze every inference request for the whole
training duration). After each cycle, hot-reloads whichever live
predictor singleton got a promoted checkpoint and refreshes the shared
model-validation-results snapshot main.py's /health/models reads from.

Controlled by two env vars, read at process start:
  AQEA_CONTINUOUS_LEARNING   "true" (default) / "false" — master on/off switch.
  AQEA_TRAIN_INTERVAL_SECONDS  default 21600 (6h) — time between cycles.
The very first cycle runs immediately on startup rather than waiting a
full interval, since right now there's no valid checkpoint on disk at all.
"""
import asyncio
import logging
import os
import time
from typing import Callable, Optional

logger = logging.getLogger("TrainingScheduler")

ENABLED = os.getenv("AQEA_CONTINUOUS_LEARNING", "true").lower() not in ("false", "0", "no")
INTERVAL_SECONDS = int(os.getenv("AQEA_TRAIN_INTERVAL_SECONDS", str(6 * 3600)))

_last_cycle_result = {"cnn": None, "ppo": None, "started_at": None, "finished_at": None}


def get_last_cycle_result() -> dict:
    return _last_cycle_result


def _run_training_cycle_blocking() -> dict:
    """Runs synchronously — always call via an executor, never directly
    on the event loop."""
    import validation_state
    from cnn_predictor import cnn_predictor
    from ppo_execution_agent import ppo_agent
    from train_cnn import train_cnn
    from train_ppo import train_ppo

    result = {"cnn": None, "ppo": None, "started_at": time.time()}

    try:
        cnn_result = train_cnn(warm_start=True)
        result["cnn"] = cnn_result
        if cnn_result.get("promoted"):
            cnn_predictor.reload()
            logger.info("[TrainingScheduler] CNN checkpoint hot-reloaded into the live predictor.")
    except Exception as e:
        logger.error(f"[TrainingScheduler] CNN training cycle failed: {e}")
        result["cnn"] = {"promoted": False, "error": str(e)}

    try:
        ppo_result = train_ppo(warm_start=True)
        result["ppo"] = ppo_result
        if ppo_result.get("promoted"):
            ppo_agent.reload()
            logger.info("[TrainingScheduler] PPO checkpoint hot-reloaded into the live agent.")
    except Exception as e:
        logger.error(f"[TrainingScheduler] PPO training cycle failed: {e}")
        result["ppo"] = {"promoted": False, "error": str(e)}

    try:
        validation_state.refresh()
    except Exception as e:
        logger.error(f"[TrainingScheduler] Failed to refresh validation state: {e}")

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

    while True:
        try:
            logger.info("[TrainingScheduler] === Training cycle starting ===")
            _last_cycle_result = await loop.run_in_executor(None, _run_training_cycle_blocking)
            logger.info(f"[TrainingScheduler] === Training cycle complete: {_last_cycle_result} ===")
        except Exception as e:
            logger.error(f"[TrainingScheduler] Unhandled error in training cycle: {e}")

        if on_cycle_complete is not None:
            try:
                on_cycle_complete()
            except Exception as e:
                logger.error(f"[TrainingScheduler] on_cycle_complete callback failed: {e}")

        await asyncio.sleep(INTERVAL_SECONDS)
