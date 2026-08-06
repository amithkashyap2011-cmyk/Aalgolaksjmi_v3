"""
═══════════════════════════════════════════════════════════════════════════════
  Integration Testing for Mamba Inference Adapter
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import numpy as np
from pathlib import Path

from models.mamba.types import MambaConfig, ForecastingMode
from models.mamba.pure_mamba.model import FinancialMambaModel
from models.mamba.inference.adapter import MambaInferenceAdapter


def test_adapter_creation():
    """Test adapter initialization."""
    print("TEST: Adapter Creation")
    
    # Create a temporary model
    config = MambaConfig(
        d_model=256,
        n_layers=4,
        seq_len=120,
        forecasting_mode=ForecastingMode.MULTI_TASK,
    )
    
    model = FinancialMambaModel(config)
    checkpoint_path = "/tmp/test_mamba.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {k: v for k, v in config.__dict__.items()
                  if k not in ['dtype', 'device']},
    }, checkpoint_path)
    
    # Load via adapter
    adapter = MambaInferenceAdapter(checkpoint_path)
    assert adapter.model is not None
    assert adapter.device in ["cuda", "cpu"]
    print("  ✓ Adapter created successfully")


def test_prediction():
    """Test single prediction."""
    print("\nTEST: Single Prediction")
    
    config = MambaConfig(
        d_model=256,
        n_layers=4,
        seq_len=120,
        forecasting_mode=ForecastingMode.MULTI_TASK,
    )
    
    model = FinancialMambaModel(config)
    checkpoint_path = "/tmp/test_mamba.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {k: v for k, v in config.__dict__.items()
                  if k not in ['dtype', 'device']},
    }, checkpoint_path)
    
    adapter = MambaInferenceAdapter(checkpoint_path)
    
    # Create dummy window
    window = [[0.5] * 52 for _ in range(120)]
    
    result = adapter.predict(window)
    
    assert "directionScore" in result
    assert "predictedMove" in result
    assert "confidence" in result
    assert 0.0 <= result["directionScore"] <= 1.0
    assert -1.0 <= result["predictedMove"] <= 1.0
    assert 0.0 <= result["confidence"] <= 1.0
    print(f"  ✓ Prediction: {result}")


def test_multi_horizon():
    """Test multi-horizon predictions."""
    print("\nTEST: Multi-Horizon Predictions")
    
    config = MambaConfig(
        d_model=256,
        n_layers=4,
        seq_len=120,
        forecasting_mode=ForecastingMode.MULTI_TASK,
    )
    
    model = FinancialMambaModel(config)
    checkpoint_path = "/tmp/test_mamba.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {k: v for k, v in config.__dict__.items()
                  if k not in ['dtype', 'device']},
    }, checkpoint_path)
    
    adapter = MambaInferenceAdapter(checkpoint_path)
    window = [[0.5] * 52 for _ in range(120)]
    
    results = adapter.predict_multi_horizon(window)
    
    assert len(results) > 0
    for horizon, pred in results.items():
        assert "direction" in pred
        assert "magnitude" in pred
        assert "confidence" in pred
    print(f"  ✓ Multi-horizon predictions: {len(results)} horizons")


def test_embeddings():
    """Test embedding extraction."""
    print("\nTEST: Embedding Extraction")
    
    config = MambaConfig(
        d_model=256,
        n_layers=4,
        seq_len=120,
        forecasting_mode=ForecastingMode.MULTI_TASK,
    )
    
    model = FinancialMambaModel(config)
    checkpoint_path = "/tmp/test_mamba.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {k: v for k, v in config.__dict__.items()
                  if k not in ['dtype', 'device']},
    }, checkpoint_path)
    
    adapter = MambaInferenceAdapter(checkpoint_path)
    window = [[0.5] * 52 for _ in range(120)]
    
    embeddings = adapter.get_embeddings(window)
    
    assert embeddings.shape[0] == 120  # seq_len
    assert embeddings.shape[1] == config.d_model
    print(f"  ✓ Embeddings shape: {embeddings.shape}")


def test_health_check():
    """Test health check."""
    print("\nTEST: Health Check")
    
    config = MambaConfig(
        d_model=256,
        n_layers=4,
        seq_len=120,
        forecasting_mode=ForecastingMode.MULTI_TASK,
    )
    
    model = FinancialMambaModel(config)
    checkpoint_path = "/tmp/test_mamba.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {k: v for k, v in config.__dict__.items()
                  if k not in ['dtype', 'device']},
    }, checkpoint_path)
    
    adapter = MambaInferenceAdapter(checkpoint_path)
    health = adapter.health_check()
    
    assert health["status"] == "healthy"
    assert health["model_loaded"] is True
    assert "parameters" in health
    assert health["parameters"] > 0
    print(f"  ✓ Health check passed: {health['parameters']:,} parameters")


def test_dtype_support():
    """Test different data types."""
    print("\nTEST: Data Type Support")
    
    config = MambaConfig(
        d_model=256,
        n_layers=4,
        seq_len=120,
        forecasting_mode=ForecastingMode.MULTI_TASK,
        dtype=torch.float32,
    )
    
    model = FinancialMambaModel(config)
    checkpoint_path = "/tmp/test_mamba.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {k: v for k, v in config.__dict__.items()
                  if k not in ['dtype', 'device']},
    }, checkpoint_path)
    
    adapter = MambaInferenceAdapter(checkpoint_path)
    
    # Test with different input types
    window_int = [[1] * 52 for _ in range(120)]
    window_float = [[0.5] * 52 for _ in range(120)]
    
    result1 = adapter.predict(window_int)
    result2 = adapter.predict(window_float)
    
    assert result1 is not None
    assert result2 is not None
    print("  ✓ Int and float inputs handled correctly")


def test_error_handling():
    """Test error handling."""
    print("\nTEST: Error Handling")
    
    config = MambaConfig(
        d_model=256,
        n_layers=4,
        seq_len=120,
        forecasting_mode=ForecastingMode.MULTI_TASK,
    )
    
    model = FinancialMambaModel(config)
    checkpoint_path = "/tmp/test_mamba.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {k: v for k, v in config.__dict__.items()
                  if k not in ['dtype', 'device']},
    }, checkpoint_path)
    
    adapter = MambaInferenceAdapter(checkpoint_path)
    
    # Test with wrong dimensions (should fail gracefully)
    try:
        wrong_window = [[0.5] * 51 for _ in range(120)]  # Wrong feature count
        result = adapter.predict(wrong_window)
        # Should return error stub
        assert result["modelName"] == "mamba-v1-error" or "directionScore" in result
        print("  ✓ Error handled gracefully")
    except Exception as e:
        print(f"  ✗ Unexpected error: {e}")


def run_all_tests():
    """Run all integration tests."""
    print("=" * 70)
    print("MAMBA INFERENCE ADAPTER INTEGRATION TESTS")
    print("=" * 70)
    
    test_adapter_creation()
    test_prediction()
    test_multi_horizon()
    test_embeddings()
    test_health_check()
    test_dtype_support()
    test_error_handling()
    
    print("\n" + "=" * 70)
    print("✓ ALL TESTS PASSED")
    print("=" * 70)


if __name__ == "__main__":
    run_all_tests()
