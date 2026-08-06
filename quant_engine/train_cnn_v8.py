import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset, WeightedRandomSampler
from pathlib import Path
import json
from datetime import datetime
from sklearn.metrics import classification_report

# Architecture must match quant_engine/cnn_predictor.py
class CNN1D(nn.Module):
    def __init__(self, input_features=12, seq_len=64):
        super(CNN1D, self).__init__()
        self.conv1 = nn.Conv1d(in_channels=input_features, out_channels=64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(64)
        self.conv2 = nn.Conv1d(in_channels=64, out_channels=128, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(128)
        self.conv3 = nn.Conv1d(in_channels=128, out_channels=256, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(256)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.3)
        self.pool = nn.AdaptiveMaxPool1d(1)
        self.fc1 = nn.Linear(256, 128)
        self.fc2 = nn.Linear(128, 3)

    def forward(self, x):
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.dropout(x)
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.dropout(x)
        x = self.relu(self.bn3(self.conv3(x)))
        x = self.pool(x).squeeze(2)
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x # Return raw logits for CrossEntropyLoss

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "data" / "historical" / "binance_institutional_v8.csv"
MODEL_SAVE_PATH = PROJECT_ROOT / "models" / "cnn" / "checkpoints" / "cnn_1d_v1.pt"

def prepare_data():
    print(f"Loading data from {DATA_PATH}...")
    df = pd.read_csv(DATA_PATH)
    
    # 1. Labeling (Future 15-bar returns)
    # Group by symbol and timeframe to avoid cross-contamination
    df = df.sort_values(["symbol", "timeframe", "open_time"])
    df["future_close"] = df.groupby(["symbol", "timeframe"])["close"].shift(-15)
    df["future_return"] = (df["future_close"] / df["close"]) - 1
    
    # Thresholds
    T = 0.004 # 0.4%
    df["label"] = 2 # HOLD
    df.loc[df["future_return"] > T, "label"] = 0 # LONG
    df.loc[df["future_return"] < -T, "label"] = 1 # SHORT
    
    df = df.dropna(subset=["future_return"])
    
    # 2. Features (Simplified for this version to match CNN1D input_features=12)
    # In a full run we'd expand features as per Phase 3, but let's keep it compatible with current model.
    # Features: open, high, low, close, volume (5) + 7 indicators
    
    # Indicator Mock (since we don't want to re-implement talib here for brevity)
    # Using simple pct changes and moving averages
    df["ret_1"] = df.groupby(["symbol", "timeframe"])["close"].pct_change()
    df["vol_1"] = df.groupby(["symbol", "timeframe"])["volume"].pct_change()
    df["ma_fast"] = df.groupby(["symbol", "timeframe"])["close"].transform(lambda x: x.rolling(9).mean())
    df["ma_slow"] = df.groupby(["symbol", "timeframe"])["close"].transform(lambda x: x.rolling(21).mean())
    df["dist_ma"] = (df["close"] / df["ma_slow"]) - 1
    df["hi_low"] = (df["high"] / df["low"]) - 1
    df["std_14"] = df.groupby(["symbol", "timeframe"])["close"].transform(lambda x: x.rolling(14).std() / x.mean())
    
    features_cols = ["open", "high", "low", "close", "volume", "ret_1", "vol_1", "dist_ma", "hi_low", "std_14", "ma_fast", "ma_slow"]
    
    # CLEANING
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(subset=features_cols + ["label"])
    
    # NORMALIZATION (Z-Score)
    for col in features_cols:
        df[col] = (df[col] - df[col].mean()) / (df[col].std() + 1e-8)
    
    print(f"Dataset Size: {len(df)}")
    print(f"Label Distribution:\n{df['label'].value_counts(normalize=True)}")
    
    return df, features_cols

def train():
    df, feature_cols = prepare_data()
    
    # Convert to Tensors
    X = torch.FloatTensor(df[feature_cols].values)
    y = torch.LongTensor(df["label"].values)
    
    # Reshape for CNN (batch, features, seq_len)
    X = X.unsqueeze(2).repeat(1, 1, 64)
    
    # Split
    split = int(len(X) * 0.8)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]
    
    # Class Weights for Loss
    counts = np.bincount(df["label"].values)
    weights = 1.0 / (counts + 1)
    weights = torch.FloatTensor(weights / weights.sum())
    
    # Sampler for training
    sample_weights = [weights[t] for t in y_train]
    sampler = WeightedRandomSampler(sample_weights, len(sample_weights))
    
    train_ds = TensorDataset(X_train, y_train)
    val_ds = TensorDataset(X_val, y_val)
    
    train_loader = DataLoader(train_ds, batch_size=128, sampler=sampler)
    val_loader = DataLoader(val_ds, batch_size=128)
    
    model = CNN1D(input_features=len(feature_cols))
    criterion = nn.CrossEntropyLoss(weight=weights)
    optimizer = optim.AdamW(model.parameters(), lr=0.001, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=2, verbose=True)
    
    print("--- Starting Training ---")
    for epoch in range(15): # More epochs
        model.train()
        train_loss = 0
        for data, target in train_loader:
            optimizer.zero_grad()
            output = model(data)
            loss = criterion(output, target)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0) # Gradient clipping
            optimizer.step()
            train_loss += loss.item()
            
        model.eval()
        val_loss = 0
        all_preds = []
        all_targets = []
        with torch.no_grad():
            for data, target in val_loader:
                output = model(data)
                loss = criterion(output, target)
                val_loss += loss.item()
                all_preds.extend(torch.argmax(output, dim=1).numpy())
                all_targets.extend(target.numpy())
        
        val_loss_avg = val_loss/len(val_loader)
        scheduler.step(val_loss_avg)
        print(f"Epoch {epoch+1} | Train Loss: {train_loss/len(train_loader):.4f} | Val Loss: {val_loss_avg:.4f}")
        
    # Final Report
    report = classification_report(all_targets, all_preds, output_dict=True)
    print("\n--- Final Metrics ---")
    print(json.dumps(report, indent=2))
    
    # Save Checkpoint
    torch.save(model.state_dict(), MODEL_SAVE_PATH)
    print(f"✓ Model saved to {MODEL_SAVE_PATH}")
    
    # Update Report File
    training_report = {
        "model": "CNN_1D_V1",
        "timestamp": datetime.now().isoformat(),
        "metrics": report,
        "hyperparameters": {"epochs": 5, "batch_size": 64, "seq_len": 64, "features": feature_cols}
    }
    
    report_file = PROJECT_ROOT / "AQEA_V8_TRAINING_REPORT.md"
    content = report_file.read_text()
    
    # Replace the CNN block
    import re
    new_json = f"```json\n{json.dumps(training_report, indent=2)}\n```"
    content = re.sub(r'### CNN_1D_V1\n```json.*?```', f'### CNN_1D_V1\n{new_json}', content, flags=re.DOTALL)
    report_file.write_text(content)
    print("✓ AQEA_V8_TRAINING_REPORT.md updated.")

if __name__ == "__main__":
    train()
