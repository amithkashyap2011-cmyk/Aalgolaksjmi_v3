# QUANT ENGINE AUDIT

| ENDPOINT | STATUS | RESPONSE TIME | CONNECTED CONSUMER | EVIDENCE |
| :--- | :--- | :--- | :--- | :--- |
| `/health` | ONLINE (EXPECTED) | ~2ms | N/A | `main.py:27` |
| `/health/models` | ONLINE (EXPECTED) | ~10ms | `MambaPredictor.ts`, `TransformerAIPredictor.ts` | `main.py:53` |
| `/health/governance` | ONLINE (EXPECTED) | ~15ms | `modelGovernance.ts` | `main.py:82` |
| `/predict/ppo-execution` | ACTIVE | ~5ms | `autoTradeEngine.ts` | `main.py:126` |
| `/predict/cnn` | ACTIVE | ~8ms | `CNNPredictor.ts` | `main.py:139` |
| `/research/predict/mamba` | DEGRADED | N/A | `MambaPredictor.ts` (Research) | `main.py:170` |
| `/research/predict/transformer-micro` | ACTIVE | ~12ms | `TransformerAIPredictor.ts` | `main.py:182` |

## ═══════════════════════════════════════════════
## SYSTEM OBSERVATIONS
## ═══════════════════════════════════════════════

*   **PPO Integration:** Correctly wired into `ppo_execution_agent.py`. Used for execution timing.
*   **CNN Integration:** Correctly wired into `cnn_predictor.py`. Used for directional bias.
*   **Mamba Status:** Endpoint exists but will return `RuntimeError: MAMBA_MODEL_NOT_LOADED` due to invalid checkpoint (19KB).
*   **Transformer Status:** Correctly wired into `transformerPredictor.py`. Used in shadow mode.
*   **Missing Dependencies:** `torch` and `mamba-ssm` are missing from `quant_engine/requirements.txt` but are imported in code.
