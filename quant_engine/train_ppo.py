"""
Continuous PPO trainer.

Replaces train_ppo_v8.py's DummyEnv (5 raw OHLCV columns zero-padded to 32,
reading a CSV that doesn't exist) with a MarketReplayEnv driven by real,
freshly-fetched Binance candles. The env's state vector fills the same
32 slots PPOExecutionPredictor.ts:107-157 builds at inference time:
  - "Market" block (RSI, ADX, ATR, MACD histogram, close/EMA200): real,
    computed from actual price action — see data_pipeline.py.
  - regime / order-flow / smart-money / CNN-signal / risk blocks: these
    depend on order-book, liquidation, and funding-rate data this
    pipeline doesn't fetch, so they stay zero exactly as the old DummyEnv
    padding did. This is a known, documented gap — not silently pretended
    away.

Same warm-start + safety-gate + backup pattern as train_cnn.py: fine-tune
the existing policy at a lower LR when a checkpoint exists, only promote
if average reward-per-step doesn't regress past tolerance, and keep a
rollback copy of the previous checkpoint.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
try:
    torch.set_num_threads(2)
    torch.set_num_interop_threads(2)
except Exception:
    pass
import torch.optim as optim

import ppo_replay_buffer
import promotion_gate
from data_pipeline import (SYMBOLS, INTERVAL, KLINE_LIMIT, build_training_universe,
                           fetch_klines_paginated)
from ppo_execution_agent import ActorCritic

logger = logging.getLogger("TrainPPO")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT / "models" / "ppo"
CHECKPOINT_PATH = MODEL_DIR / "checkpoints" / "ppo_execution_v1.pt"
BACKUP_PATH = MODEL_DIR / "checkpoints" / "ppo_execution_v1.bak.pt"
STATE_PATH = MODEL_DIR / "train_state.json"

STATE_DIM = 32
ACTION_DIM = 7
REGRESSION_TOLERANCE = 0.02  # avg reward/step may dip this much before a promotion is refused

# Bumped whenever the reward function changes incompatibly. Rewards measured
# under a different version are in different units, so they can't serve as a
# promotion baseline, and a policy trained under the old shaping is not
# fine-tuned as if nothing changed.
#   v2: losses 1.5x, bootstrapped batch returns.
#   v3 (2026-09-30): one-step decision problem over a 25-minute return.
#     The v2 reward paid the 0.1% fee on EVERY 5-minute bar against a mean
#     absolute 5-minute move of ~0.2%, plus an extra loss penalty; a trade then
#     needed roughly +0.15% of edge per bar to beat SKIP (=0), so "never trade"
#     was the optimum of the objective whatever the states said. Reward is now
#     the return over REWARD_HORIZON_BARS (the classifiers' 25-minute horizon) net
#     of the fee, with no extra loss penalty (risk aversion belongs in sizing).
REWARD_VERSION = 3
REWARD_HORIZON_BARS = 5
LOSS_AVERSION = 0.0
# Contextual bandit: an action changes only its own reward, never the next
# state (and consecutive states in the buffer are different symbols anyway), so
# there is nothing to bootstrap. gamma>0 only added noise from ~100 unrelated
# future rewards to every advantage (roughly a 7x loss of signal-to-noise).
GAMMA = 0.0
# Newest fraction of the steps is held out: never trained on, used for the
# promotion decision instead of the policy's own training reward.
HELD_OUT_FRACTION = 0.2

# Prefer real recorded production states once the replay buffer has at
# least this many records whose outcome (next-bar return) is computable.
MIN_REPLAY_STEPS = 2000

BAR_MS = 5 * 60 * 1000  # INTERVAL is 5m


def _action_reward(action_idx: int, ret: float) -> float:
    """One reward function shared by every PPO environment so 'reward' means
    the same thing regardless of where the states came from."""
    if action_idx == 0:      # SKIP_TRADE
        pnl, fees = 0.0, 0.0
    elif action_idx == 1:    # NORMAL_SIZE
        pnl, fees = ret, 0.001
    elif action_idx == 2:    # REDUCE_SIZE
        pnl, fees = ret * 0.5, 0.0005
    elif action_idx == 3:    # INCREASE_SIZE
        pnl, fees = ret * 2.0, 0.002
    else:                    # *_EXIT modes
        pnl, fees = 0.0, 0.0

    dd_penalty = abs(min(0.0, pnl)) * LOSS_AVERSION
    return pnl - fees - dd_penalty


def _load_state() -> dict:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception:
            pass
    return {}


def _save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


def _update_training_report(metrics: dict, hyperparameters: dict) -> None:
    payload = {
        "model": "PPO_EXECUTION_V1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "hyperparameters": hyperparameters,
    }
    report_file = PROJECT_ROOT / "AQEA_V8_TRAINING_REPORT.md"
    if not report_file.exists():
        return
    content = report_file.read_text()
    import re
    new_json = f"```json\n{json.dumps(payload, indent=2)}\n```"
    if re.search(r"### PPO_EXECUTION_V1\n```json.*?```", content, flags=re.DOTALL):
        content = re.sub(r"### PPO_EXECUTION_V1\n```json.*?```", f"### PPO_EXECUTION_V1\n{new_json}", content, flags=re.DOTALL)
        report_file.write_text(content)


class MarketReplayEnv:
    """Steps through real, concatenated multi-symbol candle history.
    Rewards approximate the effect of the sizing/exit action on the
    realized next-bar return — same simplified model train_ppo_v8.py used,
    just fed real prices instead of a missing CSV."""

    def __init__(self, universe: dict):
        frames = []
        for sym, df in universe.items():
            d = df.dropna(subset=["rsi", "adx", "atr", "macd_hist", "ema200"]).copy()
            if d.empty:
                continue
            d["next_return"] = d["close"].shift(-REWARD_HORIZON_BARS) / d["close"] - 1
            d = d.dropna(subset=["next_return"])
            frames.append(d)

        if not frames:
            raise ValueError("No usable data for MarketReplayEnv — every symbol failed feature warmup.")

        import pandas as pd
        self.df = pd.concat(frames, ignore_index=True)
        # Chronological blocks, one per symbol (used to split off a held-out tail).
        bounds, start = [], 0
        for f in frames:
            bounds.append((start, start + len(f)))
            start += len(f)
        self.groups = bounds

        # PPOExecutionPredictor.ts:107-150 fills 32 slots as: regime(0-4),
        # order-flow(5-9), smart-money(10-14), cnn-signal(15-16),
        # risk/execution(17-21), market(22-26) — indices 22-26 are the only
        # ones this pipeline can populate from plain OHLCV candles.
        states = np.zeros((len(self.df), STATE_DIM), dtype=np.float32)
        close = self.df["close"].values
        states[:, 22] = (self.df["rsi"].values / 100)
        states[:, 23] = (self.df["adx"].values / 100)
        states[:, 24] = (self.df["atr"].values / np.where(close == 0, 1, close))
        states[:, 25] = (self.df["macd_hist"].values / np.where(close == 0, 1, close))
        states[:, 26] = (close / np.where(self.df["ema200"].values == 0, 1, self.df["ema200"].values))
        states = np.nan_to_num(states, nan=0.0, posinf=0.0, neginf=0.0)

        self.states = states
        self.returns = self.df["next_return"].values
        self.idx = 0
        self.max_idx = len(self.states) - 1
        self.state_dim = STATE_DIM
        self.action_dim = ACTION_DIM

    def reset(self):
        self.idx = 0
        return self.states[self.idx]

    def step(self, action_idx: int):
        reward = _action_reward(action_idx, self.returns[self.idx])
        self.idx += 1
        done = self.idx >= self.max_idx
        next_state = self.states[self.idx] if not done else np.zeros(self.state_dim, dtype=np.float32)
        return next_state, reward, done


class ReplayBufferEnv:
    """Steps through REAL production state vectors recorded by
    ppo_replay_buffer (the exact 32-dim vectors the TS server sent to
    /predict/ppo-execution — regime, order-flow, smart-money, CNN-signal and
    risk slots all populated). Each record's reward return is the realized
    next-bar move, joined from real candles by the record's timestamp.

    This closes MarketReplayEnv's biggest gap: training on states where 26
    of 32 slots are zero while inference sees them populated."""

    def __init__(self, records: list):
        import time as _time
        now_ms = int(_time.time() * 1000)

        by_symbol: dict = {}
        for r in records:
            sym = r.get("symbol")
            if sym and isinstance(r.get("state"), list) and len(r["state"]) == STATE_DIM:
                by_symbol.setdefault(sym, []).append(r)

        usable_states, usable_returns, usable_ts = [], [], []
        for sym, recs in by_symbol.items():
            min_ts = min(r["ts"] for r in recs)
            bars_needed = int((now_ms - min_ts) / BAR_MS) + 10
            try:
                candles = fetch_klines_paginated(sym, INTERVAL, bars_needed)
            except Exception as e:
                logger.warning(f"[ReplayBufferEnv] Failed to fetch candles for {sym}: {e}")
                continue
            if len(candles) < 3:
                continue

            # Force the ms unit BEFORE casting to int64 — the column's
            # native unit varies by pandas version (datetime64[ns] vs [ms]),
            # and int64-of-whatever-unit silently lands on the wrong scale.
            open_ms = candles["timestamp"].astype("datetime64[ms]").astype("int64").values
            closes = candles["close"].values
            for r in recs:
                # Bar containing the observation; its outcome is the NEXT
                # bar's close-to-close return (same convention as
                # MarketReplayEnv). Records from the still-open bar have no
                # outcome yet and are skipped this cycle.
                i = int(np.searchsorted(open_ms, r["ts"], side="right")) - 1
                if i < 0 or i + REWARD_HORIZON_BARS + 1 >= len(closes) or closes[i] == 0:
                    continue
                usable_states.append(r["state"])
                usable_returns.append(closes[i + REWARD_HORIZON_BARS] / closes[i] - 1.0)
                usable_ts.append(r["ts"])

        if not usable_states:
            raise ValueError("No replay records with computable outcomes.")

        order = np.argsort(np.array(usable_ts))
        self.states = np.nan_to_num(
            np.array(usable_states, dtype=np.float32)[order], nan=0.0, posinf=0.0, neginf=0.0)
        self.returns = np.array(usable_returns, dtype=np.float64)[order]
        self.groups = [(0, len(self.states))]   # one time-ordered block across symbols
        self.idx = 0
        self.max_idx = len(self.states) - 1
        self.state_dim = STATE_DIM
        self.action_dim = ACTION_DIM

    def reset(self):
        self.idx = 0
        return self.states[self.idx]

    def step(self, action_idx: int):
        reward = _action_reward(action_idx, self.returns[self.idx])
        self.idx += 1
        done = self.idx >= self.max_idx
        next_state = self.states[self.idx] if not done else np.zeros(self.state_dim, dtype=np.float32)
        return next_state, reward, done


class ArrayEnv:
    """Plain (states, returns) replay used for the train / held-out split."""

    def __init__(self, states: np.ndarray, returns: np.ndarray):
        self.states = states
        self.returns = returns
        self.idx = 0
        self.max_idx = len(states) - 1
        self.state_dim = STATE_DIM
        self.action_dim = ACTION_DIM

    def reset(self):
        self.idx = 0
        return self.states[self.idx]

    def step(self, action_idx: int):
        reward = _action_reward(action_idx, self.returns[self.idx])
        self.idx += 1
        done = self.idx >= self.max_idx
        next_state = self.states[self.idx] if not done else np.zeros(self.state_dim, dtype=np.float32)
        return next_state, reward, done


def split_env(env, held_out_fraction: float = HELD_OUT_FRACTION,
              embargo: int = REWARD_HORIZON_BARS) -> tuple:
    """(train_env, held_out_env). Within each chronological block the newest
    `held_out_fraction` is held out, and the `embargo` steps before it are
    dropped from training (their reward looks that many bars ahead, into the
    held-out region)."""
    tr_s, tr_r, ho_s, ho_r = [], [], [], []
    for a, b in getattr(env, "groups", [(0, len(env.states))]):
        n = b - a
        cut = a + int(n * (1 - held_out_fraction))
        tr_end = max(a, cut - embargo)
        tr_s.append(env.states[a:tr_end]); tr_r.append(env.returns[a:tr_end])
        ho_s.append(env.states[cut:b]); ho_r.append(env.returns[cut:b])
    cat = lambda parts, shape: np.concatenate(parts) if parts else np.empty(shape)
    return (ArrayEnv(cat(tr_s, (0, STATE_DIM)).astype(np.float32), cat(tr_r, (0,)).astype(np.float64)),
            ArrayEnv(cat(ho_s, (0, STATE_DIM)).astype(np.float32), cat(ho_r, (0,)).astype(np.float64)))


def evaluate_policy(model, env) -> dict:
    """Greedy (deterministic) policy on a held-out env: mean reward per step,
    share of steps that trade, and the always-SKIP / always-NORMAL baselines."""
    model.eval()
    with torch.no_grad():
        probs, _ = model(torch.FloatTensor(env.states))
        actions = torch.argmax(probs, dim=1).numpy()
    rewards = np.array([_action_reward(int(a), r) for a, r in zip(actions, env.returns)], dtype=np.float64)
    normal = np.array([_action_reward(1, r) for r in env.returns], dtype=np.float64)
    trades = (actions != 0) & (actions < 4)
    return {"steps": int(len(rewards)),
            "avg_reward_per_step": float(rewards.mean()) if len(rewards) else 0.0,
            "trade_share": float(trades.mean()) if len(rewards) else 0.0,
            "always_skip_avg": 0.0,
            "always_normal_avg": float(normal.mean()) if len(normal) else 0.0}


def _build_env():
    """Real recorded production states when we have enough of them,
    synthetic candle-derived states otherwise. Returns (env, source)."""
    records = ppo_replay_buffer.load_records()
    if len(records) >= MIN_REPLAY_STEPS:
        try:
            env = ReplayBufferEnv(records)
            if env.max_idx >= MIN_REPLAY_STEPS - 1:
                logger.info(f"[TrainPPO] Training on {env.max_idx + 1} REAL recorded "
                            f"production states (replay buffer).")
                ppo_replay_buffer.compact()
                return env, "replay_buffer"
            logger.info(f"[TrainPPO] Replay buffer has only {env.max_idx + 1} states with "
                        f"computable outcomes (< {MIN_REPLAY_STEPS}) — falling back to synthetic env.")
        except Exception as e:
            logger.warning(f"[TrainPPO] ReplayBufferEnv unusable ({e}) — falling back to synthetic env.")
    else:
        logger.info(f"[TrainPPO] Replay buffer has {len(records)} records "
                    f"(< {MIN_REPLAY_STEPS}) — using synthetic candle env until it fills.")

    logger.info("[TrainPPO] Fetching live training universe from Binance...")
    universe = build_training_universe(SYMBOLS, INTERVAL, KLINE_LIMIT)
    return MarketReplayEnv(universe), "synthetic_candles"


def train_ppo(warm_start: bool = False) -> dict:
    try:
        env, env_source = _build_env()
    except ValueError as e:
        logger.warning(f"[TrainPPO] {e}")
        return {"promoted": False, "reason": str(e)}

    if env.max_idx < 100:
        msg = f"Insufficient replay steps ({env.max_idx}) — skipping this training cycle."
        logger.warning(f"[TrainPPO] {msg}")
        return {"promoted": False, "reason": msg}

    # Hold out the newest slice: the promotion decision must not use the policy's
    # own training reward (it is trained on, and sampled with exploration).
    env, held_out_env = split_env(env)
    if env.max_idx < 100 or held_out_env.max_idx < 100:
        msg = (f"Insufficient steps after the held-out split (train={env.max_idx + 1}, "
               f"held-out={held_out_env.max_idx + 1}) — skipping this training cycle.")
        logger.warning(f"[TrainPPO] {msg}")
        return {"promoted": False, "reason": msg}

    device = torch.device("cpu")
    model = ActorCritic(env.state_dim, env.action_dim).to(device)
    prior_state = _load_state()
    same_reward_version = prior_state.get("reward_version") == REWARD_VERSION
    # Warm-starting is off unless AQEA_PPO_ALLOW_WARM_START=1: the previous policy
    # has already trained on steps that are now in the held-out slice, so its
    # held-out reward would not be an honest out-of-sample number.
    allow_warm = os.getenv("AQEA_PPO_ALLOW_WARM_START") == "1"
    have_prior = bool(warm_start and allow_warm and CHECKPOINT_PATH.exists() and same_reward_version)
    if warm_start and CHECKPOINT_PATH.exists() and not same_reward_version:
        logger.info(f"[TrainPPO] Reward function changed (v{prior_state.get('reward_version')} -> "
                    f"v{REWARD_VERSION}) — training from scratch and resetting the promotion baseline.")
    if have_prior:
        try:
            model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location=device))
            logger.info("[TrainPPO] Warm-started from existing checkpoint.")
        except Exception as e:
            logger.warning(f"[TrainPPO] Could not warm-start ({e}) — training from scratch.")
            have_prior = False

    lr = 5e-5 if have_prior else 1e-4
    epochs = 3 if have_prior else 5
    batch_size = 256
    gamma = GAMMA  # contextual bandit — see GAMMA above

    optimizer = optim.Adam(model.parameters(), lr=lr)
    model.train()

    total_reward = 0.0
    total_steps = 0

    for epoch in range(epochs):
        state = env.reset()
        done = False
        states, actions, rewards, values, log_probs = [], [], [], [], []
        epoch_reward = 0.0
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
            epoch_reward += reward
            steps += 1

            if steps % batch_size == 0 or done:
                returns = []
                # Bootstrap the tail of a mid-episode batch from the critic
                # instead of seeding R=0 — truncating at an arbitrary step
                # systematically biases every batch-tail return toward zero.
                if done:
                    R = 0.0
                else:
                    with torch.no_grad():
                        _, next_value = model(torch.FloatTensor(state).unsqueeze(0).to(device))
                    R = float(next_value.item())
                for r in reversed(rewards):
                    R = r + gamma * R
                    returns.insert(0, R)
                returns_t = torch.FloatTensor(returns).to(device)

                states_t = torch.FloatTensor(np.array(states)).to(device)
                actions_t = torch.LongTensor(actions).to(device)
                old_log_probs_t = torch.FloatTensor(log_probs).to(device)
                values_t = torch.FloatTensor(values).to(device)
                # Normalize the ADVANTAGES (standard PPO), not the returns:
                # z-scoring returns per batch made the critic regress a
                # target whose mean/std changed every 256 steps, and mixed
                # normalized returns with unnormalized values in the
                # advantage — the difference had no consistent meaning.
                advantages = returns_t - values_t
                advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

                # Real PPO reuses each batch for several epochs. With a single
                # update, new_log_probs == old_log_probs so ratio == 1 and the
                # clip never engages — that degenerates to A2C. Iterating lets
                # the policy move while the clip bounds how far. advantages,
                # returns and old_log_probs are fixed (computed under the
                # behaviour policy); only the model updates across epochs.
                PPO_EPOCHS = 4
                ENTROPY_COEF = 0.01
                for _ in range(PPO_EPOCHS):
                    new_probs, new_values = model(states_t)
                    new_dist = torch.distributions.Categorical(new_probs)
                    new_log_probs = new_dist.log_prob(actions_t)
                    entropy = new_dist.entropy().mean()

                    ratio = torch.exp(new_log_probs - old_log_probs_t)
                    surr1 = ratio * advantages
                    surr2 = torch.clamp(ratio, 0.8, 1.2) * advantages
                    actor_loss = -torch.min(surr1, surr2).mean()
                    critic_loss = torch.nn.functional.mse_loss(new_values.squeeze(-1), returns_t)
                    # Entropy bonus (subtracted from loss) discourages premature
                    # policy collapse by rewarding exploration.
                    loss = actor_loss + 0.5 * critic_loss - ENTROPY_COEF * entropy

                    optimizer.zero_grad()
                    loss.backward()
                    optimizer.step()

                states, actions, rewards, values, log_probs = [], [], [], [], []

        logger.info(f"[TrainPPO] Epoch {epoch + 1}/{epochs} | reward={epoch_reward:.4f} | steps={steps}")
        total_reward += epoch_reward
        total_steps += steps

    # env.step()'s reward is a numpy.float64 (it originates from
    # self.returns[self.idx], a numpy array element) and propagates through
    # every += below — cast to native Python floats at the boundary so
    # neither JSON serialization (FastAPI) nor the >= comparison below
    # (which would otherwise yield numpy.bool_, itself not JSON-serializable)
    # trips over a numpy scalar.
    total_reward = float(total_reward)
    avg_reward_per_step = float(total_reward / max(total_steps, 1))
    logger.info(f"[TrainPPO] Avg reward/step: {avg_reward_per_step:.6f}")

    held = evaluate_policy(model, held_out_env)
    heldout_avg = held["avg_reward_per_step"]
    logger.info(f"[TrainPPO] Held-out ({held['steps']} steps): greedy policy avg reward/step "
                f"{heldout_avg:.6f}, trades {held['trade_share']:.1%} of steps; baselines: "
                f"always-skip {held['always_skip_avg']:.6f}, always-normal {held['always_normal_avg']:.6f}")

    state_json = _load_state()
    prior_avg = (state_json.get("last_promoted_heldout_avg_reward_per_step")
                 if same_reward_version else None)
    # The policy must (a) not regress past tolerance vs the last promoted one on
    # held-out data AND (b) be non-negative net of fees there. >= 0, not > 0: a
    # policy that skips everything it has no edge on earns exactly 0 and is
    # legitimately better than a negative-EV one. Strictly-positive expectancy is
    # the bar for EXECUTION AUTHORITY (AQEA_PPO_EXECUTION_AUTHORITY), not for
    # checkpoint promotion.
    no_regression = bool(prior_avg is None or heldout_avg >= prior_avg - REGRESSION_TOLERANCE)
    promote = bool(no_regression and heldout_avg >= 0.0)

    if promote:
        if CHECKPOINT_PATH.exists():
            BACKUP_PATH.write_bytes(CHECKPOINT_PATH.read_bytes())
        CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
        promotion_gate.atomic_save(CHECKPOINT_PATH, lambda t: torch.save(model.state_dict(), t))
        state_json["last_promoted_avg_reward_per_step"] = avg_reward_per_step
        state_json["last_promoted_heldout_avg_reward_per_step"] = heldout_avg
        state_json["last_promoted_at"] = datetime.now(timezone.utc).isoformat()
        logger.info(f"[TrainPPO] Promoted new checkpoint (held-out avg reward/step {heldout_avg:.6f} "
                    f"vs prior {prior_avg}).")
    else:
        reason = ("has negative expectancy on held-out data (must be >= 0 net of fees)"
                  if no_regression else f"regresses past tolerance vs prior {prior_avg}")
        logger.warning(f"[TrainPPO] REFUSED promotion — held-out avg reward/step {heldout_avg:.6f} "
                        f"{reason}. Live checkpoint left untouched.")

    # Explicit flag rather than comparing last_attempt_at/last_promoted_at
    # timestamps — those two are set via separate datetime.now() calls
    # microseconds apart even on a normal promotion, so string-comparing
    # them for "was this refused" is always true and always wrong.
    state_json["last_attempt_promoted"] = promote
    state_json["last_attempt_at"] = datetime.now(timezone.utc).isoformat()
    state_json["last_attempt_avg_reward_per_step"] = avg_reward_per_step   # training reward (info only)
    state_json["last_attempt_heldout_avg_reward_per_step"] = heldout_avg
    state_json["last_attempt_heldout"] = held
    state_json["steps_trained"] = total_steps
    state_json["env_source"] = env_source
    if promote:
        state_json["reward_version"] = REWARD_VERSION
    _save_state(state_json)

    _update_training_report(
        {"total_reward": total_reward, "avg_reward_per_step": avg_reward_per_step, "episodes": epochs},
        {"epochs": epochs, "batch_size": batch_size, "gamma": gamma, "warm_start": have_prior, "lr": lr},
    )

    return {"promoted": promote, "heldout": held, "avg_reward_per_step": avg_reward_per_step,
            "total_reward": total_reward, "steps_trained": total_steps,
            "env_source": env_source}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(train_ppo(), indent=2, default=str))
