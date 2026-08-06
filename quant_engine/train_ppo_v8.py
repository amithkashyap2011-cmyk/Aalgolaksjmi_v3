import pandas as pd
import numpy as np
import torch
import torch.optim as optim
from pathlib import Path
import json
from datetime import datetime

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent

from ppo_execution_agent import ActorCritic, PPOExecutionAgent

DATA_PATH = PROJECT_ROOT / "data" / "historical" / "binance_institutional_v8.csv"
MODEL_SAVE_PATH = PROJECT_ROOT / "models" / "ppo" / "checkpoints" / "ppo_execution_v1.pt"

class DummyEnv:
    def __init__(self, data_path):
        self.df = pd.read_csv(data_path)
        self.features = ["open", "high", "low", "close", "volume"] # Mock features
        self.df = self.df.dropna(subset=self.features)
        
        # Calculate returns for reward
        self.df["next_return"] = self.df.groupby("symbol")["close"].shift(-1) / self.df["close"] - 1
        self.df = self.df.dropna(subset=["next_return"])
        
        self.state_dim = 32
        self.action_dim = 7
        
        self.states = self.df[self.features].values
        # Pad to 32
        self.states = np.pad(self.states, ((0,0), (0, 32 - len(self.features))), 'constant')
        self.returns = self.df["next_return"].values
        self.idx = 0
        self.max_idx = len(self.states) - 1

    def reset(self):
        self.idx = 0
        return self.states[self.idx]
        
    def step(self, action_idx):
        ret = self.returns[self.idx]
        
        # Reward function: Sharpe + Profit Factor + Drawdown Penalty
        # Simplified simulation of trade execution
        if action_idx == 0: # SKIP
             pnl = 0
             fees = 0
        elif action_idx == 1: # NORMAL LONG
             pnl = ret
             fees = 0.001
        elif action_idx == 2: # REDUCE (e.g. half size long)
             pnl = ret * 0.5
             fees = 0.0005
        elif action_idx == 3: # INCREASE (e.g. 2x size long)
             pnl = ret * 2.0
             fees = 0.002
        else: # EXIT modes
             pnl = 0
             fees = 0

        # Simulate drawdown penalty
        dd = min(0, pnl)
        dd_penalty = abs(dd) * 2.0
        
        # Simulate sharpe (just taking return for now in step)
        reward = pnl - fees - dd_penalty
        
        self.idx += 1
        done = self.idx >= self.max_idx
        next_state = self.states[self.idx] if not done else np.zeros(self.state_dim)
        
        return next_state, reward, done

def train_ppo():
    print(f"Loading data from {DATA_PATH}...")
    env = DummyEnv(DATA_PATH)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ActorCritic(env.state_dim, env.action_dim).to(device)
    optimizer = optim.Adam(model.parameters(), lr=1e-4)
    
    epochs = 5
    batch_size = 256
    gamma = 0.99
    
    print("--- Starting PPO Training ---")
    model.train()
    
    for epoch in range(epochs):
        state = env.reset()
        total_reward = 0
        done = False
        
        states = []
        actions = []
        rewards = []
        values = []
        log_probs = []
        
        steps = 0
        
        while not done:
            state_tensor = torch.FloatTensor(state).unsqueeze(0).to(device)
            probs, value = model(state_tensor)
            
            dist = torch.distributions.Categorical(probs)
            action = dist.sample()
            
            next_state, reward, done = env.step(action.item())
            
            states.append(state)
            actions.append(action.item())
            rewards.append(reward)
            values.append(value.item())
            log_probs.append(dist.log_prob(action).item())
            
            state = next_state
            total_reward += reward
            steps += 1
            
            if steps % batch_size == 0 or done:
                # Update
                returns = []
                R = 0
                for r in reversed(rewards):
                    R = r + gamma * R
                    returns.insert(0, R)
                    
                returns = torch.FloatTensor(returns).to(device)
                returns = (returns - returns.mean()) / (returns.std() + 1e-8)
                
                states_tensor = torch.FloatTensor(np.array(states)).to(device)
                actions_tensor = torch.LongTensor(actions).to(device)
                old_log_probs = torch.FloatTensor(log_probs).to(device)
                values_tensor = torch.FloatTensor(values).to(device)
                
                advantages = returns - values_tensor
                
                new_probs, new_values = model(states_tensor)
                new_dist = torch.distributions.Categorical(new_probs)
                new_log_probs = new_dist.log_prob(actions_tensor)
                
                ratio = torch.exp(new_log_probs - old_log_probs)
                surr1 = ratio * advantages
                surr2 = torch.clamp(ratio, 1.0 - 0.2, 1.0 + 0.2) * advantages
                
                actor_loss = -torch.min(surr1, surr2).mean()
                critic_loss = torch.nn.functional.mse_loss(new_values.squeeze(), returns)
                
                loss = actor_loss + 0.5 * critic_loss
                
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                
                states, actions, rewards, values, log_probs = [], [], [], [], []
                
        print(f"Epoch {epoch+1} | Total Reward: {total_reward:.2f} | Steps: {steps}")

    # Save
    import os
    os.makedirs(os.path.dirname(MODEL_SAVE_PATH), exist_ok=True)
    torch.save(model.state_dict(), MODEL_SAVE_PATH)
    print(f"✓ Model saved to {MODEL_SAVE_PATH}")
    
    # Update Report File
    training_report = {
        "model": "PPO_EXECUTION_V1",
        "timestamp": datetime.now().isoformat(),
        "metrics": {"total_reward": total_reward, "episodes": epochs},
        "hyperparameters": {"epochs": epochs, "batch_size": batch_size, "gamma": gamma}
    }
    
    report_file = PROJECT_ROOT / "AQEA_V8_TRAINING_REPORT.md"
    content = report_file.read_text()
    
    import re
    new_json = f"```json\n{json.dumps(training_report, indent=2)}\n```"
    content = re.sub(r'### PPO_EXECUTION_V1\n```json.*?```', f'### PPO_EXECUTION_V1\n{new_json}', content, flags=re.DOTALL)
    report_file.write_text(content)
    print("✓ AQEA_V8_TRAINING_REPORT.md updated.")

if __name__ == "__main__":
    train_ppo()
