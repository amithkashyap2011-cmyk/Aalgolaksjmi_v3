# PPO Architecture Audit — AQEA V12.1 Phase 1

**Date**: 2026-06-16  
**Status**: ⚠️ CRITICAL ISSUES FOUND

---

## 1. Three Separate PPO Implementations Identified

### A) Python Neural Network PPO (REAL)
- **File**: `quant_engine/ppo_execution_agent.py`
- **Class**: `ActorCritic(state_dim=32, action_dim=7)`
- **Checkpoint**: `models/ppo/checkpoints/ppo_execution_v1.pt` (238KB, valid PyTorch ZIP)
- **Endpoint**: `POST /predict/ppo-execution`
- **Architecture**: Linear(32→256) → ReLU → Linear(256→128) → ReLU → Actor(128→64→7) + Critic(128→64→1)
- **Checkpoint Loads**: ✅ YES
- **Inference Works**: ✅ YES — returns `SKIP_TRADE` with confidence 0.1557 on zero-vector input

### B) TypeScript Simulated Q-Values (NOT REAL ML)
- **File**: `server/src/services/rlModelService.ts`
- **Function**: `predictRLExitLocal()`
- **Input**: 7 hand-crafted features (`RLExitFeatures` interface)
- **No checkpoint. Pure math formula.**
- **Used by**: NOBODY — `predictRLExitLocal` has zero callers outside its own file. **DEAD CODE.**

### C) Ensemble "PPO Agent" (NOT REAL ML)
- **File**: `server/src/services/ensembleService.ts` → `reinforcementAgentScore()`
- **Input**: `regimeScore`, `orderBookImbalance`, `fundingRate`
- **No checkpoint. Simple formula: `0.5 + (regimeScore-0.5)*0.2 + obi*0.1 + fr*15`**
- **Used by**: Ensemble report generation for the dashboard

---

## 2. Feature Vector Dimension Chain (TS → Python)

### Producer: `PPOExecutionPredictor.mapFeaturesToStateVector()` (Lines 95–144)

| Group | Features | Count |
|-------|----------|-------|
| Regime | regimeCode, score/100, 0, 0, 0 | 5 |
| Order Flow | cvd/1M, delta/10K, oiExpansion, fundingRate*1000, liquidationScore/100 | 5 |
| Smart Money | liquiditySweep, bos, orderBlock, fvg, poc/close | 5 |
| CNN Signal | 0, 0 (hardcoded zeros) | 2 |
| Risk & Context | hasPosition, sl/close, tp/close, 0, 0 | 5 |
| Market | rsi/100, adx/100, atr/close, macdHist/close, close/ema200 | 5 |
| **Subtotal** | | **27** |
| **Zero-padding** | `while (sv.length < 32) sv.push(0)` | **5** |
| **Total** | | **32** |

### Consumer: `ActorCritic(state_dim=32)` — Expects 32

### VERDICT: ✅ NO DIMENSION MISMATCH
The TS mapper produces exactly 32 features (27 real + 5 padding). The Python model expects 32. The ChatGPT-assumed "30 vs 32" bug **does not exist**.

---

## 3. PPO in the Auto-Trade Pipeline

### Call Chain (Proven):
```
AQEAEngine.decide()                    (engine.ts:134)
  → PredictorRegistry.getAllPredictions()  (includes PPO)
  → PPOExecutionPredictor.runInference()   (PPOExecutionPredictor.ts:36)
    → mapFeaturesToStateVector()           (builds 32-dim vector)
    → POST /predict/ppo-execution          (to Python quant engine)
    → Python ppo_agent.select_action()     (ppo_execution_agent.py:85)
```

### PPO Authority (engine.ts:456):
- `PPO_ENABLED: true` ✅ 
- `PPO_SHADOW_MODE: true` — PPO runs but in shadow
- `PPO_EXECUTION_AUTHORITY: false` ❌ — **PPO cannot actually skip/resize trades**

### Critical Finding: PPO has ZERO directional accuracy
- **All 16 PPO telemetry records predict HOLD** with confidence ~0.155
- **0 correct out of 16** resolved outcomes
- The PPO model was trained for EXECUTION decisions (SKIP/RESIZE/EXIT), not directional predictions (LONG/SHORT)
- But the telemetry evaluates it as a directional predictor → 100% LOSS rate

---

## 4. Legacy `rl_agent.py` — Dead Code Analysis

- **File**: `quant_engine/rl_agent.py`
- **Imported in**: `quant_engine/main.py` as `legacy_ppo_agent` (line 10)
- **Used by**: Nothing — variable `legacy_ppo_agent` is never referenced after import
- **Verdict**: **DEAD CODE** — safe to remove

---

## Summary

| Finding | Severity |
|---------|----------|
| No 30-vs-32 dimension mismatch | ✅ Non-issue |
| PPO_EXECUTION_AUTHORITY = false (shadow only) | ⚠️ By design |
| PPO always predicts HOLD (execution model evaluated as directional) | 🔴 CRITICAL |
| CNN Signal slots hardcoded to [0,0] (wasted features) | ⚠️ Medium |
| rlModelService.ts is dead code | ⚠️ Low |
| legacy rl_agent.py is dead code | ⚠️ Low |
