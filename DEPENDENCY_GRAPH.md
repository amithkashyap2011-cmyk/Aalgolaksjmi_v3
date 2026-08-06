# AQEA DEPENDENCY GRAPH (AI PREDICTORS)

| File | Import Path | Target File | Used At Runtime (YES/NO) |
| :--- | :--- | :--- | :--- |
| `server/src/services/ensembleService.ts` | `./aqea/v2_research/MambaPredictor.js` | `server/src/services/aqea/v2_research/MambaPredictor.ts` | YES |
| `server/src/services/ensembleService.ts` | `./aqea/v2_research/TransformerAIPredictor.js` | `server/src/services/aqea/v2_research/TransformerAIPredictor.ts` | YES |
| `server/src/services/aqea/ai/PredictorRegistry.ts` | `./CNNPredictor.js` | `server/src/services/aqea/ai/CNNPredictor.ts` | YES |
| `server/src/services/aqea/ai/PredictorRegistry.ts` | `./PPOExecutionPredictor.js` | `server/src/services/aqea/ai/PPOExecutionPredictor.ts` | YES |
| `server/src/services/aqea/ai/PredictorRegistry.ts` | `../v2_research/MambaPredictor.js` | `server/src/services/aqea/v2_research/MambaPredictor.ts` | YES |
| `server/src/services/aqea/ai/PredictorRegistry.ts` | `../v2_research/TransformerAIPredictor.js` | `server/src/services/aqea/v2_research/TransformerAIPredictor.ts` | YES |
| `server/src/services/aqea/research/ForecastRouterSimulation.ts` | `./RegimeForecastPredictor.js` | `server/src/services/aqea/research/RegimeForecastPredictor.ts` | NO (Research Only) |
| `server/src/services/aqea/research/TransitionForecastEngine.ts` | `./RegimeForecastPredictor.js` | `server/src/services/aqea/research/RegimeForecastPredictor.ts` | NO (Research Only) |

## ARCHITECTURAL ANALYSIS
- **ACTIVE IMPLEMENTATIONS**: `aqea/v2_research/` (Mamba/Transformer), `aqea/ai/` (CNN/PPO).
- **LEGACY/DUPLICATES**: None remaining in root `services/` (previously deleted).
- **ORPHANED IMPORTS**: `ensembleService.ts` was attempting relative imports assuming it was inside `aqea/` which it is not. It is in `services/`.
- **CONVERGENCE TARGET**: All core predictors should reside in a unified directory structure under `aqea/ai/` or `aqea/v2_research/`. 

## CURRENT BUILD BLOCKER
`src/services/ensembleService.ts` fails to find `./aqea/v2_research/MambaPredictor.js` because the file is in `src/services/ensembleService.ts` and the target is `src/services/aqea/v2_research/...`. The correct import should be `./aqea/v2_research/MambaPredictor.js` relative to `services/`.

Wait, if `ensembleService.ts` is in `server/src/services/` and the predictors are in `server/src/services/aqea/v2_research/`, then `./aqea/v2_research/...` IS the correct relative path.

Root Cause of Build Failure: The previous `replace` in `ensembleService.ts` used incorrect relative paths or the build system is not resolving the `.js` extension correctly during `tsc`.
