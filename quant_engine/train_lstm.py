import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
import json
from datetime import datetime
from pathlib import Path
from lstm_predictor import BiLSTM

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT / "models" / "lstm" / "checkpoints"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
MODEL_SAVE_PATH = MODEL_DIR / "bilstm_v1.pt"

def train():
    print("--- Training AQEA Bi-Directional LSTM Sequence Model ---")
    num_samples = 3000
    seq_len = 16
    num_features = 12

    X = np.random.randn(num_samples, seq_len, num_features).astype(np.float32)
    y = np.random.randint(0, 3, size=num_samples)

    # Inject temporal sequence signal patterns
    for i in range(num_samples):
        if y[i] == 1: # LONG
            X[i, :, 3] = np.linspace(0.1, 2.5, seq_len) # Upward close price trend
            X[i, :, 5] = 0.05 # Positive returns
        elif y[i] == 2: # SHORT
            X[i, :, 3] = np.linspace(-0.1, -2.5, seq_len) # Downward close price trend
            X[i, :, 5] = -0.05 # Negative returns
        else: # HOLD
            X[i, :, 3] = np.random.randn(seq_len) * 0.1
            X[i, :, 5] = 0.0

    X_tensor = torch.FloatTensor(X)
    y_tensor = torch.LongTensor(y)

    ds = TensorDataset(X_tensor, y_tensor)
    loader = DataLoader(ds, batch_size=32, shuffle=True)

    model = BiLSTM(input_features=num_features, hidden_dim=64, num_layers=2)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    for epoch in range(12):
        model.train()
        for data, target in loader:
            optimizer.zero_grad()
            output = model(data)
            loss = criterion(output, target)
            loss.backward()
            optimizer.step()

    torch.save(model.state_dict(), MODEL_SAVE_PATH)
    print(f"[PASS] Bi-LSTM checkpoint saved successfully to: {MODEL_SAVE_PATH}")

if __name__ == "__main__":
    train()
