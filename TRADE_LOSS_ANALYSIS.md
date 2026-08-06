# TRADE LOSS FORENSICS REPORT

**Status: CERTIFIED**
**Timestamp: 2026-06-16T10:45:13Z**
**Sample Size:** 48 Closed Trades (Audit of last 48 trades in database)

## Executive Summary

An audit of the last 48 closed trades shows:
* **Total Closed Trades**: 48
* **Winning Trades**: 19 (Gross PnL: +22.37 USDT)
* **Losing Trades**: 29 (Gross PnL: -243.84 USDT)
* **Win Rate**: 39.58%
* **Profit Factor**: 0.0917
* **Losing Trades Distribution**:
  * **STOP_LOSS**: 20 trades
  * **TP3_HIT**: 9 trades (Closed at target but net-negative!)

---

## Top 3 Loss Causes Identified

### 1. High Round-Trip Transaction Costs on Micro-Moves (Negative Net PnL on TP)
* **Forensic Evidence**: 9 trades exited via `TP3_HIT` but realized negative net PnL (e.g., BTCUSDT Trade `6a2eac3b8b38a2676b53f30c`).
* **Root Cause**: The take profit (TP1/TP3) levels were set too close to the entry price (e.g. 0.07% price difference). Round-trip costs (0.05% entry fee + 0.05% exit fee + 0.02% slippage = 0.12%) exceeded the gross price movement, resulting in guaranteed losses upon hitting targets.
* **Remediation**: Adjust the risk engine to ensure that take profit targets are always set at a minimum distance of at least 3x the round-trip fee structure (minimum 0.36% price difference for any trade).

### 2. Stops Too Tight under Ranging/Volatile Conditions
* **Forensic Evidence**: 20 trades hit `STOP_LOSS`.
* **Root Cause**: The Stop Loss multiplier (e.g., 1.5x ATR) is too tight, causing the system to get stopped out by normal market noise before the trade direction can materialize.
* **Remediation**: Increase the Stop Loss ATR multiplier from 1.5x to 2.0x or 2.5x under normal and ranging conditions, and scale down position sizes proportionally to keep absolute risk equal.

### 3. Subsystem Decision Gaps
* **Forensic Evidence**: Standalone accuracy of models is sub-50% (PPO execution at 0%, CNN at 38%, Mamba at 0%).
* **Root Cause**: Uncalibrated model checkpoints leading to low-quality entries.
* **Remediation**: Re-trained the CNN model to achieve proper convergence, and initialized PPO/Mamba checkpoints correctly.
