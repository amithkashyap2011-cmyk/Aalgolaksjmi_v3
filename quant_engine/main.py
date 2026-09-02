from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict
import numpy as np
import logging
import os
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional

import ppo_replay_buffer

from rl_agent import ppo_agent as legacy_ppo_agent
from cnn_predictor import cnn_predictor
from lstm_predictor import LSTMPredictor
lstm_predictor = LSTMPredictor()
from ppo_execution_agent import ppo_agent
from mambaPredictor import mamba_predictor
from transformerPredictor import transformer_predictor
from portfolioPPO import portfolio_ppo
from universeSelection import universe_engine
from regimeForecaster import regime_forecaster
from executionSimulator import execution_simulator
from runtime.registry_client import registry_client
from models.model_validator import ModelValidator
import validation_state
from training_scheduler import run_training_loop, get_last_cycle_result

app = FastAPI(title="AALGOLAKSHMI_V2 - Quant Fusion Engine")

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AALGO-QUANT")

PROJECT_ROOT_VAL = Path(__file__).resolve().parent.parent
validator = ModelValidator(PROJECT_ROOT_VAL)
_registered = False


def try_register():
    """Idempotent: safe to call repeatedly (once per training cycle plus
    once at startup). Only fires the actual registration call the first
    time required models are found HEALTHY."""
    global _registered
    if _registered:
        return

    model_validation_results = validation_state.get()
    required_models = ["cnn", "ppo"]
    fatal_errors = []
    for m in required_models:
        status = model_validation_results.get(m, {}).get("status")
        if status != "HEALTHY":
            fatal_errors.append(f"{m} is {status}: {model_validation_results.get(m, {}).get('reason')}")

    if fatal_errors:
        logger.error(f"System Invariants Violated. Refusing Registration: {fatal_errors}")
        return

    port = os.getenv("QUANT_PORT")
    if not port:
        logger.warning("QUANT_PORT not found in environment. Self-registration disabled.")
        return

    def get_health():
        return model_health()

    asyncio.create_task(registry_client.register(int(port), health_callback=get_health))
    _registered = True
    logger.info(f"Background registration task started for port {port}")


@app.on_event("startup")
async def startup_event():
    # validation_state is the single shared source of truth for model health —
    # the training scheduler refreshes it after every hot-reload, so
    # /health/models reflects a freshly-trained checkpoint without a restart.
    validation_state.refresh()
    logger.info(f"Model Validation Results: {validation_state.get()}")

    # Kick off continuous learning in the background regardless of whether
    # registration below succeeds — a DEGRADED/missing checkpoint is
    # exactly the case the training loop exists to fix. Its first cycle
    # runs immediately (see training_scheduler.py), not after a full
    # interval, so a fresh boot with empty checkpoints self-heals instead
    # of sitting DEGRADED indefinitely. try_register() re-runs after every
    # cycle so a successful first cycle registers the engine without
    # needing a process restart.
    asyncio.create_task(run_training_loop(on_cycle_complete=try_register))

    # 🛡️ Phase 5 Invariant Enforcement: Refuse registration if required models are DEGRADED
    try_register()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"ENTER Path: {request.url.path}")
    response = await call_next(request)
    logger.info(f"EXIT Path: {request.url.path} Status: {response.status_code}")
    return response

def clean_vector(vec: List[Any], expected_dim: int = 32) -> List[float]:
    """
    🛡️ RCEP-001 FIX: Auto-padding/clipping for PPO vectors.
    Replaces NaN and Inf with 0.0 for Pydantic/Torch stability.
    """
    cleaned = [float(x) if np.isfinite(x) else 0.0 for x in vec]
    
    # Pad if too short
    if len(cleaned) < expected_dim:
        logger.warning(f"Auto-padding vector from {len(cleaned)} to {expected_dim}")
        cleaned.extend([0.0] * (expected_dim - len(cleaned)))
    
    # Clip if too long
    if len(cleaned) > expected_dim:
        logger.warning(f"Auto-clipping vector from {len(cleaned)} to {expected_dim}")
        cleaned = cleaned[:expected_dim]
        
    return cleaned

@app.get("/health")
def health_check():
    return {"status": "Online", "module": "Quant Core"}

import os
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def get_training_metrics():
    report_path = PROJECT_ROOT / "AQEA_V8_TRAINING_REPORT.md"
    metrics = {}
    if report_path.exists():
        try:
            content = report_path.read_text()
            # Crude parser for the JSON blocks in the markdown
            import re
            json_blocks = re.findall(r"```json\n(.*?)\n```", content, re.DOTALL)
            for block in json_blocks:
                data = json.loads(block)
                if "model" in data:
                    metrics[data["model"].lower()] = data
        except Exception as e:
            logger.error(f"Failed to parse training report: {e}")
    return metrics

@app.get("/health/models")
def model_health():
    """
    AQEA Standardized Model Health Endpoint.
    """
    validation_results = validation_state.get()

    # Helper to determine status
    def get_status(name, loaded):
        val = validation_results.get(name, {})
        if not loaded: return "NOT_LOADED"
        if val.get("status") == "DEGRADED": return "DEGRADED"
        return "HEALTHY"

    res = {
        "cnn": get_status("cnn", cnn_predictor.checkpoint_loaded),
        "lstm": get_status("lstm", lstm_predictor.checkpoint_loaded),
        "ppo": get_status("ppo", ppo_agent.checkpoint_loaded),
        "transformer": get_status("transformer", transformer_predictor.checkpoint_loaded),
        "mamba": get_status("mamba", mamba_predictor.checkpoint_loaded)
    }

    # Check for reasons
    reasons = []
    for name, result in validation_results.items():
        if result.get("status") == "DEGRADED":
            reasons.append(f"{name}: {result.get('reason')}")
    
    if reasons:
        res["validation_reasons"] = reasons
        
    return res

@app.get("/health/models/detailed")
def model_health_detailed():
    """
    AQEA V7.3 Detailed Model Governance Endpoint.
    """
    training_metrics = get_training_metrics()
    
    return {
        "cnn": {
            "healthy": cnn_predictor.checkpoint_loaded,
            "checkpointLoaded": cnn_predictor.checkpoint_loaded,
            "lastInference": cnn_predictor.last_inference,
            "training": training_metrics.get("cnn_1d_v1"),
            "required": True
        },
        "ppo": {
            "healthy": ppo_agent.checkpoint_loaded,
            "checkpointLoaded": ppo_agent.checkpoint_loaded,
            "lastInference": ppo_agent.last_inference,
            "training": training_metrics.get("ppo_execution_v1"),
            "required": True
        },
        "mamba": {
            "healthy": True, # API is healthy
            "checkpointLoaded": mamba_predictor.checkpoint_loaded,
            "lastInference": mamba_predictor.last_inference,
            "compatibility": mamba_predictor.compatibility_report,
            "training": training_metrics.get("mamba_research_v1"),
            "required": False,
            "status": "DEGRADED" if not mamba_predictor.checkpoint_loaded else "HEALTHY"
        },
        "transformer": {
            "healthy": transformer_predictor.checkpoint_loaded,
            "checkpointLoaded": transformer_predictor.checkpoint_loaded,
            "lastInference": transformer_predictor.last_inference,
            "training": training_metrics.get("transformer_micro_v1"),
            "required": False
        }
    }

@app.get("/health/training")
def training_health():
    """
    Continuous-learning status: whether the background training loop is
    enabled, what the last cycle did (promoted/refused/errored per model),
    and each model's persisted train-state (last promotion time + metric).
    """
    import json as _json
    from pathlib import Path as _Path
    import training_scheduler

    def _read_state(rel_path: str):
        p = PROJECT_ROOT_VAL / rel_path
        if p.exists():
            try:
                return _json.loads(p.read_text())
            except Exception:
                return {}
        return {}

    return {
        "enabled": training_scheduler.ENABLED,
        "interval_seconds": training_scheduler.INTERVAL_SECONDS,
        "last_cycle": training_scheduler.get_last_cycle_result(),
        "cnn_train_state": _read_state("models/cnn/train_state.json"),
        "ppo_train_state": _read_state("models/ppo/train_state.json"),
    }

@app.get("/health/governance")
def model_governance():
    """
    AQEA V8.1 Model Quality Gate.
    Evaluates models against production readiness criteria.
    """
    health = model_health_detailed()
    readiness = {}

    for model_id, status in health.items():
        if not isinstance(status, dict):
            continue
        if not status.get("checkpointLoaded"):
            readiness[model_id] = {"status": "OFFLINE", "reasons": ["Checkpoint not loaded"]}
            continue

        training = status.get("training") or {}
        metrics = training.get("metrics") if isinstance(training, dict) else None
        if not metrics:
            readiness[model_id] = {"status": "DEGRADED", "reasons": ["No training metrics found"]}
            continue

        reasons = []

        support = {k: v["support"] for k, v in metrics.items() if k in ["0", "1", "2"] and isinstance(v, dict) and "support" in v}
        total = sum(support.values())

        if total > 0:
            for cls, val in support.items():
                pct = (val / total) * 100
                if cls in ["0", "1"] and pct < 10:
                    reasons.append(f"Minority class {cls} distribution < 10% ({pct:.1f}%)")
                if pct > 80:
                    reasons.append(f"Class {cls} over-represented > 80% ({pct:.1f}%)")

        for cls, m in metrics.items():
            if cls in ["0", "1", "2"] and isinstance(m, dict) and m.get("recall") == 0:
                reasons.append(f"Class {cls} has ZERO recall")

        readiness[model_id] = {
            "status": "PASS" if not reasons else "FAIL",
            "reasons": reasons,
            "is_required": status.get("required", False),
        }

    return readiness

class PPORequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    state_vector: List[float]
    symbol: Optional[str] = None

@app.post("/predict/ppo-execution")
def predict_ppo_execution(data: PPORequest):
    try:
        logger.info(f"[HANDLER] PPO ENTER")
        # 🛡️ RCEP-001: Enforce dim=32 for this specific model
        clean_state = clean_vector(data.state_vector, expected_dim=32)
        logger.info(f"[HANDLER] PPO CLEANED len={len(clean_state)}")
        # Record the real production state so train_ppo.py can learn from
        # the served distribution instead of synthetic zero-filled states.
        ppo_replay_buffer.record(clean_state, symbol=data.symbol)
        result = ppo_agent.select_action(clean_state)
        logger.info(f"[HANDLER] PPO AGENT DONE")
        return result
    except Exception as e:
        logger.error(f"PPO Inference error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class CNNRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    symbol: str
    features: dict

@app.post("/predict/cnn")
def predict_cnn(data: CNNRequest):
    try:
        ohlcv = data.features.get("ohlcv", [])
        indicators = data.features.get("indicators", [])
        result = cnn_predictor.predict(ohlcv, indicators, symbol=data.symbol)
        return result
    except Exception as e:
        logger.error(f"CNN Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class LSTMRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    symbol: str
    features: List[float]

@app.post("/predict/lstm")
def predict_lstm(data: LSTMRequest):
    try:
        result = lstm_predictor.predict(data.symbol, data.features)
        return result
    except Exception as e:
        logger.error(f"LSTM Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/debug/cnn")
def debug_cnn(data: CNNRequest):
    """
    AQEA V8.2 Runtime Forensics Endpoint.
    Exposes raw logits, normalized inputs, and softmax probabilities.
    """
    try:
        ohlcv = data.features.get("ohlcv", [])
        indicators = data.features.get("indicators", [])
        
        # We'll need to update cnn_predictor to support this
        if hasattr(cnn_predictor, 'debug_predict'):
            result = cnn_predictor.debug_predict(ohlcv, indicators)
            return result
        else:
            return {"error": "CNNPredictor does not support debug_predict yet"}
    except Exception as e:
        logger.error(f"CNN Debug error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class MambaRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    sequence: List[List[float]]

@app.post("/research/predict/mamba")
def predict_mamba(data: MambaRequest):
    try:
        result = mamba_predictor.predict(data.sequence)
        return result
    except Exception as e:
        logger.error(f"Mamba research error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class MicrostructureRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    data: List[List[float]]

@app.post("/research/predict/transformer-micro")
def predict_transformer_micro(data: MicrostructureRequest):
    try:
        rows = [clean_vector(r, expected_dim=20) for r in data.data]
        result = transformer_predictor.predict(rows)
        return result
    except Exception as e:
        logger.error(f"Transformer micro error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ... (rest of models)

class PortfolioPPORequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    state_vector: List[float]
    symbols: List[str]

@app.post("/research/predict/portfolio-ppo")
def predict_portfolio_ppo(data: PortfolioPPORequest):
    try:
        result = portfolio_ppo.select_action(data.state_vector, data.symbols)
        return result
    except Exception as e:
        logger.error(f"Portfolio PPO error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class UniverseRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    market_data: Dict[str, Dict]

@app.post("/research/universe/rank")
def rank_universe(data: UniverseRequest):
    try:
        result = universe_engine.rank_symbols(data.market_data)
        return result
    except Exception as e:
        logger.error(f"Universe ranking error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class RegimeRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    returns: List[float]
    volatility: float

@app.post("/research/regime/forecast")
def forecast_regime(data: RegimeRequest):
    try:
        result = regime_forecaster.forecast(data.returns, data.volatility)
        return result
    except Exception as e:
        logger.error(f"Regime forecast error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    order_type: str
    side: str
    amount: float
    price: float
    order_book: Dict
    volatility: float

@app.post("/research/simulate/execution")
def simulate_execution(data: SimulationRequest):
    try:
        result = execution_simulator.simulate_execution(
            data.order_type, data.side, data.amount, data.price, data.order_book, data.volatility
        )
        return result
    except Exception as e:
        logger.error(f"Execution simulation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class DynamicZScoreEngine:
    def __init__(self, lookback_window: int = 24):
        self.window = lookback_window
        self.spread_history = []

    def evaluate_spread(self, price_a: float, price_b: float) -> dict:
        current_spread = price_a / price_b
        self.spread_history.append(current_spread)
        if len(self.spread_history) > self.window: self.spread_history.pop(0)
        return {"status": "ACTIVE", "z_score": 0, "action": "HOLD"}

quant_engine = DynamicZScoreEngine()

class SpectralRegimeRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    symbols: List[str]
    returns: List[List[float]]

@app.post("/api/v1/spectral-regime")
def analyze_spectral_regime(data: SpectralRegimeRequest):
    return {"status": "SUCCESS"}
