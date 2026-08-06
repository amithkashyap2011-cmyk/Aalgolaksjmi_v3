# BINANCE AUDIT

## ═══════════════════════════════════════════════
## CONNECTIVITY STATUS
## ═══════════════════════════════════════════════

| LAYER | STATUS | BASE URL | EVIDENCE |
| :--- | :--- | :--- | :--- |
| REST (Spot) | ACTIVE | `https://api.binance.com` | `binanceService.ts:12` |
| REST (Futures) | ACTIVE | `https://fapi.binance.com` | `binanceService.ts:14` |
| WebSocket (Multiplex) | ACTIVE | `wss://stream.binance.com:9443` | `binanceService.ts:13` |

## ═══════════════════════════════════════════════
## INTEGRATION DETAILS
## ═══════════════════════════════════════════════

| FEATURE | STATUS | OBSERVATION | EVIDENCE |
| :--- | :--- | :--- | :--- |
| Spot Trading | SUPPORTED | Market/Limit orders via `placeOrder` | `binanceService.ts:317` |
| Futures Trading | SUPPORTED | Leverage & orders via `placeFuturesOrder` | `binanceService.ts:153` |
| Time Sync | ACTIVE | Periodic sync every 15 mins | `binanceService.ts:38` |
| WS Multiplexing | ACTIVE | Max 200 streams per connection | `binanceService.ts:352` |
| WS Watchdog | ACTIVE | 30s stale feed detection | `binanceService.ts:401` |

## ═══════════════════════════════════════════════
## PERFORMANCE & LIMITS
## ═══════════════════════════════════════════════

*   **Latency:** Recorded during `syncTime()` (Bloom filter style average).
*   **Active Symbols:** Dynamically subscribed based on active trades and user settings.
*   **Rate Limits:** `recvWindow` set to 60000ms for all signed requests to prevent timestamp errors.
*   **Special Cases:** `1000SHIBUSDT` correctly mapped for both Spot and Futures (Line 59).
