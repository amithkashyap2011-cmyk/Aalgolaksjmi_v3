# AQEA V8.3 Feature Schema Audit

**Dataset:** `binance_institutional_v8.csv` (Real Market Data)
**Model:** `CNN_1D_V1`

## Feature Vector Specification

The CNN model expects a 12-dimensional vector per timestamp, expanded to a 64-bar sequence (via duplication or historical lookback).

| Index | Feature Name | Description | Training Mean | Training Std |
| :--- | :--- | :--- | :--- | :--- |
| 0 | `open` | Bar Open Price | 10089.23 | 23810.82 |
| 1 | `high` | Bar High Price | 10098.02 | 23831.52 |
| 2 | `low` | Bar Low Price | 10080.19 | 23789.54 |
| 3 | `close` | Bar Close Price | 10089.04 | 23810.35 |
| 4 | `volume` | Bar Trading Volume | 776169.37 | 3693011.44 |
| 5 | `ret_1` | 1-bar Close-to-Close Pct Change | -1.87e-05 | 0.0022 |
| 6 | `vol_1` | 1-bar Volume Pct Change | 1.1161 | 31.1155 |
| 7 | `dist_ma` | Distance from 21-bar MA | -0.0002 | 0.0052 |
| 8 | `hi_low` | High/Low Range (Normalized) | 0.0025 | 0.0026 |
| 9 | `std_14` | 14-bar Rolling Std / Mean | 0.0023 | 0.0022 |
| 10 | `ma_fast` | 9-bar Simple Moving Average | 10089.79 | 23812.14 |
| 11 | `ma_slow` | 21-bar Simple Moving Average | 10090.94 | 23814.87 |

## Normalization Rules
1. Handle `Inf` and `NaN` values by replacing with 0.0 before scaling.
2. Apply Z-Score normalization: `(x - mean) / (std + 1e-8)`.
3. Input sequence is 64 bars of the normalized vector.
