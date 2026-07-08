"""
Shared, mutable model-validation-results state.

Pulled out of main.py so the training scheduler can refresh it after a
checkpoint is hot-reloaded, without main.py <-> training_scheduler forming
a circular import.
"""
from pathlib import Path
from typing import Any, Dict

from models.model_validator import ModelValidator

PROJECT_ROOT = Path(__file__).resolve().parent.parent
_validator = ModelValidator(PROJECT_ROOT)

_results: Dict[str, Any] = {}


def refresh() -> Dict[str, Any]:
    global _results
    _results = _validator.validate_all()
    return _results


def get() -> Dict[str, Any]:
    return _results
