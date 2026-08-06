# AQEA FAILURE GRAPH (V13)

## FAILURE: Port Discovery Failure
- **Trigger**: Server started from `/server` or `/` instead of project root.
- **Component**: `serviceDiscovery.ts`
- **Dependency**: `process.cwd()`
- **Root Cause**: **[RC-001] Fragile Path Resolution Architecture** (Reliance on execution context instead of project root anchor).

## FAILURE: Heartbeat Failure / Registration Dropout
- **Trigger**: Quant Engine restarts on a new dynamic port.
- **Component**: `SystemManager.ts` / `registry_client.py`
- **Dependency**: `port.json` (filesystem) vs HTTP Registration.
- **Root Cause**: **[RC-002] Multi-Master Port Synchronization Conflict** (Dual-mode discovery: disk file vs active registration without collision resolution).

## FAILURE: PPO Inference Crash (Shape Mismatch)
- **Trigger**: Stale client code sends feature vector.
- **Component**: `PPOExecutionPredictor.ts` → `main.py` → `ppo_execution_agent.py`
- **Dependency**: Hardcoded `state_dim=32` (Python) vs `while < 30` (Legacy JS/TS).
- **Root Cause**: **[RC-003] Distributed Schema Fragmentation** (No cross-language source of truth for AI feature contracts).

## FAILURE: CNN Quality Gate False Positives
- **Trigger**: Model checkpoint missing but process running.
- **Component**: `PredictorRegistry.ts` / `CNNPredictor.ts`
- **Dependency**: `isHealthy` check conflating "process up" with "weights loaded".
- **Root Cause**: **[RC-004] Degraded Readiness Obfuscation** (Functional health check does not account for model weight validity).

## FAILURE: Telemetry Gaps / Unresolved Outcomes
- **Trigger**: Binance API timeout or transient network error during resolution.
- **Component**: `aiTelemetryService.ts`
- **Dependency**: One-shot resolution loop without stateful retry or persistence of "Pending" state.
- **Root Cause**: **[RC-005] Transient-Blind Telemetry Pipeline** (Lack of robust outcome resolution state machine).

## FAILURE: PredictorRegistry / Import Failures
- **Trigger**: Incremental refactoring (v2.0, v8.0, v12.0).
- **Component**: `ensembleService.ts` / `PredictorRegistry.ts`
- **Dependency**: Duplicate files in `services/`, `services/aqea/ai/`, `services/aqea/v2_research/`.
- **Root Cause**: **[RC-006] Structural Implementation Drift** (Uncontrolled directory sprawl and lack of directory-level encapsulation).

## FAILURE: Binance API "NaN" Trades
- **Trigger**: Division by zero or null price on trade initialization.
- **Component**: `autoTradeEngine.ts`
- **Dependency**: Trusting upstream `Decision` object without boundary validation.
- **Root Cause**: **[RC-007] Permeable Financial Safety Boundary** (Lack of strict numeric invariants at the persistence/execution layer).

## FAILURE: Governance Server Offline
- **Trigger**: Port 9991 collision or server failure.
- **Component**: `index.ts`
- **Dependency**: Hardcoded port 9991.
- **Root Cause**: **[RC-008] Hardcoded Infrastructure Binding** (Lack of dynamic port orchestration for internal governance services).
