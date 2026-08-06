import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import os
import logging
import threading
from pathlib import Path

# Setup Logger
logger = logging.getLogger("PPO-AGENT")
logger.setLevel(logging.INFO)

PROJECT_ROOT = Path(__file__).resolve().parent.parent

class ActorCritic(nn.Module):
    """
    PPO Actor-Critic Network for AQEA Execution Optimization
    """
    def __init__(self, state_dim, action_dim):
        super(ActorCritic, self).__init__()
        
        # Shared feature extractor
        self.shared = nn.Sequential(
            nn.Linear(state_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU()
        )
        
        # Actor: Policy output
        self.actor = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, action_dim),
            nn.Softmax(dim=-1)
        )
        
        # Critic: Value output
        self.critic = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1)
        )

    def forward(self, state):
        features = self.shared(state)
        probs = self.actor(features)
        value = self.critic(features)
        return probs, value

class PPOExecutionAgent:
    def __init__(self, model_path=None, state_dim=32, action_dim=7):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = ActorCritic(state_dim, action_dim).to(self.device)
        self.checkpoint_loaded = False
        self.last_inference = None
        self.state_dim = state_dim
        self.action_dim = action_dim
        self._lock = threading.Lock()

        if model_path is None:
             model_path = PROJECT_ROOT / "models" / "ppo" / "checkpoints" / "ppo_execution_v1.pt"
        else:
             model_path = Path(model_path)
        self.model_path = model_path

        self.action_labels = [
            "SKIP_TRADE",
            "NORMAL_SIZE",
            "REDUCE_SIZE",
            "INCREASE_SIZE",
            "CONSERVATIVE_EXIT",
            "STANDARD_EXIT",
            "AGGRESSIVE_EXIT"
        ]

        self._load(model_path)

    def _load(self, model_path: Path):
        logger.info(f"Initializing PPO Agent with checkpoint: {model_path}")

        try:
            if not model_path.exists():
                logger.warning(f"Checkpoint missing at {model_path}. Model initialized with random weights.")
                self.checkpoint_loaded = False
                return

            size_mb = model_path.stat().st_size / (1024 * 1024)
            logger.info(f"Found checkpoint. Size: {size_mb:.2f} MB")

            new_model = ActorCritic(self.state_dim, self.action_dim).to(self.device)
            new_model.load_state_dict(torch.load(model_path, map_location=self.device))
            new_model.eval()

            self.model = new_model
            self.checkpoint_loaded = True
            logger.info(f"Successfully loaded weights from {model_path}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.checkpoint_loaded = False

    def reload(self):
        """Hot-reload the checkpoint from disk after a training cycle
        promotes a new one — no process restart required."""
        with self._lock:
            self._load(self.model_path)
            return self.checkpoint_loaded

    def select_action(self, state_vector):
        """
        Runs inference on the PPO policy.
        """
        logger.info(f"[PPO_AGENT] ENTER select_action() input_len={len(state_vector)}")
        if not self.checkpoint_loaded:
            logger.error("[PPO_AGENT] ERROR - Model not loaded")
            raise RuntimeError("PPO_MODEL_NOT_LOADED")

        # Validation
        sv = np.array(state_vector, dtype=np.float32)
        if not np.isfinite(sv).all():
             logger.error("[PPO_AGENT] ERROR - Non-finite features")
             return {
                "action": "SKIP_TRADE",
                "confidence": 0.0,
                "error": "INVALID_FEATURES"
            }

        logger.info(f"[PPO_AGENT] TRACE - converting to tensor")
        state_tensor = torch.FloatTensor(sv).unsqueeze(0).to(self.device)
        
        logger.info(f"[PPO_AGENT] TRACE - running model forward pass")
        try:
            with torch.no_grad():
                probs, value = self.model(state_tensor)
        except Exception as e:
            logger.error(f"[PPO_AGENT] ERROR - Model forward pass failed: {str(e)}")
            raise e
            
        logger.info(f"[PPO_AGENT] TRACE - post-processing output")
        probs = probs.cpu().numpy()[0]
        action_idx = np.argmax(probs)
        confidence = float(np.max(probs))

        self.last_inference = {
            "timestamp": np.datetime64('now').astype(str),
            "action": self.action_labels[action_idx],
            "confidence": confidence
        }
        
        logger.info(f"[PPO_AGENT] EXIT select_action() action={self.action_labels[action_idx]}")
        return {
            "action": self.action_labels[action_idx],
            "action_idx": int(action_idx),
            "confidence": confidence,
            "value_estimate": float(value.item()),
            "probabilities": probs.tolist()
        }

    def compute_reward(self, net_profit, fees, slippage, max_drawdown):
        """
        Institutional Reward Function: 
        R = netProfit - fees - slippage - drawdownPenalty
        """
        drawdown_penalty = abs(max_drawdown) * 2.0 # Amplify DD penalty
        reward = net_profit - fees - slippage - drawdown_penalty
        return reward

# Initialize Global Agent
ppo_agent = PPOExecutionAgent()
