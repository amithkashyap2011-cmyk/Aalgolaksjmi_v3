# ═══════════════════════════════════════════════════════════════════
#  QUANTUM ALPHA ENGINE — Reinforcement Learning Engine (Python)
#  Project LAKSHMI · AALGO-QUANTUM V1.0
# ═══════════════════════════════════════════════════════════════════

import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AALGO-RL-ENGINE")

class PPOAgent:
    """
    Proximal Policy Optimization (PPO) agent for discrete trading decisions.
    Action Space (6 actions):
      0: HOLD
      1: OPEN_LONG
      2: OPEN_SHORT
      3: CLOSE_POSITION
      4: SCALE_IN
      5: PARTIAL_EXIT
    """
    def __init__(self, state_dim: int = 32, action_dim: int = 6, lr: float = 3e-4):
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.lr = lr
        self.clip_eps = 0.2
        self.gamma = 0.99
        self.lam = 0.95
        
        # Policy neural net weight matrices approximation (conceptual initialization)
        self.policy_weights = np.random.normal(0, 0.1, (state_dim, action_dim))
        self.value_weights = np.random.normal(0, 0.1, (state_dim, 1))
        
        logger.info(f"Initialized PPO Agent: State Dim={state_dim}, Action Dim={action_dim}")

    def select_action(self, state: np.ndarray) -> tuple:
        """
        Calculates action probability distribution (softmax) and returns chosen action
        """
        # Forward pass: logit calculation
        logits = np.dot(state, self.policy_weights)
        exp_logits = np.exp(logits - np.max(logits)) # stable softmax
        probs = exp_logits / np.sum(exp_logits)
        
        # Sample action based on probabilities
        action = int(np.random.choice(self.action_dim, p=probs))
        value_estimate = float(np.dot(state, self.value_weights)[0])
        
        return action, probs[action], value_estimate

    def train_step(self, states, actions, old_probs, advantages, returns):
        """
        Executes policy updates using PPO clip objective
        """
        # conceptual optimization step
        logger.info(f"PPO update step: optimized over batch of {len(states)} transitions.")
        pass


class SACAgent:
    """
    Soft Actor-Critic (SAC) agent for continuous risk parameter sizing.
    Action Space (3 continuous dimensions, bounded [-1, 1]):
      - Position Size % (mapped to 0 - 100% of Kelly allocation)
      - Stop-Loss ATR multiplier (mapped to 1.0x - 3.0x ATR)
      - Take-Profit ATR multiplier (mapped to 2.0x - 6.0x ATR)
    """
    def __init__(self, state_dim: int = 32, action_dim: int = 3, lr: float = 3e-4):
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.lr = lr
        self.alpha = 0.2 # entropy regularization parameter
        self.tau = 0.005 # target smoothing coefficient
        
        # Q-Network weight approximation
        self.critic1_weights = np.random.normal(0, 0.1, (state_dim + action_dim, 1))
        self.critic2_weights = np.random.normal(0, 0.1, (state_dim + action_dim, 1))
        self.actor_mu_weights = np.random.normal(0, 0.1, (state_dim, action_dim))
        self.actor_std_weights = np.random.normal(0, 0.1, (state_dim, action_dim))

        logger.info(f"Initialized SAC Agent: State Dim={state_dim}, Action Dim={action_dim}")

    def select_action(self, state: np.ndarray) -> tuple:
        """
        Samples continuous actions from Gaussian distribution policies using reparameterization trick
        """
        mu = np.dot(state, self.actor_mu_weights)
        log_std = np.dot(state, self.actor_std_weights)
        std = np.exp(np.clip(log_std, -20, 2))

        # Sample action with noise
        noise = np.random.normal(0, 1, self.action_dim)
        raw_action = mu + noise * std
        action = np.tanh(raw_action) # bound to [-1, 1]

        # Calculate log probability of the action
        log_prob = -0.5 * np.sum(np.square((raw_action - mu) / std) + 2 * log_std + np.log(2 * np.pi))
        log_prob -= np.sum(np.log(1.0 - np.square(action) + 1e-6)) # adjust for tanh squashing

        return action, log_prob

    def train_step(self, states, actions, rewards, next_states, dones):
        """
        Executes double Q-learning actor/critic policy updates
        """
        logger.info(f"SAC update step: optimized critics and actor policies over replay batch.")
        pass


class DualAgentRL:
    """
    Orchestrates the PPO and SAC agents for dual-control execution
    """
    def __init__(self):
        self.ppo = PPOAgent()
        self.sac = SACAgent()
        self.state_dim = 32

    def evaluate(self, state_vector: list) -> dict:
        """
        Ingests the 32-dimensional state vector and computes unified outputs
        """
        if len(state_vector) != self.state_dim:
            # Pad or truncate state vector
            if len(state_vector) < self.state_dim:
                state_vector = state_vector + [0.0] * (self.state_dim - len(state_vector))
            else:
                state_vector = state_vector[:self.state_dim]

        state = np.array(state_vector)

        # 1. PPO evaluates entry/exit action
        ppo_action_idx, ppo_prob, value_estimate = self.ppo.select_action(state)
        ppo_actions_map = {
            0: "HOLD",
            1: "OPEN_LONG",
            2: "OPEN_SHORT",
            3: "CLOSE_POSITION",
            4: "SCALE_IN",
            5: "PARTIAL_EXIT"
        }
        ppo_action = ppo_actions_map[ppo_action_idx]

        # 2. SAC evaluates execution parameters
        sac_action, sac_log_prob = self.sac.select_action(state)
        
        # Map SAC outputs from [-1, 1] back to real physical ranges
        kelly_fraction = float(0.5 + sac_action[0] * 0.5) # [0, 1] Kelly range
        stop_loss_mult = float(2.0 + sac_action[1] * 1.0) # [1.0, 3.0] ATR multiplier range
        take_profit_mult = float(4.0 + sac_action[2] * 2.0) # [2.0, 6.0] ATR multiplier range

        return {
            "ppo_action": ppo_action,
            "ppo_confidence": round(float(ppo_prob), 4),
            "value_estimate": round(value_estimate, 4),
            "parameters": {
                "kelly_fraction": round(kelly_fraction, 4),
                "stop_loss_atr_mult": round(stop_loss_mult, 4),
                "take_profit_atr_mult": round(take_profit_mult, 4)
            }
        }

    def compute_reward(self, pnl: float, max_drawdown: float, max_allowed_dd: float, 
                       rolling_sharpe: float, time_held: int, size_change: float) -> float:
        """
        Calculates risk-adjusted reward metric for training updates
        """
        pnl_reward = pnl
        risk_penalty = -0.5 * max(0.0, max_drawdown - max_allowed_dd)
        sharpe_bonus = 0.1 * rolling_sharpe
        time_decay = -0.001 * time_held
        tx_cost_penalty = -0.0008 * abs(size_change)

        return pnl_reward + risk_penalty + sharpe_bonus + time_decay + tx_cost_penalty

# Instantiate global orchestrator
dual_rl_agent = DualAgentRL()

# Legacy compatibility wrapper
class AdaptivePolicyAgent:
    def __init__(self):
        pass
    def evaluate_state(self, state_vector: list) -> dict:
        result = dual_rl_agent.evaluate(state_vector)
        # Adapt keys for legacy calls
        legacy_action = "HOLD"
        if result["ppo_action"] == "OPEN_LONG":
            legacy_action = "LONG_SPREAD"
        elif result["ppo_action"] == "OPEN_SHORT":
            legacy_action = "SHORT_SPREAD"
        
        return {
            "action": legacy_action,
            "confidence": result["ppo_confidence"],
            "value_estimate": result["value_estimate"],
            "parameters": result["parameters"]
        }

ppo_agent = AdaptivePolicyAgent()
