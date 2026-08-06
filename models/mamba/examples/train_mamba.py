"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Mamba Model Training Example
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn.functional as F
from torch.optim import AdamW
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
from typing import Tuple
from pathlib import Path

from models.mamba.types import MambaConfig, DataBatch, ForecastingMode
from models.mamba.pure_mamba.model import FinancialMambaModel
from models.mamba.losses.trading_losses import CombinedTradingLoss


def generate_dummy_data(
    n_samples: int = 1000,
    seq_len: int = 240,
    n_features: int = 52,
    n_horizons: int = 6,
) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Generate dummy training data for demonstration.
    
    In production, this would be real market data from MongoDB.
    """
    print(f"Generating {n_samples} dummy samples...")
    
    # Input features
    X = torch.randn(n_samples, seq_len, n_features)
    
    # Target labels
    directions = torch.randint(0, 2, (n_samples, n_horizons))  # 0=LONG, 1=SHORT
    returns = torch.randn(n_samples, n_horizons) * 0.02  # [-2%, 2%]
    volatilities = torch.abs(torch.randn(n_samples, n_horizons)) * 0.01 + 0.005
    
    return X, directions, returns


def create_data_loaders(
    X: torch.Tensor,
    directions: torch.Tensor,
    returns: torch.Tensor,
    batch_size: int = 32,
    train_split: float = 0.8,
) -> Tuple[DataLoader, DataLoader]:
    """Create train and validation dataloaders."""
    
    n = len(X)
    train_size = int(n * train_split)
    
    indices = torch.randperm(n)
    train_idx = indices[:train_size]
    val_idx = indices[train_size:]
    
    train_dataset = TensorDataset(X[train_idx], directions[train_idx], returns[train_idx])
    val_dataset = TensorDataset(X[val_idx], directions[val_idx], returns[val_idx])
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    return train_loader, val_loader


def train_epoch(
    model: FinancialMambaModel,
    train_loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    loss_fn,
    device: str,
) -> float:
    """Train for one epoch."""
    
    model.train()
    total_loss = 0.0
    
    for batch_idx, (X, directions, returns) in enumerate(train_loader):
        X = X.to(device)
        directions = directions.to(device)
        returns = returns.to(device)
        
        # Create batch
        batch = DataBatch(prices=X)
        
        # Forward pass
        output = model(batch)
        
        # Compute loss
        loss = loss_fn(output, directions, returns)
        
        # Backward pass
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        
        total_loss += loss.item()
        
        if (batch_idx + 1) % 10 == 0:
            print(f"  Batch {batch_idx + 1}/{len(train_loader)}: loss={loss.item():.4f}")
    
    return total_loss / len(train_loader)


@torch.no_grad()
def validate(
    model: FinancialMambaModel,
    val_loader: DataLoader,
    loss_fn,
    device: str,
) -> float:
    """Validate model."""
    
    model.eval()
    total_loss = 0.0
    
    for X, directions, returns in val_loader:
        X = X.to(device)
        directions = directions.to(device)
        returns = returns.to(device)
        
        batch = DataBatch(prices=X)
        output = model(batch)
        loss = loss_fn(output, directions, returns)
        
        total_loss += loss.item()
    
    return total_loss / len(val_loader)


def main():
    """Main training script."""
    
    # Configuration
    config = MambaConfig(
        d_model=384,
        n_layers=8,
        d_state=16,
        seq_len=240,
        forecasting_mode=ForecastingMode.MULTI_TASK,
        use_amp=False,  # Set to True for faster training on supported hardware
        use_gradient_checkpoint=False,
    )
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    
    # Create model
    print(f"\nCreating model with config: {config}")
    model = FinancialMambaModel(config)
    model.to(device)
    
    print(f"Model parameters: {model.count_parameters():,}")
    print(f"Model memory: {model.get_memory_usage():.2f} MB")
    
    # Generate data
    X, directions, returns = generate_dummy_data(
        n_samples=100,  # Small for demo
        seq_len=config.seq_len,
        n_features=config.n_features,
        n_horizons=len(config.supported_horizons),
    )
    
    # Create dataloaders
    train_loader, val_loader = create_data_loaders(
        X, directions, returns,
        batch_size=8,
        train_split=0.8,
    )
    
    print(f"Train batches: {len(train_loader)}")
    print(f"Val batches: {len(val_loader)}")
    
    # Loss function
    loss_fn = CombinedTradingLoss()
    
    # Optimizer
    optimizer = AdamW(
        model.parameters(),
        lr=1e-3,
        weight_decay=1e-4,
        betas=(0.9, 0.999),
    )
    
    # Learning rate scheduler
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer,
        T_0=5,
        T_mult=2,
        eta_min=1e-5,
    )
    
    # Training loop
    num_epochs = 3  # Small for demo
    best_val_loss = float("inf")
    checkpoint_dir = Path("checkpoints/mamba")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n{'Epoch':<6} {'Train Loss':<12} {'Val Loss':<12} {'LR':<10}")
    print("=" * 50)
    
    for epoch in range(num_epochs):
        train_loss = train_epoch(model, train_loader, optimizer, loss_fn, device)
        val_loss = validate(model, val_loader, loss_fn, device)
        
        scheduler.step()
        
        print(
            f"{epoch+1:<6} {train_loss:<12.4f} {val_loss:<12.4f} "
            f"{optimizer.param_groups[0]['lr']:<10.2e}"
        )
        
        # Save best checkpoint
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            checkpoint_path = checkpoint_dir / "mamba_best.pt"
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "config": {
                    k: v for k, v in config.__dict__.items()
                    if k not in ["dtype", "device"]
                },
                "val_loss": val_loss,
            }, checkpoint_path)
            print(f"  ✓ Saved checkpoint: {checkpoint_path}")
    
    print("\n✓ Training complete!")
    print(f"  Best validation loss: {best_val_loss:.4f}")
    print(f"  Checkpoint saved to: {checkpoint_path}")
    
    # Load best model for inference
    print("\nLoading best model...")
    checkpoint = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to_inference_mode()
    
    # Test inference
    print("\nTesting inference...")
    with torch.no_grad():
        test_input = torch.randn(1, config.seq_len, config.n_features, device=device)
        batch = DataBatch(prices=test_input)
        output = model(batch)
        
        print(f"  Direction logits shape: {output.direction_logits.shape}")
        print(f"  Returns pred shape: {output.returns_pred.shape}")
        print(f"  Volatility pred shape: {output.volatility_pred.shape}")
        print(f"  Confidence shape: {output.confidence.shape}")
        
        # Show predictions for first horizon
        direction_probs = torch.softmax(output.direction_logits[0, 0, :], dim=0)
        print(f"\n  1-candle forecast:")
        print(f"    P(LONG): {direction_probs[0]:.2%}")
        print(f"    P(SHORT): {direction_probs[1]:.2%}")
        print(f"    Expected return: {output.returns_pred[0, 0, 0]:.4f}")
        print(f"    Volatility: {output.volatility_pred[0, 0, 0]:.4f}")
        print(f"    Confidence: {output.confidence[0, 0, 0]:.2%}")


if __name__ == "__main__":
    main()
