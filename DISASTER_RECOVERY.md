# Disaster Recovery & Incident Response Runbook

Every procedure below was actually exercised against the running system during a production-readiness pass, not written speculatively. Where something has NOT been tested, it's marked explicitly.

## 1. MongoDB is down / unreachable

**Symptoms**: `/health` reports `"mongodb": false`, `"status": "degraded"`.

**Verified behavior** (real test: `brew services stop mongodb-community` while the server was live):
- Server process does **not** crash (PM2 stays `online`).
- Reads/writes against the in-memory PAPER wallet/position state continue working — balances stay correct.
- No unhandled exception spam in `auto_trade.log`.
- On MongoDB coming back (`brew services start mongodb-community`), the server **reconnects automatically** — no restart needed. Confirmed via continuous `uptime` across the outage (same process, not a restart).

**Action**:
1. `brew services start mongodb-community` (or your platform's equivalent).
2. Confirm: `mongosh --eval "db.adminCommand({ping:1})"`.
3. Confirm server: `curl localhost:9991/health` should show `"mongodb": true` within ~10s, no restart required.
4. If it's been down long enough that a full server restart also happened during the outage: restart triggers `paperState.hydrate()` (restores wallets/positions from the last persisted `WalletSnapshot`/open `Trade` docs) followed by the startup reconciliation pass and the exchange reconciliation engine — check `auto_trade.log` for `Startup reconciliation complete` and `Exchange reconciliation:` lines to confirm both ran.

**Known gap, not fully verified**: if the *server process itself* restarts *while* MongoDB is still down, `hydrate()` will fail/skip and the in-memory state starts empty until Mongo is back and a further reconciliation pass runs. This specific compound scenario has not been tested end-to-end.

## 2. Server process crashes / needs restart

**Verified behavior**: PM2 (`ecosystem.config.js`) auto-restarts on crash, with memory limits configured. Repeated manual restarts this session (10+) all reconciled equity exactly afterward (dashboard totalEquity == wallet + margin + unrealized PnL, checked every time).

**Action**:
1. `pm2 logs aqea-server --lines 100` — check `server_crash.log` and `auto_trade.log` for the actual error.
2. `pm2 restart aqea-server`.
3. Wait for `/health` to report `"state": "READY"`.
4. Verify equity: `GET /aqea-ui/dashboard?userId=...` — `totalEquity` should equal `wallet.USDT + invested.total + openPnL` (allow floating-point rounding at the last 1-2 decimals).
5. Check `auto_trade.log` for `Startup reconciliation complete` and `Exchange reconciliation:` lines.

## 3. Binance API unreachable / timing out

**Verified**: all REST calls in `binanceService.ts` carry a 10s `AbortSignal.timeout`. A hung request fails within 10s rather than hanging indefinitely.

**Not verified**: an actual sustained Binance outage (can't safely simulate against the real exchange). The exchange reconciliation engine (`exchangeReconciliation.ts`) will surface a mismatch alert the next time it runs successfully after connectivity returns, but there's a real gap between "Binance goes down" and "the next successful reconciliation pass" during which local state could silently drift from the real account.

**Action if suspected**:
1. Check `/health` — `"binance": false` indicates the last sync check failed.
2. Check Binance's own status page.
3. Once restored, manually trigger reconciliation rather than waiting for the 5-minute schedule: `POST /system/reconcile` (admin-only) — or `{"userId": "..."}` for a single user.

## 4. Suspected wallet/position drift (LIVE mode)

**Action**:
1. `POST /system/reconcile` with the affected `userId` (admin-only route).
2. Read the response `results[]` — `orphanedLocalTrades`, `orphanedExchangePositions`, `detailMismatches` tell you what was found/auto-fixed vs. flagged.
3. Check the Alerts feed (`GET /alerts` or the dashboard) for `RECONCILIATION:` prefixed entries — these explain exactly what was found and whether it was auto-corrected or needs manual review.
4. `orphanedLocalTrades` (local said OPEN, exchange was flat) are auto-closed — safe, no ambiguity.
5. `orphanedExchangePositions` (exchange has a position with no local record) get a placeholder Trade created from real exchange data — **manually verify and set SL/TP**, since none were set by the system for a position it didn't know about.
6. `detailMismatches` (both sides show a position but disagree on qty/side/leverage) are **not auto-corrected** — investigate manually; this always indicates a real bug or a very unusual race, not routine drift.

## 5. Database backup & restore

**Backup**: `scripts/backup_mongo.sh`, scheduled daily at 3am via cron (`crontab -l` to confirm), gzip dumps to `backups/auto-YYYYMMDD-HHMMSS/`, 14-day rotation. Logs to `backups/backup.log`.

**Restore — actually rehearsed this session**:
```bash
mongorestore --uri="mongodb://127.0.0.1:27017/?replicaSet=rs0" \
  --db=aalgolakshmi \
  --gzip --drop \
  backups/auto-<timestamp>/aalgolakshmi
```
`--drop` replaces existing collections — **do not run this against the live `aalgolakshmi` db casually**. For a real incident: stop the app first (`pm2 stop aqea-server`), restore, verify document counts and spot-check `walletsnapshots`/`trades` against what you expect, then restart.

Verified this session: restoring into a separate throwaway database (`--db=aalgolakshmi_restore_test`, never touching the real db) reproduced `walletsnapshots`, `trades`, `users`, `apikeys`, `settings`, `wallettransactions` with exact document-count and byte-for-byte field matches against the source.

**Not yet rehearsed**: a *live* restore over the real `aalgolakshmi` database (only ever tested into a disposable separate db name). Do a dry run into a scratch db before ever running `--drop` against production.

## 6. Secrets

`JWT_SECRET` and `ENCRYPTION_KEY` live in `server/.env`, not committed. If either needs rotating again:
- `JWT_SECRET`: safe to rotate any time — invalidates all issued tokens, users just log in again. No data migration needed.
- `ENCRYPTION_KEY`: protects stored Binance API keys (`ApiKeys` collection, AES-256-GCM). **Rotating requires re-encrypting every existing document first** — decrypt with the old key, re-encrypt with the new one, verify a full round-trip (decrypt-old → encrypt-new → decrypt-new matches the original) before writing anything, and back up the `apikeys` collection first. Never just swap the env var — every stored key becomes permanently undecryptable.

## 7. Monitoring

- `/health` — quick liveness/readiness check (`mongodb`, `binance`, `state`).
- `/metrics` — Prometheus-format metrics (default Node process metrics + `mongodb_connected`, `open_trades_total{mode}`, `http_request_duration_seconds`, `reconciliation_mismatches_total`). Restricted to loopback requests or a request bearing `X-Metrics-Token` matching `METRICS_TOKEN` if set — standing up an actual Prometheus/Grafana/AlertManager stack to scrape it is an infrastructure decision left to the operator.
- Alerts (`Alert` collection / `GET /alerts` / dashboard) — every RED alert also posts to `ALERT_WEBHOOK_URL` if configured (generic JSON POST — point it at a Slack incoming-webhook URL or any endpoint that accepts one).

## 8. Known open items (see the latest Production/Institutional readiness report for full detail)

- Hedge-mode (dual-side position mode) is detected (reconciliation alerts if the account is in it) but not supported — confirm the exchange account stays in One-way mode.
- Manual `/place-order`'s reduce/average-down branches for LIVE mode still lack full DB-transaction atomicity.
- No real multi-day soak test or high-concurrency (thousands of orders) load test has been run — only shorter, honest proxies.
- `regimeForecaster.py` is fake (hand-written thresholds, not a trained model) — currently unreachable from any live decision path; do not wire it in without replacing the underlying logic.
