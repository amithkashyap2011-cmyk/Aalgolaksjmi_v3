import logging
import uvicorn
import sys
import os
from pathlib import Path

# Limit thread count to prevent 1000%+ CPU starvation on multi-core systems
os.environ["OMP_NUM_THREADS"] = "2"
os.environ["MKL_NUM_THREADS"] = "2"
os.environ["OPENBLAS_NUM_THREADS"] = "2"
os.environ["VECLIB_MAXIMUM_THREADS"] = "2"
os.environ["NUMEXPR_NUM_THREADS"] = "2"

try:
    import torch
    torch.set_num_threads(2)
    torch.set_num_interop_threads(2)
except Exception:
    pass

# Without a root-logger config, every INFO log from module loggers
# (TrainingScheduler, TrainCNN, TrainPPO, DataPipeline...) is silently
# dropped — the continuous-learning loop looked dead in PM2 logs even
# while it was training.
logging.basicConfig(level=logging.INFO,
                    format="%(levelname)s:%(name)s:%(message)s")

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT))

from runtime.port_manager import get_free_port, save_port

if __name__ == "__main__":
    port = get_free_port()
    save_port(port)
    os.environ["QUANT_PORT"] = str(port)
    print(f"Starting Quant Engine on dynamically allocated port: {port}")
    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="info")
