# DATABASE AUDIT

## ═══════════════════════════════════════════════
## MONGODB COLLECTIONS
## ═══════════════════════════════════════════════

| COLLECTION | STATUS | SCHEMA EVIDENCE | USAGE |
| :--- | :--- | :--- | :--- |
| `users` | ACTIVE | `User.ts` | Authentication & Identity |
| `trades` | ACTIVE | `Trade.ts` | Lifecycle of PAPER & LIVE orders |
| `settings` | ACTIVE | `Settings.ts` | Risk, behavior, and allowed symbols |
| `apikeys` | ACTIVE | `ApiKeys.ts` | AES-256-GCM encrypted Binance keys |
| `walletsnapshots` | ACTIVE | `WalletSnapshot.ts` | PnL tracking & equity history |
| `aidecisions` | ACTIVE | `AIDecision.ts` | Audit trail of AI recommendations |
| `alerts` | ACTIVE | `Alert.ts` | UI notifications and engine logs |
| `backtestruns` | ACTIVE | `BacktestRun.ts` | Historical simulation results |
| `aqeaaudits` | ACTIVE | `AqeaAudit.ts` | Governance & compliance logging |

## ═══════════════════════════════════════════════
## INTEGRITY & MIGRATIONS
## ═══════════════════════════════════════════════

*   **Hydration:** `paperState.hydrate()` loads open positions into memory on boot.
*   **Migrations:** `index.ts:241` includes logic to drop old indexes on `walletsnapshots` and update `userId` references.
*   **Persistence:** `autoTradeEngine.ts` ensures all decisions and trades are persisted before execution.
*   **Encryption:** `ApiKeys` collection uses IV + AuthTag for secure storage (Line 15 in `ApiKeys.ts`).

## ═══════════════════════════════════════════════
## PERFORMANCE
## ═══════════════════════════════════════════════

*   **Indexes:** Standard `_id` and custom `userId` / `symbol` indexes observed in schemas.
*   **Aggregation:** Extensive use of `$match`, `$group`, and `$sort` in `aqeaAttribution.ts` and `wallet.ts`.
