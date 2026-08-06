"""
═══════════════════════════════════════════════════════════════════════════════
  Project LAKSHMI — Training Pipeline for Mamba Models
  PyTorch Lightning integration with custom callbacks
═══════════════════════════════════════════════════════════════════════════════
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
import numpy as np
from typing import Optional, Dict, List, Tuple
from pathlib import Path
import json
from datetime import datetime


class EarlyStoppingCallback:
    """
    Early stopping with patience and metric tracking.
    """
    
    def __init__(
        self,
        patience: int = 10,
        min_delta: float = 1e-4,
        restore_best_weights: bool = True,
    ):
        self.patience = patience
        self.min_delta = min_delta
        self.restore_best_weights = restore_best_weights
        
        self.counter = 0
        self.best_val_loss = float("inf")
        self.best_weights = None
        self.should_stop = False
    
    def on_validation_end(self, val_loss: float, model: nn.Module):
        """Check if training should stop."""
        if val_loss < (self.best_val_loss - self.min_delta):
            self.best_val_loss = val_loss
            self.counter = 0
            
            # Save best weights
            if self.restore_best_weights:
                self.best_weights = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            self.counter += 1
            
            if self.counter >= self.patience:
                self.should_stop = True
                print(f"⚠ Early stopping: no improvement for {self.patience} epochs")
    
    def restore_best_model(self, model: nn.Module):
        """Restore best model weights."""
        if self.best_weights is not None:
            model.load_state_dict(self.best_weights)


class ModelCheckpointCallback:
    """
    Save best model checkpoint during training.
    """
    
    def __init__(
        self,
        checkpoint_dir: Path,
        monitor_metric: str = "val_loss",
        save_best_only: bool = True,
        save_frequency: int = 1,  # Save every N epochs
    ):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        
        self.monitor_metric = monitor_metric
        self.save_best_only = save_best_only
        self.save_frequency = save_frequency
        
        self.best_metric = float("inf")
        self.last_saved_epoch = -1
    
    def on_validation_end(
        self,
        epoch: int,
        metrics: Dict[str, float],
        model: nn.Module,
        optimizer: torch.optim.Optimizer,
    ):
        """Save checkpoint if metric improved."""
        metric_value = metrics.get(self.monitor_metric, float("inf"))
        should_save = False
        
        if self.save_best_only:
            if metric_value < self.best_metric:
                self.best_metric = metric_value
                should_save = True
        else:
            if (epoch - self.last_saved_epoch) >= self.save_frequency:
                should_save = True
        
        if should_save:
            checkpoint_path = self.checkpoint_dir / f"checkpoint_epoch_{epoch:03d}.pt"
            
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "metrics": metrics,
            }, checkpoint_path)
            
            self.last_saved_epoch = epoch
            print(f"  ✓ Checkpoint saved: {checkpoint_path.name}")


class MetricsCallback:
    """
    Track and log training metrics.
    """
    
    def __init__(self):
        self.metrics_history = {
            "train_loss": [],
            "train_acc": [],
            "val_loss": [],
            "val_acc": [],
            "learning_rate": [],
        }
    
    def on_train_batch_end(
        self,
        loss: float,
        acc: float,
        learning_rate: float,
    ):
        self.metrics_history["train_loss"].append(loss)
        self.metrics_history["train_acc"].append(acc)
        self.metrics_history["learning_rate"].append(learning_rate)
    
    def on_validation_end(self, val_loss: float, val_acc: float):
        self.metrics_history["val_loss"].append(val_loss)
        self.metrics_history["val_acc"].append(val_acc)
    
    def save_history(self, filepath: Path):
        """Save metrics to file."""
        with open(filepath, "w") as f:
            json.dump(self.metrics_history, f, indent=2)


class MambaTrainer:
    """
    Training loop for Mamba models with advanced features.
    
    Features:
    - Mixed precision training (AMP)
    - Gradient accumulation
    - Learning rate scheduling
    - Early stopping
    - Model checkpointing
    - Metrics tracking
    """
    
    def __init__(
        self,
        model: nn.Module,
        device: str = "cuda" if torch.cuda.is_available() else "cpu",
        use_amp: bool = True,
        accumulation_steps: int = 1,
        max_grad_norm: float = 1.0,
    ):
        self.model = model.to(device)
        self.device = device
        self.use_amp = use_amp and (device == "cuda")
        self.accumulation_steps = accumulation_steps
        self.max_grad_norm = max_grad_norm
        
        if self.use_amp:
            self.scaler = torch.cuda.amp.GradScaler()
        else:
            self.scaler = None
        
        # Callbacks
        self.early_stopping = None
        self.checkpointer = None
        self.metrics_tracker = MetricsCallback()
    
    def setup_callbacks(
        self,
        checkpoint_dir: Optional[Path] = None,
        early_stopping_patience: int = 10,
    ):
        """Setup training callbacks."""
        self.early_stopping = EarlyStoppingCallback(patience=early_stopping_patience)
        
        if checkpoint_dir:
            self.checkpointer = ModelCheckpointCallback(checkpoint_dir)
    
    def fit(
        self,
        train_loader: DataLoader,
        val_loader: DataLoader,
        optimizer: torch.optim.Optimizer,
        scheduler: torch.optim.lr_scheduler._LRScheduler,
        loss_fn: nn.Module,
        epochs: int = 100,
        checkpoint_dir: Optional[Path] = None,
    ):
        """
        Main training loop.
        
        Args:
            train_loader: Training data loader
            val_loader: Validation data loader
            optimizer: Optimizer
            scheduler: Learning rate scheduler
            loss_fn: Loss function
            epochs: Number of epochs
            checkpoint_dir: Directory to save checkpoints
        """
        # Setup callbacks
        self.setup_callbacks(checkpoint_dir)
        
        print(f"Starting training for {epochs} epochs")
        print(f"  Device: {self.device}")
        print(f"  AMP: {self.use_amp}")
        print(f"  Model parameters: {sum(p.numel() for p in self.model.parameters()):,}")
        
        for epoch in range(epochs):
            # Training phase
            train_loss = self._train_epoch(
                train_loader, optimizer, scheduler, loss_fn
            )
            
            # Validation phase
            val_loss, val_acc = self._validate_epoch(val_loader, loss_fn)
            
            # Metrics tracking
            current_lr = optimizer.param_groups[0]["lr"]
            self.metrics_tracker.on_validation_end(val_loss, val_acc)
            
            # Print progress
            print(
                f"Epoch {epoch+1:3d}/{epochs} | "
                f"Train Loss: {train_loss:.4f} | "
                f"Val Loss: {val_loss:.4f} | "
                f"Val Acc: {val_acc:.2%} | "
                f"LR: {current_lr:.2e}"
            )
            
            # Checkpointing
            if self.checkpointer:
                metrics = {
                    "train_loss": train_loss,
                    "val_loss": val_loss,
                    "val_acc": val_acc,
                }
                self.checkpointer.on_validation_end(
                    epoch, metrics, self.model, optimizer
                )
            
            # Early stopping
            if self.early_stopping:
                self.early_stopping.on_validation_end(val_loss, self.model)
                if self.early_stopping.should_stop:
                    print(f"✓ Stopped at epoch {epoch+1}")
                    if self.early_stopping.restore_best_weights:
                        self.early_stopping.restore_best_model(self.model)
                    break
            
            # Learning rate scheduling
            if scheduler:
                scheduler.step(val_loss)
        
        print("✓ Training complete!")
    
    def _train_epoch(
        self,
        train_loader: DataLoader,
        optimizer: torch.optim.Optimizer,
        scheduler: torch.optim.lr_scheduler._LRScheduler,
        loss_fn: nn.Module,
    ) -> float:
        """Single training epoch."""
        self.model.train()
        total_loss = 0.0
        num_batches = 0
        
        for batch_idx, batch_data in enumerate(train_loader):
            # Move data to device
            if isinstance(batch_data, (tuple, list)):
                x, y = batch_data
                x = x.to(self.device)
                y = y.to(self.device)
            else:
                x = batch_data.to(self.device)
                y = None
            
            # Forward pass with AMP
            if self.use_amp:
                with torch.cuda.amp.autocast():
                    output = self.model(x)
                    loss = loss_fn(output, y) if y is not None else loss_fn(output)
                    loss = loss / self.accumulation_steps
                
                # Backward pass
                self.scaler.scale(loss).backward()
                
                if (batch_idx + 1) % self.accumulation_steps == 0:
                    self.scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.max_grad_norm)
                    self.scaler.step(optimizer)
                    self.scaler.update()
                    optimizer.zero_grad()
            else:
                output = self.model(x)
                loss = loss_fn(output, y) if y is not None else loss_fn(output)
                loss = loss / self.accumulation_steps
                loss.backward()
                
                if (batch_idx + 1) % self.accumulation_steps == 0:
                    torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.max_grad_norm)
                    optimizer.step()
                    optimizer.zero_grad()
            
            total_loss += loss.item() * self.accumulation_steps
            num_batches += 1
        
        return total_loss / num_batches
    
    @torch.no_grad()
    def _validate_epoch(
        self,
        val_loader: DataLoader,
        loss_fn: nn.Module,
    ) -> Tuple[float, float]:
        """Single validation epoch."""
        self.model.eval()
        total_loss = 0.0
        total_correct = 0
        total_samples = 0
        
        for batch_data in val_loader:
            # Move data to device
            if isinstance(batch_data, (tuple, list)):
                x, y = batch_data
                x = x.to(self.device)
                y = y.to(self.device)
            else:
                x = batch_data.to(self.device)
                y = None
            
            # Forward pass
            with torch.cuda.amp.autocast() if self.use_amp else torch.no_grad():
                output = self.model(x)
                loss = loss_fn(output, y) if y is not None else loss_fn(output)
            
            total_loss += loss.item()
            
            # Accuracy (if classification)
            if hasattr(output, 'direction_logits') and y is not None:
                preds = torch.argmax(output.direction_logits[:, 0, :], dim=1)
                targets = y[:, 0] if y.dim() > 1 else y
                total_correct += (preds == targets).sum().item()
                total_samples += targets.size(0)
        
        avg_loss = total_loss / len(val_loader)
        avg_acc = total_correct / total_samples if total_samples > 0 else 0.0
        
        return avg_loss, avg_acc


# ═══════════════════════════════════════════════════════════════════════════════
# Learning Rate Schedulers
# ═══════════════════════════════════════════════════════════════════════════════

class CosineAnnealingWarmupRestarts(torch.optim.lr_scheduler._LRScheduler):
    """
    Cosine annealing with warm-up and restarts.
    
    Useful for escaping local minima and achieving better generalization.
    """
    
    def __init__(
        self,
        optimizer: torch.optim.Optimizer,
        first_cycle_steps: int,
        cycle_mult: float = 1.0,
        max_lr: float = 0.1,
        min_lr: float = 0.0,
        warmup_steps: int = 0,
        gamma: float = 1.0,
        last_epoch: int = -1,
    ):
        """
        Args:
            optimizer: PyTorch optimizer
            first_cycle_steps: Number of steps in first cycle
            cycle_mult: Cycle length multiplier
            max_lr: Maximum learning rate
            min_lr: Minimum learning rate
            warmup_steps: Number of warmup steps
            gamma: Multiplier for cycle amplitude decay
            last_epoch: Last epoch for resuming training
        """
        self.first_cycle_steps = first_cycle_steps
        self.cycle_mult = cycle_mult
        self.base_max_lr = max_lr
        self.max_lr = max_lr
        self.min_lr = min_lr
        self.warmup_steps = warmup_steps
        self.gamma = gamma
        
        self.cur_cycle_steps = first_cycle_steps
        self.cycle = 0
        self.T_cur = last_epoch
        
        super().__init__(optimizer, last_epoch)
    
    def get_lr(self):
        if self.T_cur == -1:
            return self.base_lrs
        elif self.T_cur < self.warmup_steps:
            return [
                base_lr + (self.max_lr - base_lr) * self.T_cur / self.warmup_steps
                for base_lr in self.base_lrs
            ]
        else:
            progress = (self.T_cur - self.warmup_steps) / (self.cur_cycle_steps - self.warmup_steps)
            progress = max(0, min(progress, 1.0))
            
            return [
                self.min_lr + (self.max_lr - self.min_lr) * 
                max(0, 0.5 * (1 + np.cos(np.pi * progress)))
                for self.max_lr in [self.base_max_lr * (self.gamma ** self.cycle)]
            ]
    
    def step(self, epoch=None):
        if epoch is None:
            epoch = self.last_epoch + 1
            self.T_cur += 1
            
            if self.T_cur >= self.cur_cycle_steps:
                self.cycle += 1
                self.T_cur = self.T_cur - self.cur_cycle_steps
                self.cur_cycle_steps = int(self.first_cycle_steps * (self.cycle_mult ** self.cycle))
        else:
            if epoch >= self.first_cycle_steps:
                if self.cycle_mult == 1.0:
                    self.T_cur = epoch % self.first_cycle_steps
                    self.cycle = epoch // self.first_cycle_steps
                else:
                    calc = False
                    self.cycle = 0
                    self.cur_cycle_steps = self.first_cycle_steps
                    self.T_cur = epoch
                    for i in range(1, epoch):
                        self.cur_cycle_steps = int(self.first_cycle_steps * (self.cycle_mult ** i))
                        if epoch < sum(
                            int(self.first_cycle_steps * (self.cycle_mult ** j)) 
                            for j in range(0, i + 1)
                        ):
                            self.T_cur = epoch - sum(
                                int(self.first_cycle_steps * (self.cycle_mult ** j)) 
                                for j in range(0, i)
                            )
                            self.cycle = i
                            calc = True
                            break
                
                if calc:
                    self.T_cur = epoch - sum(
                        int(self.first_cycle_steps * (self.cycle_mult ** j)) 
                        for j in range(0, self.cycle)
                    )
            else:
                self.T_cur = epoch
        
        self.last_epoch = max(epoch, self.last_epoch)
        self.max_lr = self.base_max_lr * (self.gamma ** self.cycle)
        
        class _enable_get_lr_call:
            def __init__(self, o):
                self.o = o
            
            def __enter__(self):
                self.o._get_lr_called_within_step = True
                return self
            
            def __exit__(self, type, value, traceback):
                self.o._get_lr_called_within_step = False
        
        with _enable_get_lr_call(self):
            for param_group, lr in zip(self.optimizer.param_groups, self.get_lr()):
                param_group['lr'] = lr


class OneCycleLR(torch.optim.lr_scheduler._LRScheduler):
    """
    One cycle learning rate schedule.
    
    Recommended by Leslie Smith for single-cycle training.
    """
    
    def __init__(
        self,
        optimizer: torch.optim.Optimizer,
        max_lr: float,
        total_steps: int,
        pct_start: float = 0.3,
        anneal_strategy: str = "cos",
        cycle_momentum: bool = True,
        base_momentum: float = 0.85,
        max_momentum: float = 0.95,
        div_factor: float = 25.0,
        final_div_factor: float = 1e4,
        last_epoch: int = -1,
    ):
        """
        Args:
            optimizer: PyTorch optimizer
            max_lr: Maximum learning rate
            total_steps: Total number of steps
            pct_start: Percentage of cycle in increasing phase
            anneal_strategy: 'cos' or 'linear'
            cycle_momentum: Whether to cycle momentum
            base_momentum: Base momentum value
            max_momentum: Maximum momentum value
            div_factor: Initial lr = max_lr / div_factor
            final_div_factor: Final lr = initial_lr / final_div_factor
        """
        self.max_lr = max_lr
        self.total_steps = total_steps
        self.pct_start = pct_start
        self.anneal_strategy = anneal_strategy
        self.cycle_momentum = cycle_momentum
        self.base_momentum = base_momentum
        self.max_momentum = max_momentum
        self.div_factor = div_factor
        self.final_div_factor = final_div_factor
        
        self.initial_lr = max_lr / div_factor
        self.final_lr = self.initial_lr / final_div_factor
        
        super().__init__(optimizer, last_epoch)
    
    def get_lr(self):
        return self._get_closed_form_lr()
    
    def _get_closed_form_lr(self):
        div_steps = int(self.total_steps * self.pct_start)
        
        if self.last_epoch < div_steps:
            # Increasing phase
            multiplier = (self.last_epoch / div_steps) * (self.max_lr / self.initial_lr - 1) + 1
            return [self.initial_lr * multiplier for _ in self.base_lrs]
        else:
            # Decreasing phase
            progress = (self.last_epoch - div_steps) / (self.total_steps - div_steps)
            if self.anneal_strategy == "cos":
                multiplier = (1 + np.cos(np.pi * progress)) / 2
            else:  # linear
                multiplier = 1 - progress
            
            return [self.final_lr + (self.max_lr - self.final_lr) * multiplier 
                   for _ in self.base_lrs]


if __name__ == "__main__":
    print("Training pipeline module loaded successfully")
    print("  - MambaTrainer: Main training loop")
    print("  - EarlyStoppingCallback: Automatic stopping")
    print("  - ModelCheckpointCallback: Automatic checkpointing")
    print("  - MetricsCallback: Metrics tracking")
    print("  - CosineAnnealingWarmupRestarts: Advanced scheduler")
    print("  - OneCycleLR: Single-cycle scheduler")
