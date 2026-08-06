# WEATHER AI AUDIT

## ═══════════════════════════════════════════════
## EXECUTION FLOW
## ═══════════════════════════════════════════════

1.  **Trigger:** `autoTradeEngine.ts` calls `weatherIntelligenceEngine.update()` every 60 seconds.
2.  **Calculation:** `WeatherStressEngine` simulates data for 6 mining regions and calculates `miningStress`.
3.  **Alpha Generation:** `autoTradeEngine.ts` calls `MinerImpactEngine.calculateWeatherAlpha(minerCtx, minerPressure)`.
4.  **Distribution:** `weatherAlpha` is pushed to:
    *   `RegimeDetectionEngine` (via `getWeatherAlpha()`)
    *   `MambaPredictor` / `TransformerPredictor` (Confidence scaling)
    *   `AdaptiveRiskEngine` (Leverage/Size multipliers)
    *   `TradeQualityEngine` (Entry filtering)

## ═══════════════════════════════════════════════
## AUDIT FINDINGS
## ═══════════════════════════════════════════════

| COMPONENT | STATUS | IMPACT | EVIDENCE |
| :--- | :--- | :--- | :--- |
| Weather Engine | ACTIVE | Simulated alpha generation | `weatherIntelligenceEngine.ts` |
| update() executed | YES | Once per 60s tick | `autoTradeEngine.ts:144` |
| WeatherAlpha produced | YES | 0-100 score | `autoTradeEngine.ts:178` |
| WeatherAlpha used | YES | Cross-system risk adjustment | `grep` results (24+ matches) |

## ═══════════════════════════════════════════════
## RISK IMPACT MATRIX
## ═══════════════════════════════════════════════

*   **Alpha > 85:** Leverage 0.5x, Size 0.3x, Risk Limit 0.5x.
*   **Alpha > 70:** Leverage 0.7x, Size 0.6x, Risk Limit 0.8x.
*   **Alpha < 70:** No adjustment (1.0x).

## ═══════════════════════════════════════════════
## CALL CHAIN EVIDENCE
## ═══════════════════════════════════════════════

*   `autoTradeEngine.ts:161` -> `weatherIntelligenceEngine.update()`
*   `autoTradeEngine.ts:178` -> `weatherIntelligenceEngine.setWeatherAlpha(weatherAlpha)`
*   `adaptiveRiskEngine.ts:18` -> `weatherIntelligenceEngine.getRiskAdjustment()`
*   `MambaPredictor.ts:54` -> `weatherIntelligenceEngine.getWeatherAlpha()`
