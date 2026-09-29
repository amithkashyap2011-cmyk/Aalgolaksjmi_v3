import torch
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from models.mamba.types import MambaConfig
from models.mamba.pure_mamba.model import FinancialMambaModel

SAVE_PATH = PROJECT_ROOT / "models" / "mamba" / "checkpoints" / "mamba-research-v1.pt"

def generate():
    SAVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    config = MambaConfig(d_model=256, n_layers=6, d_state=32, n_features=12)
    model = FinancialMambaModel(config)
    # This script only INSTANTIATES the architecture: the weights are random.
    # It must never be presented as a trained model — `trained: False` makes
    # MambaPredictor refuse to serve it. A real training run sets `trained: True`.
    torch.save({
        'config': config.__dict__,
        'model_state_dict': model.state_dict(),
        'trained': False,
        'provenance': 'RANDOM_INIT_NO_TRAINING',
    }, SAVE_PATH)
    print(f"Generated UNTRAINED (random-initialised) FinancialMambaModel: {SAVE_PATH}")
    print(f"Size: {os.path.getsize(SAVE_PATH) / (1024*1024):.2f} MB")

if __name__ == "__main__":
    generate()
