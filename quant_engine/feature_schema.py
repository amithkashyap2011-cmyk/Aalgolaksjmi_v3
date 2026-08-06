import json
import os
import numpy as np

SCHEMA_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../shared/schemas/feature_schema.json"))


def _read_schema():
    with open(SCHEMA_PATH, "r") as f:
        return json.load(f)


class FeatureSchemaV8:
    """MEANS/STDS are class attributes read once at import — but train_cnn.py
    rewrites feature_schema.json with fresh stats every training cycle,
    so `reload()` must be called (CNNPredictor.reload() does this) after a
    checkpoint hot-reload, or normalization would silently keep using
    stale statistics from whenever this process booted."""
    _schema_data = _read_schema()
    FEATURE_NAMES = _schema_data["FEATURE_NAMES"]
    MEANS = np.array(_schema_data["MEANS"], dtype=np.float32)
    STDS = np.array(_schema_data["STDS"], dtype=np.float32)
    DIMENSION = _schema_data["DIMENSION"]

    @classmethod
    def reload(cls):
        data = _read_schema()
        cls.FEATURE_NAMES = data["FEATURE_NAMES"]
        cls.MEANS = np.array(data["MEANS"], dtype=np.float32)
        cls.STDS = np.array(data["STDS"], dtype=np.float32)
        cls.DIMENSION = data["DIMENSION"]

    @classmethod
    def normalize(cls, vector: np.ndarray) -> np.ndarray:
        vector = np.nan_to_num(vector, nan=0.0, posinf=0.0, neginf=0.0)
        return (vector - cls.MEANS) / (cls.STDS + 1e-8)
