# PROJECT_AUDIT.md

Generated: 2026-06-24  
Safe fixes applied: 2026-06-24 (see **[FIXED]** markers below)

---

## Executive Summary

AALGOLAKSHMI V3 is a complex autonomous crypto-trading platform with a React 18 frontend, Node.js/Express backend, FastAPI Python quant engine, and early-stage C++/Rust HFT layer. The system is functionally operational in PAPER mode with extensive AQEA voting/ML infrastructure. However, several critical issues exist: hardcoded mock values are flowing into live risk calculations, the settings route allows unvalidated mass-update of arbitrary MongoDB fields, CORS is fully open with `*`, and the hardcoded demo password `123456` is auto-registered in the frontend. The TypeScript surface is largely clean (only 1 server-side tsc error). The biggest technical debt is ~30 root-level debug/patch scripts and 109 root-level markdown audit files that have not been cleaned up. Risk management is multi-layered but uses a hardcoded `currentHeat = 8.4` that bypasses the real heat calculation.

---

## Architecture Report

### System Topology

```
[Browser] ←→ [Vite React :9993]
                  ↕ REST proxy + Socket.IO
           [Express Server :9991]
                  ↕ Mongoose
           [MongoDB :27017]
                  ↕ HTTP (dynamic port, qport.tmp)
           [FastAPI Quant Engine :dynamic]
                  ↕ Binance REST/WS
           [Binance Exchange]

[C++ HFT Engine] ← ZeroMQ :5555 ← [Rust Microservices]
  (partially implemented, not integrated into live trading loop)
```

### Data Flow

**Auto-trade tick (60s):**
1. `autoTradeEngine.tick()` → `processUser()` → `processSymbol()`
2. `agentService.buildContext()` fetches 200 klines + indicators
3. `AQEAEngine.decide()` runs regime → MultiTF → OrderFlow → SmartMoney → CNN/PPO/Transformer/Mamba voting
4. `AdaptiveRiskEngine.calculate()` computes SL/TP/size from ATR
5. `ShadowSimulator.openPosition()` logs the shadow trade
6. If decision is LONG/SHORT: `handleLong/handleShort()` → place paper or live order
7. Exit monitoring: V40 circuit breakers (max loss 2%, max hold 12h) → `PositionManager` → `ExitEngine`

**Quant Engine Registration:**
- FastAPI starts → allocates free port → writes to `qport.tmp`
- POST `/system/register` with name=`quant_engine`
- `SystemManager` transitions `WAITING_FOR_QUANT` → `WAITING_FOR_BINANCE` → `READY`
- If CNN or PPO models are DEGRADED at startup, quant engine refuses to register → server stays in `WAITING_FOR_QUANT` indefinitely

### Missing / Incomplete Components

- **C++/Rust HFT layer**: `cpp-hft-engine/src/` and `rust-services/src/` exist as starter stubs, not connected to the trading loop.
- **`outcoomeReportId` interval**: Declared and cleared in `stop()` but never assigned via `setInterval` — dead cleanup code.
- **`validateFeatureVector` called as instance method**: `(this as any).validateFeatureVector(fv)` inside a static method of `AQEAEngine` — this will fail at runtime (static method has no `this` instance).
- **`/health/governance` in quant engine**: Calls `status["checkpointLoaded"]` on a string value from `model_health()`, which returns `{"cnn": "HEALTHY", ...}` not an object — `TypeError` at runtime.
- **`quantum/` services**: Partially integrated; `agentOrchestrator.ts` imported in `routes/agent.ts`; rest of `/quantum/` directory not wired to any route.

---

## Critical Issues

- [x] **[CRITICAL][FIXED]** Unvalidated mass settings update — `server/src/routes/settings.ts:40` — Added `ALLOWED_SETTINGS_FIELDS` allowlist; only whitelisted keys are passed to `$set`.

- [ ] **[CRITICAL]** Hardcoded demo password in production client — `client/src/store/useAppStore.ts:32` — `DEMO_PASSWORD = "123456"` is auto-registered and auto-logged-in on every client boot. Any person visiting the app URL gets a valid authenticated session with real trading permissions.

- [x] **[CRITICAL][FIXED]** `validateFeatureVector` called as instance method on static class — `server/src/services/aqea/engine.ts:152` — Changed to `AQEAEngine.validateFeatureVector(fv)` (correct static call).

- [x] **[CRITICAL][FIXED]** Hardcoded `currentHeat = 8.4` bypasses real heat check — `server/src/services/autoTradeEngine.ts:356` — Removed constant; `processSymbol` now accepts `portfolioHeat` parameter threaded from `processUser`'s real computed heat.

- [x] **[CRITICAL][FIXED]** Hardcoded absolute path to v2 log directory — Fixed in `paperState.ts`, `logger.ts`, `scripts/parse_logs.ts`, `routes/agent.ts`, `routes/trading.ts` (7 occurrences), `routes/wallet.ts`. All now use relative paths or `console.log`.

- [ ] **[CRITICAL]** CORS wildcard on a financial API — `server/src/index.ts:69` — `app.use(cors())` allows any origin to make credentialed requests to the Express API. Combined with the JWT auth, this means CSRF-style attacks from any malicious site are possible if cookies are ever introduced.

- [x] **[CRITICAL][FIXED]** `/health/governance` TypeError in quant engine — `quant_engine/main.py:192-230` — Changed `model_health()` → `model_health_detailed()` which returns proper dicts; added `isinstance` guards to all field accesses.

---

## High Priority Fixes

- [ ] **[HIGH]** `outcomeReportId` interval declared but never assigned — `server/src/services/autoTradeEngine.ts:50` — The interval variable is declared and cleared in `stop()` but `setInterval(...)` is never assigned to it. Cleanup code for an interval that does not exist; if the report logic was intentional it is silently not running.

- [ ] **[HIGH]** Duplicate `/health` endpoint in quant engine — `quant_engine/main.py:90` and `:394` — Two `@app.get("/health")` routes; FastAPI silently uses the last one (`{"status": "Online", "module": "Quant Core"}`), hiding the first richer implementation.

- [ ] **[HIGH]** Duplicate logging setup — `quant_engine/main.py:25-26` and `:378-379` — `logging.basicConfig` and logger are configured twice in the same file. The second call is a no-op but indicates copy-paste errors in the file.

- [ ] **[HIGH]** `riskProfile` is `null` when `aqeaDecision.decision === "HOLD"` but still accessed — `server/src/services/autoTradeEngine.ts:375` — `ShadowSimulator.openPosition()` is only called when `decision !== "HOLD"`, but `riskProfile.positionSize / ctx.ind.close` (line 376) is in the same conditional block. If `riskProfile` is `null` for any other reason when decision is not HOLD, this will throw.

- [ ] **[HIGH]** Miner context is entirely hardcoded — `server/src/services/autoTradeEngine.ts:208-215` — Hash rate (640.5), difficulty (83.5), and miner reserves (1,800,000) are static constants in the production tick loop. The `MinerImpactEngine` and `WeatherIntelligenceEngine` calculations that feed into risk sizing are based on fabricated data.

- [ ] **[HIGH]** BTC dominance fallback used as primary value — `server/src/services/autoTradeEngine.ts:308-311` — `btcDom = 53.5` is the initial value; the try block attempts `getTickerPriceSync("BTCDOMUSDT")` but this is a synchronous price-cache lookup that returns `undefined` for a symbol not actively subscribed. In practice `btcDom` is always 53.5.

- [ ] **[HIGH]** `AdaptiveRiskEngine` base position size is hard-coded to 100 USDT — `server/src/services/adaptiveRiskEngine.ts:98` — `positionSize: 100 * sizeScale`. This ignores the user's actual wallet balance. The `RiskEngine.validateTrade()` in `aqea/riskEngine.ts` correctly computes a balance-relative size but `AdaptiveRiskEngine` (the one actually used in `processSymbol`) does not.

- [ ] **[HIGH]** `settings.ts PUT /update` — `server/src/routes/settings.ts:40` — No field allowlist before `$set: req.body`. Even ignoring the critical mass-update risk above, Mongoose's `runValidators: true` only validates schema-defined fields, not arbitrary keys.

- [ ] **[HIGH]** TypeScript error in production code — `server/src/services/aqea/modelGovernance.ts:27` — `Property 'isHealthy' does not exist on type 'IAIPredictor'` — the only server-side tsc error, indicating a broken interface contract.

- [ ] **[HIGH]** `AICommandCenter`, `AQEAAnalytics`, `RiskCenter` page components exist but are not routed — `client/src/pages/` — Three tsx files are not imported or routed in `App.tsx`, unreachable by users.

---

## Medium Priority Fixes

- [ ] **[MED]** 441 `any` type usages in server TypeScript — Pervasive use of `: any` and `as any` (441 occurrences) eliminates type safety across the trading, risk, and AQEA layers. Key `riskProfile: any` in `autoTradeEngine.ts:551` allows silent field-name mismatches.

- [ ] **[MED]** Duplicate comment block in `autoTradeEngine.ts` — Lines 194 and 196 are identical `/* ── Core tick ──*/` comments; minor but indicates copy-paste debt.

- [ ] **[MED]** `(this as any)` cast on static method — `engine.ts:152` — Even if fixed to `AQEAEngine.validateFeatureVector(fv)`, the method is private static; the cast is a workaround for incorrect access pattern.

- [ ] **[MED]** `recvWindow: "60000"` on all Binance signed requests — `server/src/services/binanceService.ts:91` — 60-second window is unusually large and increases replay-attack exposure. Binance recommends ≤5000ms for security.

- [ ] **[MED]** `systemManager.ts` heartbeat interval is never cleared — `server/src/services/systemManager.ts:100` — The private `heartbeatInterval` is started in the constructor but there is no `destroy()` or `stop()` method to clear it, preventing GC if multiple instances are ever created.

- [ ] **[MED]** Missing React list `key` props — Multiple `client/src/pages/` components call `.map()` without `key=` on the returned JSX elements (LiveLogs, SettingsPage, InstitutionalCommandCenter, etc.), causing React reconciliation warnings and potential rendering bugs.

- [ ] **[MED]** Quant engine `DynamicZScoreEngine` is instantiated but `z_score` always returns 0 — `quant_engine/main.py:386-392` — The `evaluate_spread` method appends to history but always returns `{"z_score": 0, "action": "HOLD"}`. It is a stub with no actual Z-score math.

- [ ] **[MED]** `positionSize` base ignored in AQEA paper trades — The paper trade `quantity` is computed as `allocUsdt / currentPrice` (line 604 / 780) using `riskProfile.positionSize` (always 100 USDT base × sizeScale), not the balance-relative `RiskEngine` output. Users with large balances will always trade tiny fixed amounts.

- [ ] **[MED]** `mlModelService.ts` and `dlModelService.ts` marked as stubs — Both files contain `TODO`/`stub` markers and the ML/DL HTTP calls are secondary to AQEA; they may silently return neutral predictions if the quant engine is offline, with no visible error to the user.

- [ ] **[MED]** `weatherIntelligenceEngine` called via `update()` on every 60s tick but makes network calls — If the weather API is slow or fails, the entire tick for all users is delayed by the await at line 203.

---

## Low Priority Improvements

- [ ] **[LOW]** 109 markdown audit/report files at project root — The entire root directory is cluttered with `AQEA_*.md`, `*_REPORT.md`, etc. These should be moved to a `docs/reports/` folder or deleted.

- [ ] **[LOW]** ~30 root-level debug/patch scripts — `fix_mocks.js`, `patch_autotrade.js`, `strategy_autopsy.js`, `test-*.ts` etc. are one-off debug scripts committed to the repo root. They should be removed or archived.

- [ ] **[LOW]** `paperState.ts` log function writes to hardcoded v2 path — line 46 — Will silently fail on any machine without that exact path; logs are lost.

- [ ] **[LOW]** `quant_engine/main.py` imports `os` and `json` twice — Lines 8 and 93 both have `import os`; lines appear separated by function definitions indicating the file has been appended to rather than edited coherently.

- [ ] **[LOW]** `(this as any)` and `as any` casts in engine suppressing type errors — `engine.ts:152` — Should use `AQEAEngine.validateFeatureVector(fv)` (correct static call) instead of the instance cast.

- [ ] **[LOW]** `Dockerfile` and `docker-compose.yml` exist but are not maintained — No evidence these match the current `ecosystem.config.js` ports (9991/9993) or dynamic quant port.

- [ ] **[LOW]** `capacitor.config.ts` at root — References `aalgolakshmi_v2` and old Vite config paths; not updated for V3.

- [x] **[LOW][FIXED]** `debug/cache` and `debug/sockets` routes are unauthenticated — `server/src/index.ts` — Added `authGuard` middleware to both routes.

- [ ] **[LOW]** Server version string mismatch — `server/src/index.ts:1` says "AALGOLAKSHMI V2 — Server entry", health endpoint returns `"protocol": "V11.5_RELIABILITY_MISSION"`. Version branding is inconsistent throughout.

---

## Dead Code / Unused Files

**Root-level scripts (not imported anywhere, pure debug artifacts):**
- `fix_mocks.js`, `fix_mocks2.js`, `fix_mocks3.js`, `fix_risk_mocks.js`, `fix_process_symbol.js`
- `patch_autotrade.js`, `patch_binance.js`, `patch_phase1.js`
- `analyze_tp3.js`, `analyze_trades.js`, `autopsy_engine.js`, `forensics_engine.js`
- `root_cause_ranking.js`, `root_cause_ranking_v2.js`
- `strategy_autopsy.js`, `strategy_autopsy_v2.js`
- `counterfactual_replay.js`, `loss_forensics_v2.js`, `generate_attribution_md.js`
- `generate_breakdown.js`, `generate_loss_ownership.js`, `parse_audits.js`
- `count.js`, `check_db_collections.js`, `phase8_diagnostic.js`, `test_sv.js`
- `test-balance.ts`, `test-settings.ts`, `test-settings-2.ts`, `test-update-3.ts`
- `test_cnn.js`, `test_node_ppo.js`, `test_of.ts`, `test_risk.ts`
- `force_reconnect.ts`, `trigger_reconnect.ts`
- `V16_CERTIFICATION.js`, `V17_CERTIFICATION.js`

**Client pages with no route:**
- `client/src/pages/AICommandCenter.tsx`
- `client/src/pages/AQEAAnalytics.tsx`
- `client/src/pages/RiskCenter.tsx` (superseded by `RiskCenterV8.tsx`)

**Server — declared but never used:**
- `outcomeReportId` interval in `autoTradeEngine.ts` (declared, cleared, never assigned)
- `agentService.ts` — original `recommend()` / legacy behaviour pipeline still present but `processSymbol()` bypasses it entirely in favour of `AQEAEngine.decide()`

**Python quant engine stubs:**
- `DynamicZScoreEngine` in `main.py` — instantiated but `z_score` always returns 0
- `/api/v1/spectral-regime` endpoint returns `{"status": "SUCCESS"}` with no logic

---

## Security Findings

| Severity | Finding | Location |
|----------|---------|----------|
| CRITICAL | `$set: req.body` — unvalidated mass MongoDB update | `routes/settings.ts:40` |
| CRITICAL | Hardcoded demo password `123456` auto-logs-in all visitors | `store/useAppStore.ts:32` |
| CRITICAL | CORS wildcard `*` on financial API | `server/src/index.ts:69` |
| HIGH | JWT `expiresIn: "7d"` with no refresh/revocation mechanism | `middleware/auth.ts:70` |
| HIGH | `recvWindow: "60000"` on Binance signed requests (large replay window) | `binanceService.ts:91` |
| MEDIUM | `/debug/cache` and `/debug/sockets` unauthenticated | `server/src/index.ts:425,436` |
| MEDIUM | `ENCRYPTION_KEY` validated at call time only — no startup check | `lib/crypto.ts:9` |
| LOW | `user.role` stored as plain string with no enum enforcement at DB level | `models/User.ts` (inferred) |

**Positive findings:**
- AES-256-GCM with random IV for Binance API key encryption — correct
- JWT verification uses `process.env.JWT_SECRET` (not hardcoded) — correct
- Auth middleware properly returns 401 on missing/expired token — correct
- No `eval()` or `execSync()` found in server TypeScript — correct

---

## TypeScript Errors

**Server (`cd server && npx tsc --noEmit`):**
```
src/services/aqea/modelGovernance.ts(27,71): error TS2339:
  Property 'isHealthy' does not exist on type 'IAIPredictor'.
```
One error only. All other server TypeScript compiles cleanly.

**Client (`cd client && npx tsc --noEmit`):**
Zero errors.

**`any` type count in server:** 441 occurrences — high but not causing compilation errors; causes runtime unsafety.

---

## Performance / Memory Issues

| Issue | Location | Detail |
|-------|---------|--------|
| Unbounded `positions` Map | `paperState.ts:66` | No max-size limit; grows indefinitely with every trade; survives server restart via hydration |
| `peakPrices` and `cooldowns` Maps | `autoTradeEngine.ts:62-66` | Cleared per-key on exit/disableUser but never flushed globally; long-running servers accumulate stale entries for symbols/users no longer active |
| `weatherIntelligenceEngine.update()` in tick | `autoTradeEngine.ts:203` | Awaited network call in the main tick; if slow, blocks all user processing for that interval |
| `systemManager` heartbeat interval never cleared | `systemManager.ts:100` | No cleanup path; NodeJS process cannot exit cleanly if singleton is held |
| `PositionManager.signalState` Map | `positionManager.ts:23` | Static Map accumulates `userId:symbol:direction` keys; never evicted except on signal confirmation |
| Every Binance `placeOrder` call in `handleExit` does a fresh `getKlines` fetch | `autoTradeEngine.ts:917` | A 1m kline fetch on every exit for price; could use the already-fetched `ctx.ind.close` |
| `Trade.find()` called twice on each risk evaluation | `riskEngine.ts:48,72` | Two separate DB queries per `validateTrade`; could be combined with a single aggregation |

---

## AQEA Engine Notes

1. **Voting quorum not enforced**: `authorizedPredictions` can be empty if the quant engine is offline and AI inference fails. The system falls through to `coreScore`-only decisions with no quorum requirement and no alert to the user.

2. **`(this as any).validateFeatureVector(fv)` is broken**: This is a `private static` method called incorrectly as if it were an instance method. In JavaScript class statics, `this` inside a static method is the class itself, but the `(this as any)` cast suppresses the TS error. It actually resolves to `AQEAEngine.validateFeatureVector(fv)` at runtime which is correct — but the cast is hiding the intent and is fragile.

3. **Core score recalibration logic is asymmetric**: Trending regimes get `regime.score * (0.90 + multiTf.score/200)` (range: 90%–140% of regime score), capped at 100. Non-trending gets a weighted average `regime.score * 0.70 + multiTf.score * 0.30`. This means TRANSITION regimes can never produce a `coreScore > 100`, but TRENDING regimes can be amplified above the raw regime score.

4. **Feature vector `execution.positionSize/stopLoss/takeProfit` always 0**: When building the feature vector for AI models, execution fields are always set to 0 (`execution: { positionSize: 0, stopLoss: 0, takeProfit: 0 }`). If the CNN/PPO models were trained with real execution context, they are receiving zero-filled inputs.

5. **`ShadowSimulator.openPosition` can be called with `riskProfile.tp1 = undefined`**: If `AdaptiveRiskEngine` returns NaN/0 tp1 (e.g., ATR=0), the shadow position records invalid levels.

6. **AQEA `decide()` result `stopLoss` field**: `AQEADecision.stopLoss` (line 50) is set in `engine.ts:594` but `autoTradeEngine.ts` uses `riskProfile.sl` instead — the AQEA SL is computed but discarded; `AdaptiveRiskEngine` recomputes its own SL independently.

---

## Risk Management Review

**Strengths:**
- V40 circuit breaker: 2% max-loss-per-position and 12h max-hold-time are implemented.
- `RiskEngine.validateTrade()` enforces max concurrent positions, portfolio exposure limit, and daily drawdown.
- `PortfolioHeatEngine` blocks new entries at heat threshold.
- Multiple SL/TP layers: ExitEngine (hard static), PositionManager (dynamic AI), AutoCloseEngine (regime/sentiment), V40 circuit breaker.

**Weaknesses:**
1. **`currentHeat = 8.4` constant** (line 356) — actual heat calculated at line 273 (`currentHeat`) is not passed to `AdaptiveRiskEngine`. Real heat enforcement only works at the `PortfolioHeatEngine.checkEnforcement()` level, not for position sizing.
2. **No daily max-trades limit**: `riskEngine.ts` checks daily P&L drawdown but not max trades per day — a runaway loop could place hundreds of trades.
3. **LIVE exit doesn't confirm fill**: `handleExit` for LIVE mode calls `placeOrder` but does not await or check the result before updating the internal state — if the Binance order fails, the position is still removed from `paperState`.
4. **Stop-loss not placed as exchange order**: Both paper and live entries set `sl` in the database and rely on the 60s tick to detect and exit. There is no server-side bracket order or exchange-native stop. A server crash between ticks could leave a live position unprotected.
5. **Leverage calculation in `AdaptiveRiskEngine`**: `finalLeverage = Math.max(1, Math.round(10 * weatherRisk.leverageMultiplier))` — leverage is derived solely from weather risk multiplier and hardcoded to base 10x, ignoring ATR, regime, or user settings.

---

## Python Quant Engine Notes

1. **Startup refuses registration if CNN or PPO DEGRADED**: This is correct safety behavior, but the server then stays in `WAITING_FOR_QUANT` indefinitely, blocking auto-trading entirely. There is no timeout or fallback to degraded mode for the server.

2. **[FIXED]** **`/health/governance` TypeError**: Changed to `model_health_detailed()` + added `isinstance` guards; no longer raises 500.

3. **[FIXED]** **Duplicate logging setup** (lines 25-26 and 378-379): Removed the second `logging.basicConfig()` and `logger =` from mid-file.

4. **[FIXED]** **`/health` route duplicated** (lines 90 and 394): Removed the second `@app.get("/health")` / `health_check` stub.

5. **`DynamicZScoreEngine.evaluate_spread` always returns z_score=0**: The spread history is appended but the actual Z-score formula (`(x - mean) / std`) is never computed. This is a stub.

6. **No authentication on any quant engine endpoint**: The FastAPI app has no API key or token verification. Any process that can reach the port can call `/predict/ppo-execution` or `/predict/cnn` and get model inferences.

7. **Model checkpoints not version-pinned**: `cnn_predictor.py`, `ppo_execution_agent.py` load from a path without version locking — a re-train can silently replace the checkpoint with an incompatible model.
