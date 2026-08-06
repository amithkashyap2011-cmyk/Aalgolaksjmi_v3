# AQEA EXECUTION GRAPH (V1)

## 1. CNN Subsystem
**Request Flow:**
`server/src/services/autoTradeEngine.ts` (handleLong/handleShort)
→ `server/src/services/aqea/engine.ts` (decide)
→ `server/src/services/aqea/ai/PredictorRegistry.ts`
→ `server/src/services/aqea/ai/CNNPredictor.ts` (runInference)
→ `quant_engine/main.py` (@app.post("/predict/cnn"))
→ `quant_engine/cnn_predictor.py` (predict)
→ **MODEL**: `quant_engine/models/cnn/checkpoints/cnn_1d_v1.pt`

## 2. PPO Subsystem
**Request Flow:**
`server/src/services/autoTradeEngine.ts`
→ `server/src/services/aqea/engine.ts`
→ `server/src/services/aqea/ai/PredictorRegistry.ts`
→ `server/src/services/aqea/ai/PPOExecutionPredictor.ts` (runInference)
→ `quant_engine/main.py` (@app.post("/predict/ppo-execution"))
→ `quant_engine/ppo_execution_agent.py` (select_action)
→ **MODEL**: `quant_engine/models/ppo/checkpoints/ppo_execution_v1.pt`

## 3. Telemetry Subsystem
**Process Flow:**
`server/src/index.ts` (setInterval 300000ms)
→ `server/src/services/aqea/aiTelemetryService.ts` (resolvePendingOutcomes)
→ `AIPredictionTelemetry.find` (MongoDB)
→ `server/src/services/binanceService.ts` (getKlines)
→ `AIPredictionTelemetry.updateOne` (MongoDB)

## 4. Autotrade Subsystem
**Process Flow:**
`server/src/index.ts`
→ `server/src/services/autoTradeEngine.ts` (start/tick)
→ `server/src/services/autoTradeEngine.ts` (processUser)
→ `server/src/services/autoTradeEngine.ts` (processSymbol)
→ `server/src/services/aqea/engine.ts` (decide)
→ `server/src/services/autoTradeEngine.ts` (handleLong/handleShort)
→ `server/src/services/binanceService.ts` (placeOrder)
