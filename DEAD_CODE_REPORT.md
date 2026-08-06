# DEAD CODE REPORT

## ═══════════════════════════════════════════════
## UNUSED SERVICES & MODELS
## ═══════════════════════════════════════════════

| COMPONENT | TYPE | OBSERVATION |
| :--- | :--- | :--- |
| `rlModelService.ts` | SERVICE | No imports found in `.ts` files. Likely replaced by `PPOExecutionPredictor.ts`. |
| `mlModelService.ts` | SERVICE | Stub implementation for XGBoost/RandomForest; superseded by `PredictorRegistry`. |
| `dlModelService.ts` | SERVICE | Contains stubs for LSTM/Transformer; logic moved to `v2_research`. |
| `fix_mocks.js` | SCRIPT | Root level maintenance script, not part of application runtime. |
| `patch_phase1.js` | SCRIPT | Legacy patch script. |
| `AALGOLAKSHMI_V3_HFT_ARCHITECTURE.md` | DOC | References a C++/Rust/Kafka stack that is not implemented in the current MongoDB/Express repo. |

## ═══════════════════════════════════════════════
## ABANDONED MODULES
## ═══════════════════════════════════════════════

*   **V7/V8 Legacy:** Files with `_v8` or similar suffixes that are not imported in `index.ts` or `App.tsx`.
*   **Duplicate Mamba:** `server/src/services/MambaPredictor.ts` vs `server/src/services/aqea/v2_research/MambaPredictor.ts`. The latter is used by `PredictorRegistry`, making the former redundant/dead code.

## ═══════════════════════════════════════════════
## UNREACHABLE ROUTES
## ═══════════════════════════════════════════════

*   `Operations Hub` is a term used in project mandates but does not exist as a literal route or component in the codebase.
*   `/aqea/logs` is defined in `App.tsx` but is missing from the primary `Sidebar.tsx` navigation.
