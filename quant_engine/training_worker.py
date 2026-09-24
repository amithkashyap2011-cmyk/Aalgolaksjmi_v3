"""
Runs one training cycle (CNN, PPO, shadow GBM) in its OWN process.

Training used to run in a thread inside the serving process. Python's GIL
let it starve the /predict endpoints, so live decisions hit the server's 35s
per-symbol timeout and whole scheduler ticks were skipped
(CONCURRENCY_LOCK_ACTIVE) for the ~50 minutes each cycle took. As a separate,
lower-priority process with capped math threads, inference keeps its CPU.

Prints one line "TRAINING_RESULT <json>" on stdout; the scheduler reloads the
promoted checkpoints into the serving process.
"""
import json
import logging
import os
import sys
import time

# Cap BLAS/OpenMP threads before numpy/sklearn/torch load (HistGradientBoosting
# otherwise uses every core).
for var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(var, "2")

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("TrainingWorker")


def run_cycle() -> dict:
    result = {"cnn": None, "ppo": None, "gbm": None, "started_at": time.time()}
    for name, fn in (("cnn", "train_cnn:train_cnn"), ("ppo", "train_ppo:train_ppo"), ("gbm", "train_gbm:train_gbm")):
        mod, func = fn.split(":")
        try:
            f = getattr(__import__(mod), func)
            result[name] = f(warm_start=True) if name != "gbm" else f()
        except Exception as e:  # one model failing never blocks the others
            logger.error(f"[TrainingWorker] {name} training failed: {e}")
            result[name] = {"promoted": False, "error": str(e)}
    result["finished_at"] = time.time()
    return result


if __name__ == "__main__":
    try:
        os.nice(10)  # below the serving process
    except Exception:
        pass
    print("TRAINING_RESULT " + json.dumps(run_cycle(), default=str), flush=True)
