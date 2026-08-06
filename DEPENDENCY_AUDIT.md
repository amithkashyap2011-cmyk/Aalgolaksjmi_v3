# DEPENDENCY AUDIT

## ═══════════════════════════════════════════════
## QUANT ENGINE (Python)
## ═══════════════════════════════════════════════

| PACKAGE | STATUS | VERSION | PURPOSE |
| :--- | :--- | :--- | :--- |
| fastapi | VERIFIED | 0.104.1 | API Framework |
| uvicorn | VERIFIED | 0.23.2 | ASGI Server |
| numpy | VERIFIED | 1.26.2 | Numerical Operations |
| pandas | VERIFIED | 2.1.3 | Data Manipulation |
| torch | ADDED | 2.2.0 | DL Framework (Mamba/Transformer) |
| mamba-ssm | ADDED | 1.1.1 | Mamba State Space Model |
| httpx | VERIFIED | 0.25.1 | HTTP Client |

## ═══════════════════════════════════════════════
## VERIFICATION STATUS
## ═══════════════════════════════════════════════

*   **Torch:** Required for `models/mamba` inference.
*   **Mamba-ssm:** Required for specialized Mamba layers.
*   **Conflict Check:** No version conflicts detected with `numpy` or `pandas`.

**NOTE:** Ensure `pip install -r requirements.txt` is run within the `quant_engine/venv`.
