# MAMBA ROOT CAUSE ANALYSIS

## ═══════════════════════════════════════════════
## DIAGNOSTIC SUMMARY
## ═══════════════════════════════════════════════

| CHECK | STATUS | OBSERVATION |
| :--- | :--- | :--- |
| Endpoint Running | NO | Connection refused to default `localhost:8080` or `localhost:5555`. |
| Endpoint Response | N/A | Service not reachable. |
| Checkpoint Present | YES | `models/mamba/checkpoints/mamba-research-v1.pt` (19KB). |
| Checkpoint Valid | NO | 19KB is insufficient for a Mamba model; likely a stub or empty state_dict. |
| Model Loaded | NO | `mamba_predictor.checkpoint_loaded` is FALSE in `quant_engine`. |
| Registry Health | UNHEALTHY | `PredictorRegistry` fails `isHealthy()` check. |

## ═══════════════════════════════════════════════
## EXPECTED vs ACTUAL ARCHITECTURE
## ═══════════════════════════════════════════════

### Expected Architecture (per `models/mamba/INTEGRATION.md`)
*   **Service:** Independent Python microservice on port 5555.
*   **Checkpoint:** `mamba-v1.pt` (Expected size: >40MB for ~45M parameters).
*   **Integration:** `MambaInferenceAdapter` used in `quant_engine`.

### Actual Architecture
*   **Service:** Integrated into `quant_engine/main.py` on port 8080.
*   **Checkpoint:** `mamba-research-v1.pt` (Actual size: 19KB).
*   **Integration:** `MambaPredictor` in `quant_engine/mambaPredictor.py`.

## ═══════════════════════════════════════════════
## MISSING / UNEXPECTED KEYS
## ═══════════════════════════════════════════════

*   **Missing Keys:** `feature_embedding`, `pos_embedding`, `mamba_stack.layers`, `head`.
*   **Unexpected Keys:** None (Checkpoint is likely empty or a minimal stub).

## ═══════════════════════════════════════════════
## RECOMMENDED FIX
## ═══════════════════════════════════════════════

1.  **Replace Checkpoint:** Deploy the full 45M parameter `mamba-v1.pt` checkpoint to `models/mamba/checkpoints/`.
2.  **Verify Port Configuration:** Align `MAMBA_SERVICE_URL` in `server/.env` with the actual `quant_engine` port (default 8080).
3.  **Update Dependencies:** Add `torch` and `mamba-ssm` (if required) to `quant_engine/requirements.txt`.
4.  **Fix Feature Mapping:** Ensure `flattenFeatures` in `MambaPredictor.ts` (12 features) matches the expected input dimension of the model (52 features mentioned in `INTEGRATION.md`).
