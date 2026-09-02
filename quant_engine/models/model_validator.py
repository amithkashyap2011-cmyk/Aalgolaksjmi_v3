import json
import logging
from pathlib import Path
from typing import Iterable

logger = logging.getLogger("ModelValidator")

class ModelValidator:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.manifest_path = project_root / "quant_engine" / "models" / "MODEL_MANIFEST.json"

    def validate_all(self) -> dict:
        if not self.manifest_path.exists():
            logger.error(f"Manifest not found: {self.manifest_path}")
            return {"status": "ERROR", "message": "Manifest missing"}

        with open(self.manifest_path, "r") as f:
            manifest = json.load(f)

        results = {}
        for model in manifest.get("models", []):
            results[model["name"]] = self.validate_model(model)

        return results

    def validate_model(self, model_config: dict) -> dict:
        checkpoint_rel_path = model_config["checkpoint"]
        checkpoint_path = self._resolve_checkpoint_path(checkpoint_rel_path)
        if checkpoint_path is None:
            return {"status": "DEGRADED", "reason": f"Checkpoint missing: {checkpoint_rel_path}"}

        size = checkpoint_path.stat().st_size
        if size < model_config.get("min_size", 0):
            return {"status": "DEGRADED", "reason": f"Checkpoint too small: {size} bytes"}

        if checkpoint_path.suffix in {".pt", ".pth", ".zip"}:
            try:
                import torch
                try:
                    torch.load(checkpoint_path, map_location="cpu", weights_only=False)
                except TypeError:
                    torch.load(checkpoint_path, map_location="cpu")
            except Exception as e:
                return {"status": "DEGRADED", "reason": f"Torch load failed: {str(e)}"}

        return {"status": "HEALTHY", "size": size, "checkpoint": str(checkpoint_path)}

    def _resolve_checkpoint_path(self, rel_path: str) -> Path | None:
        for candidate in self._candidate_paths(rel_path):
            if candidate.exists():
                return candidate
        return None

    def _candidate_paths(self, rel_path: str) -> Iterable[Path]:
        raw = Path(rel_path)
        if raw.is_absolute():
            yield raw
        else:
            yield self.project_root / rel_path
            if rel_path.startswith("quant_engine/"):
                yield self.project_root / rel_path.removeprefix("quant_engine/")

        aliases = {
            "quant_engine/models/cnn/best_model.pth": [
                "quant_engine/models/cnn/checkpoints/cnn_1d_v1.pt",
                "quant_engine/models/cnn/checkpoints/cnn_1d_v9.pt",
            ],
            "quant_engine/models/ppo/ppo_agent.zip": [
                "quant_engine/models/ppo/checkpoints/ppo_execution_v1.pt",
            ],
            "quant_engine/models/mamba/mamba_v1.pt": [
                "quant_engine/models/mamba/checkpoints/mamba-research-v1.pt",
            ],
            "quant_engine/models/transformer/transformer_v2.pt": [
                "quant_engine/models/transformer/checkpoints/transformer_micro_v1.pt",
            ],
        }

        for alias in aliases.get(rel_path, []):
            yield self.project_root / alias

if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent.parent
    validator = ModelValidator(root)
    print(json.dumps(validator.validate_all(), indent=2))
