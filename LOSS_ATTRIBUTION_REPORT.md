# LOSS ATTRIBUTION REPORT

## Financial Forensics (Phase 6 & 7)
An exhaustive counterfactual replay was executed across the past 1000 trades to attribute the negative expectancy and degraded profitability (PF < 1.2, WR < 45%). 

### Counterfactual Replay Results (Valid Trades = 65)
| Subsystem Excluded | Win Rate | Profit Factor | Expectancy | Count |
|--------------------|----------|---------------|------------|-------|
| Baseline           | 36.92%   | 0.10          | -3.4114    | 65    |
| No CNN             | 36.92%   | 0.10          | -3.4114    | 65    |
| No PPO             | 36.92%   | 0.10          | -3.4114    | 65    |
| No Transformer     | 36.92%   | 0.10          | -3.4114    | 65    |
| No Ensemble        | 36.92%   | 0.10          | -3.4114    | 65    |
| No Regime Filter   | 24.49%   | 0.03          | -4.6885    | 49    |
| No Risk Scaling    | 22.22%   | 0.02          | -2.4087    | 27    |

### Findings
The replay data proves mathematically that the AI models (CNN, PPO, Transformer, Ensemble) had **zero variance** from the baseline. This indicates they did not participate in generating the losing trades.

Further forensic extraction of the event logs reveals that for every single trade in the dataset, all AI predictors actively voted **`HOLD`** (Decision Confidence: 50). 

### Root Cause Ownership
The subsystem destroying profitability is the **Microstructure Weighted Voting Engine** (OrderFlow & SmartMoney integration).

**Mechanism of Failure:**
Despite unanimous `HOLD` votes from all AI contract authorities, the legacy `Weighted Voting` logic in `AQEAEngine.decide` averaged the AI scores (50) with volatile microstructure scores (e.g., OrderFlow = 13). This naive weighted average pulled the `finalScore` below the hardcoded short threshold of `40` (specifically producing scores of `35-39`), resulting in the system taking unauthorized, low-quality SHORT positions into an accumulating market.

### Remedy
1. The `finalScore` averaging logic must be restructured or gated. A trade should NEVER execute if the primary AI consensus dictates `HOLD`.
2. The AI models must act as a hard gate. If CNN/PPO/Transformer consensus is HOLD, microstructure scoring cannot override it.
