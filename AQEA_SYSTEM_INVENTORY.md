# AQEA SYSTEM INVENTORY

## ═══════════════════════════════════════════════
## UI PAGES (client/src/pages)
## ═══════════════════════════════════════════════

| PAGE | ROUTE | STATUS | EVIDENCE |
| :--- | :--- | :--- | :--- |
| HomePage | `/` | ACTIVE | `App.tsx:73` |
| Dashboard | `/aqea` | ACTIVE | `App.tsx:74` |
| InstitutionalCommandCenter | `/institutional` | ACTIVE | `App.tsx:100` |
| AIObservability | `/institutional/ai` | ACTIVE | `App.tsx:102` |
| TradeAttribution | `/institutional/attribution` | ACTIVE | `App.tsx:103` |
| RiskCenterV8 | `/aqea/risk-center` | ACTIVE | `App.tsx:84` |
| WalletCenter | `/aqea/wallet` | ACTIVE | `App.tsx:85` |
| PnLCenter | `/aqea/pnl` | ACTIVE | `App.tsx:86` |
| BacktestPage | `/backtest` | ACTIVE | `App.tsx:109` |
| SettingsPage | `/settings` | ACTIVE | `App.tsx:110` |
| PaperTradingMonitor | `/institutional/paper` | ACTIVE | `App.tsx:105` |
| SymbolIntelligencePage | `/aqea/intelligence` | ACTIVE | `App.tsx:92` |
| StrategyAI | `/aqea/strategy` | ACTIVE | `App.tsx:83` |
| SystemHealth | `/aqea/health` | ACTIVE | `App.tsx:89` |
| AIMatrix | `/aqea/ai` | ACTIVE | `App.tsx:93` |

## ═══════════════════════════════════════════════
## BACKEND ROUTES (server/src/routes)
## ═══════════════════════════════════════════════

| ROUTE | STATUS | EVIDENCE |
| :--- | :--- | :--- |
| `/auth` | ACTIVE | `index.ts:133` |
| `/settings` | ACTIVE | `index.ts:134` |
| `/apikeys` | ACTIVE | `index.ts:135` |
| `/trading` | ACTIVE | `index.ts:136` |
| `/backtest` | ACTIVE | `index.ts:137` |
| `/agent` | ACTIVE | `index.ts:138` |
| `/wallet` | ACTIVE | `index.ts:139` |
| `/models` | ACTIVE | `index.ts:140` |
| `/production` | ACTIVE | `index.ts:141` |
| `/institutional` | ACTIVE | `index.ts:142` |
| `/platform` | ACTIVE | `index.ts:143` |
| `/aqea-ui` | ACTIVE | `index.ts:144` |
| `/aqea-governance` | ACTIVE | `index.ts:145` |
| `/aqea-attribution` | ACTIVE | `index.ts:146` |
| `/ai-timeline` | ACTIVE | `index.ts:147` |

## ═══════════════════════════════════════════════
## SERVICES (server/src/services)
## ═══════════════════════════════════════════════

| SERVICE | STATUS | DESCRIPTION | EVIDENCE |
| :--- | :--- | :--- | :--- |
| autoTradeEngine | ACTIVE | Main trading loop and scheduler | `index.ts:257` |
| binanceService | ACTIVE | Binance API (REST + WS) integration | `index.ts:219` |
| paperState | ACTIVE | In-memory position and wallet tracking | `index.ts:237` |
| weatherIntelligenceEngine | ACTIVE | Weather alpha and mining stress | `index.ts:254` |
| minerImpactEngine | ACTIVE | Calculates miner pressure and weather alpha | `autoTradeEngine.ts:167` |
| adaptiveRiskEngine | ACTIVE | Dynamic risk profiling based on regime | `autoTradeEngine.ts:275` |
| tradeQualityEngine | ACTIVE | Trade entry scoring and filtering | `autoTradeEngine.ts:266` |
| regimeDetectionEngine | ACTIVE | Market regime identification | `autoTradeEngine.ts:262` |
| portfolioHeatEngine | ACTIVE | Heat-based position enforcement | `autoTradeEngine.ts:217` |
| aqea/engine | ACTIVE | AQEA Core Decision authority | `autoTradeEngine.ts:295` |
| aqea/riskEngine | ACTIVE | Risk guard for AQEA decisions | `autoTradeEngine.ts:314` |
| aqea/shadowSimulator | ACTIVE | Shadow validation trading logic | `autoTradeEngine.ts:319` |
| rlModelService | UNUSED | Local RL exit model (Simulated) | No imports found in `.ts` files |

## ═══════════════════════════════════════════════
## AI MODELS
## ═══════════════════════════════════════════════

| MODEL | STATUS | DESCRIPTION | EVIDENCE |
| :--- | :--- | :--- | :--- |
| CNN | ACTIVE | Convolutional Neural Network for directional bias | `PredictorRegistry.ts:32` |
| PPO | ACTIVE | Proximal Policy Optimization for execution | `PredictorRegistry.ts:33` |
| TRANSFORMER | ACTIVE | Attention-based sequence predictor | `PredictorRegistry.ts:35` |
| MAMBA | PARTIALLY_CONNECTED | State Space Model (Research) | `PredictorRegistry.ts:34` (Unhealthy) |
| LSTM | STUB | Legacy recurrent model | `PredictorRegistry.ts:26` |
| XLSTM | STUB | Extended LSTM | `PredictorRegistry.ts:26` |
| PATCHTST | UNUSED | Time-series transformer | `modelRegistry.ts:175` |
| TIMESFM | UNUSED | Google Foundation model | `modelRegistry.ts:193` |

## ═══════════════════════════════════════════════
## WEBSOCKET SERVICES
## ═══════════════════════════════════════════════

| SERVICE | STATUS | DESCRIPTION | EVIDENCE |
| :--- | :--- | :--- | :--- |
| socketService | ACTIVE | Manages client Socket.io connections | `index.ts:156` |
| binanceService (WS) | ACTIVE | Subscribes to Binance live price feeds | `index.ts:174` |

## ═══════════════════════════════════════════════
## DATABASE MODELS (MongoDB)
## ═══════════════════════════════════════════════

| MODEL | STATUS | DESCRIPTION | EVIDENCE |
| :--- | :--- | :--- | :--- |
| User | ACTIVE | User account data | `models/User.ts` |
| Settings | ACTIVE | Risk and behavioral weights | `models/Settings.ts` |
| Trade | ACTIVE | Trade lifecycle and audit | `models/Trade.ts` |
| ApiKeys | ACTIVE | Encrypted Binance API keys | `models/ApiKeys.ts` |
| Alert | ACTIVE | System alerts and decision logs | `models/Alert.ts` |
| AIDecision | ACTIVE | AI decision history for timeline | `models/AIDecision.ts` |
| AqeaAudit | ACTIVE | Governance and audit logs | `models/AqeaAudit.ts` |
