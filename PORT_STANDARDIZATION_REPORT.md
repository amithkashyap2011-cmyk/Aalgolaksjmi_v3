# PORT STANDARDIZATION REPORT

## ═══════════════════════════════════════════════
## CANONICAL CONFIGURATION
## ═══════════════════════════════════════════════

*   **Canonical Quant Engine Port:** `8000`
*   **Centralized Config:** `server/src/config/aiEndpoints.ts`

## ═══════════════════════════════════════════════
## UPDATED COMPONENTS
## ═══════════════════════════════════════════════

| COMPONENT | CHANGE | EVIDENCE |
| :--- | :--- | :--- |
| `CNNPredictor.ts` | Imported `AI_ENDPOINTS`, standardized port. | `server/src/services/aqea/ai/CNNPredictor.ts` |
| `PPOExecutionPredictor.ts` | Imported `AI_ENDPOINTS`, standardized port & route. | `server/src/services/aqea/ai/PPOExecutionPredictor.ts` |
| `MambaPredictor.ts` | Imported `AI_ENDPOINTS`, standardized port. | `server/src/services/aqea/v2_research/MambaPredictor.ts` |
| `TransformerAIPredictor.ts` | Imported `AI_ENDPOINTS`, standardized port. | `server/src/services/aqea/v2_research/TransformerAIPredictor.ts` |
| `AIHealthPanel.tsx` | Updated fetch URL to port 8000. | `client/src/components/ai/AIHealthPanel.tsx` |

## ═══════════════════════════════════════════════
## ROUTE ALIGNMENT
## ═══════════════════════════════════════════════

*   **CNN:** `/predict/cnn` (Aligned with `main.py`)
*   **PPO:** `/predict/ppo-execution` (Aligned with `main.py`)
*   **Mamba:** `/research/predict/mamba`
*   **Transformer:** `/research/predict/transformer-micro`
*   **Health:** `/health/models`
