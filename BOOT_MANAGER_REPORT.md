# BOOT MANAGER REPORT

## Boot Sequence
1. **BOOTING:** Node server starts and binds to port 9991 immediately.
2. **WAITING_FOR_MONGO:** Attempting connection to MongoDB.
3. **WAITING_FOR_QUANT:** Waiting for Quant Engine to POST to `/system/register`.
4. **WAITING_FOR_BINANCE:** Syncing time and pre-warming price feeds.
5. **READY:** All systems nominal. Trading enabled.

## Transitions
- Transition logged to `auto_trade.log` and `BOOT_MANAGER_REPORT.md`.
- State is observable via `/system/status`.
