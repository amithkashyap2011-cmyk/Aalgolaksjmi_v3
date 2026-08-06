# MAMBA COMPATIBILITY REPORT

## ═══════════════════════════════════════════════
## CHECKPOINT ANALYSIS
## ═══════════════════════════════════════════════

| ATTRIBUTE | VALUE |
| :--- | :--- |
| File Path | `models/mamba/checkpoints/mamba-research-v1.pt` |
| File Size | `19.3 KB` |
| Status | **INCOMPATIBLE** |

## ═══════════════════════════════════════════════
## ARCHITECTURAL DRIFT
## ═══════════════════════════════════════════════

| COMPONENT | STATUS | OBSERVATION |
| :--- | :--- | :--- |
| `feature_embedding` | MISSING | Missing financial context mapping. |
| `pos_embedding` | MISSING | Sequence positioning layer not found. |
| `mamba_stack.layers` | MISSING | Core SSM layers absent from state_dict. |
| `head` | MISSING | Regression/Classification head not found. |

## ═══════════════════════════════════════════════
## DIAGNOSTIC OBSERVATION
## ═══════════════════════════════════════════════

The checkpoint file `mamba-research-v1.pt` is a placeholder stub (19KB). A functional Mamba model with the specified 45M parameters should exceed 40MB. The current state_dict contains minimal or no actual weights for the `FinancialMambaModel` architecture.

## ═══════════════════════════════════════════════
## REMEDIATION
## ═══════════════════════════════════════════════

1.  **Status marked as DEGRADED:** The system now recognizes this model as reachable (via API) but non-functional (missing weights).
2.  **Startup Continued:** AQEA engine will no longer block on Mamba initialization.
3.  **Required Action:** Deploy a valid `.pt` weight file to the checkpoint directory.
