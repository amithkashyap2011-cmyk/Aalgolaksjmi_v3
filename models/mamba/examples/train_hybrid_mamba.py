"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Hybrid Mamba-Transformer Training Example
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
from models.mamba.hybrid_mamba.model import FinancialHybridMambaTransformer
from models.mamba.losses.trading_losses import CombinedTradingLoss
from models.mamba.training.trainer import (
    MambaTrainer,
    CosineAnnealingWarmupRestarts,
)


def generate_dummy_data(
    n_samples: int = 1000,
    seq_len: int = 240,
    n_features: int = 52,
    n_horizons: int = 6,
) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Generate dummy training data."""
    print(f"Generating {n_samples} dummy samples...")
    
    # Input features
    X = torch.randn(n_samples, seq_len, n_features)
    
    # Target labels
    directions = torch.randint(0, 2, (n_samples, n_horizons))  # LONG/SHORT
    returns = torch.randn(n_samples, n_horizons) * 0.02
    
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


def train_hybrid_model():
    """Train hybrid Mamba-Transformer model."""
    
    # Configuration
    config = MambaConfig(
        d_model=384,
        n_layers=12,  # Total: 6 Mamba + 2 sparse attention + 2 cross-time
        d_state=16,
        seq_len=240,
        forecasting_mode=ForecastingMode.MULTI_TASK,
        use_amp=False,
        use_gradient_checkpoint=False,
    )
    
    # Add n_heads for attention modules
    config.n_heads = 8
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n{'='*70}")
    print("HYBRID MAMBA-TRANSFORMER TRAINING")
    print(f"{'='*70}")
    print(f"Device: {device}")
    
    # Create model
    print(f"\nCreating hybrid model...")
    model = FinancialHybridMambaTransformer(config)
    model = model.to(device)
    
    print(f"  Parameters: {model.count_parameters():,}")
    print(f"  Memory (est): {model.get_memory_usage():.2f} MB")
    
    # Generate data
    X, directions, returns = generate_dummy_data(
        n_samples=100,
        seq_len=config.seq_len,
        n_features=52,
        n_horizons=6,
    )
    
    # Create dataloaders
    train_loader, val_loader = create_data_loaders(
        X, directions, returns,
        batch_size=8,
        train_split=0.8,
    )
    
    print(f"\nData loaders created:")
    print(f"  Train batches: {len(train_loader)}")
    print(f"  Val batches: {len(val_loader)}")
    
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
    scheduler = CosineAnnealingWarmupRestarts(
        optimizer,
        first_cycle_steps=10,
        cycle_mult=2.0,
        max_lr=1e-3,
        min_lr=1e-5,
        warmup_steps=2,
        gamma=0.95,
    )
    
    # Trainer
    trainer = MambaTrainer(
        model=model,
        device=device,
        use_amp=False,
        max_grad_norm=1.0,
    )
    
    checkpoint_dir = Path("checkpoints/hybrid_mamba")
    trainer.setup_callbacks(checkpoint_dir, early_stopping_patience=5)
    
    # Training loop
    num_epochs = 3
    best_val_loss = float("inf")
    
    print(f"\n{'Epoch':<6} {'Train Loss':<12} {'Val Loss':<12} {'LR':<10}")
    print("=" * 50)
    
    for epoch in range(num_epochs):
        model.train()
        train_loss = 0.0
        
        for batch_idx, (X_batch, directions_batch, returns_batch) in enumerate(train_loader):
            X_batch = X_batch.to(device)
            directions_batch = directions_batch.to(device)
            returns_batch = returns_batch.to(device)
            
            # Forward pass
            batch = DataBatch(prices=X_batch)
            output = model(batch)
            
            # Compute loss
            loss = loss_fn(output, directions_batch, returns_batch)
            
            # Backward pass
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            
            train_loss += loss.item()
        
        train_loss /= len(train_loader)
        
        # Validation
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for X_batch, directions_batch, returns_batch in val_loader:
                X_batch = X_batch.to(device)
                directions_batch = directions_batch.to(device)
                returns_batch = returns_batch.to(device)
                
                batch = DataBatch(prices=X_batch)
                output = model(batch)
                loss = loss_fn(output, directions_batch, returns_batch)
                val_loss += loss.item()
        
        val_loss /= len(val_loader)
        scheduler.step(val_loss)
        
        current_lr = optimizer.param_groups[0]['lr']
        print(
            f"{epoch+1:<6} {train_loss:<12.4f} {val_loss:<12.4f} "
            f"{current_lr:<10.2e}"
        )
        
        # Save best checkpoint
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            checkpoint_path = checkpoint_dir / "hybrid_mamba_best.pt"
            checkpoint_dir.mkdir(parents=True, exist_ok=True)
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "config": {k: v for k, v in config.__dict__.items()
                          if k not in ["dtype", "device"]},
                "val_loss": val_loss,
            }, checkpoint_path)
            print(f"  ✓ Checkpoint: {checkpoint_path.name}")
    
    print(f"\n{'='*70}")
    print("✓ Training complete!")
    print(f"  Best validation loss: {best_val_loss:.4f}")
    print(f"  Checkpoint: {checkpoint_path}")
    print(f"{'='*70}")
    
    # Test inference
    print("\nTesting inference...")
    model.to_inference_mode()
    
    with torch.no_grad():
        test_batch = DataBatch(prices=torch.randn(1, 240, 52, device=device))
        output = model(test_batch, return_attention_weights=True)
        
        direction_probs = torch.softmax(output.direction_logits[0, 0, :], dim=0)
        print(f"  1-candle forecast:")
        print(f"    P(LONG): {direction_probs[0]:.2%}")
        print(f"    P(SHORT): {direction_probs[1]:.2%}")
        print(f"    Expected return: {output.returns_pred[0, 0, 0]:.4f}")
        print(f"    Confidence: {output.confidence[0, 0, 0]:.2%}")
        
        if output.attention_weights is not None:
            print(f"    Attention weights shape: {output.attention_weights.shape}")
    
    return model, checkpoint_path


if __name__ == "__main__":
    model, checkpoint_path = train_hybrid_model()
