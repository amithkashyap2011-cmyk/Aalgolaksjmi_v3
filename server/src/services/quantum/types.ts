/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Core Type Definitions
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

/* ───────── Market Data Types ───────── */

export interface OHLCV {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  exchange: string;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
}

export interface TickerData {
  symbol: string;
  price: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface FundingRateData {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  markPrice: number;
  indexPrice: number;
  nextFundingTime: number;
}

export interface OpenInterestData {
  symbol: string;
  openInterest: number;
  openInterestValue: number;
  timestamp: number;
}

export interface LiquidationEvent {
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  timestamp: number;
  exchange: string;
}

/* ───────── Market Regime Types ───────── */

export type MarketRegime =
  | "STRONG_BULL"
  | "BULL"
  | "SIDEWAYS"
  | "BEAR"
  | "STRONG_BEAR"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "CORRELATION_SHOCK";

export type TimeHorizon = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

export const ALL_TIME_HORIZONS: TimeHorizon[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

/* ───────── Agent Types ───────── */

export interface QuantumAgent {
  name: string;
  priority: number;              // Execution order
  evaluate(ctx: AgentContext): Promise<AgentSignal>;
  getHealth(): AgentHealth;
  canVeto(): boolean;            // Risk/Regime agents can veto
}

export interface AgentSignal {
  agentName: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;        // 0-1
  strength: number;          // -1 to +1
  timeHorizon: TimeHorizon;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface AgentHealth {
  name: string;
  status: "HEALTHY" | "DEGRADED" | "OFFLINE";
  lastEvaluation: number;
  latencyMs: number;
  errorRate: number;        // errors / total evaluations
  uptime: number;           // seconds since last restart
}

export interface AgentContext {
  symbol: string;
  exchange: string;
  userId: string;
  bars: OHLCV[];
  currentPrice: number;
  regime: MarketRegime;
  indicators: IndicatorSet;
  orderBook?: OrderBookSnapshot;
  fundingRate?: FundingRateData;
  openInterest?: OpenInterestData;
  recentLiquidations?: LiquidationEvent[];
  portfolioState: PortfolioState;
  timestamp: number;
}

/* ───────── Indicator Types ───────── */

export interface IndicatorSet {
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  atr14: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  stdDev20: number | null;
  vwap: number | null;
  obv: number | null;
  adx14: number | null;
  volumeRatio: number | null;
  hurstExponent: number | null;
  close: number | null;
}

/* ───────── Forecast Types ───────── */

export interface Forecast {
  timeframe: TimeHorizon;
  longProbability: number;
  shortProbability: number;
  confidence: number;
  expectedReturn: number;
  expectedDrawdown: number;
  regime: MarketRegime;
  modelContributions: ModelContribution[];
}

export interface ModelContribution {
  modelName: string;
  weight: number;
  longProbability: number;
  shortProbability: number;
  confidence: number;
}

/* ───────── Order Book Intelligence Types ───────── */

export interface OrderBookIntelligence {
  symbol: string;
  timestamp: number;
  bidAskImbalance: number;           // -1 to +1 (positive = bid-heavy)
  spreadBps: number;                  // basis points
  spoofingDetected: boolean;
  spoofingDetails: SpoofingEvent[];
  liquidityWalls: LiquidityWall[];
  stopHuntZones: StopHuntZone[];
  absorptionDetected: boolean;
  absorptionSide: "BID" | "ASK" | "NONE";
  icebergOrders: IcebergDetection[];
  marketPressure: number;             // -1 to +1
  depthScore: number;                 // 0-100
}

export interface SpoofingEvent {
  side: "BID" | "ASK";
  priceLevel: number;
  quantity: number;
  appearances: number;
  avgDurationMs: number;
}

export interface LiquidityWall {
  side: "BID" | "ASK";
  priceLevel: number;
  quantity: number;
  sigmaAboveMean: number;
  distanceFromMidPct: number;
}

export interface StopHuntZone {
  priceLevel: number;
  estimatedStopVolume: number;
  keyLevel: "SUPPORT" | "RESISTANCE" | "ROUND_NUMBER";
  distanceFromCurrentPct: number;
}

export interface IcebergDetection {
  side: "BID" | "ASK";
  priceLevel: number;
  visibleQuantity: number;
  estimatedTotalQuantity: number;
  fillCount: number;
}

/* ───────── Funding Rate Engine Types ───────── */

export interface FundingRateAnalysis {
  symbol: string;
  currentRate: number;
  predictedNextRate: number;
  crowdPositioning: number;          // -1 (extreme short) to +1 (extreme long)
  longSqueezeProb: number;
  shortSqueezeProb: number;
  arbOpportunity: FundingArbOpportunity | null;
  historicalPercentile: number;      // Current rate as percentile of last 30 days
  timestamp: number;
}

export interface FundingArbOpportunity {
  type: "CASH_AND_CARRY" | "REVERSE_CASH_AND_CARRY";
  expectedAnnualizedReturn: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  requiredCapital: number;
  description: string;
}

/* ───────── Liquidation Intelligence Types ───────── */

export interface LiquidationIntelligence {
  symbol: string;
  timestamp: number;
  cascadeRiskScore: number;           // 0-100
  nearestLongLiquidations: LiquidationCluster[];
  nearestShortLiquidations: LiquidationCluster[];
  recentCascadeDetected: boolean;
  forcedSellingPressure: number;      // 0-1
  forcedBuyingPressure: number;       // 0-1
  recoveryPhase: boolean;
}

export interface LiquidationCluster {
  priceLevel: number;
  estimatedVolume: number;
  distanceFromCurrentPct: number;
  leverage: number;                   // Estimated average leverage
}

/* ───────── Portfolio Types ───────── */

export interface PortfolioState {
  totalEquity: number;
  availableBalance: number;
  unrealizedPnl: number;
  positions: PortfolioPosition[];
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  maxDrawdownToday: number;
  maxDrawdownWeek: number;
  maxDrawdownMonth: number;
  correlationMatrix: Record<string, Record<string, number>>;
}

export interface PortfolioPosition {
  symbol: string;
  exchange: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openTime: number;
}

/* ───────── Risk Engine Types ───────── */

export interface RiskAssessment {
  approved: boolean;
  reason: string;
  kellyFraction: number;
  recommendedSizePct: number;
  maxPositionSize: number;
  valueAtRisk95: number;
  conditionalVaR95: number;
  dynamicSLPct: number;
  dynamicTPPct: number;
  volatilityScaledSize: number;
  emergencyShutdownActive: boolean;
  correlatedExposurePct: number;
  trailingSLConfig: TrailingSLConfig | null;
  riskFlags: RiskFlag[];
}

export interface TrailingSLConfig {
  activationPct: number;        // Activate after this % profit
  trailDistancePct: number;     // Trail at this distance
  stepSizePct: number;          // Minimum step for trail adjustment
}

export interface RiskFlag {
  type: "WARNING" | "CRITICAL";
  code: string;
  message: string;
}

/* ───────── Execution Types ───────── */

export type ExecutionStrategy = "MARKET" | "TWAP" | "VWAP" | "ICEBERG" | "LIMIT";

export interface ExecutionPlan {
  strategy: ExecutionStrategy;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  totalQuantity: number;
  sliceCount: number;
  sliceIntervalMs: number;
  limitPrice: number | null;
  maxSlippageBps: number;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";
}

/* ───────── Alpha Discovery Types ───────── */

export interface AlphaSignal {
  name: string;
  type: "INDICATOR" | "PATTERN" | "REGIME_SHIFT" | "ARBITRAGE";
  strength: number;
  confidence: number;
  discoveredAt: number;
  validationMetrics: {
    oosSharp: number;
    profitFactor: number;
    tradeCount: number;
    correlationToExisting: number;
  };
}

/* ───────── Knowledge System Types ───────── */

export interface TradeMemory {
  tradeId: string;
  symbol: string;
  entryContext: AgentContext;
  exitContext: AgentContext | null;
  action: "LONG" | "SHORT";
  outcome: "WIN" | "LOSS" | "OPEN";
  pnlPct: number;
  regime: MarketRegime;
  agentSignals: AgentSignal[];
  embedding?: number[];
  timestamp: number;
}

export interface MarketEventMemory {
  eventId: string;
  type: "NEWS" | "WHALE_MOVE" | "LIQUIDATION_CASCADE" | "FUNDING_SPIKE" | "REGIME_CHANGE";
  description: string;
  impact: number;           // -1 to +1
  affectedSymbols: string[];
  timestamp: number;
  embedding?: number[];
}

/* ───────── MoE (Mixture of Experts) Gate Types ───────── */

export interface MoEWeights {
  regime: MarketRegime;
  weights: Record<string, number>;   // agentName → weight
  lastUpdated: number;
  performanceBasis: "ROLLING_30D" | "REGIME_SPECIFIC" | "DEFAULT";
}

/* ───────── Orchestrator Output ───────── */

export interface QuantumDecision {
  symbol: string;
  exchange: string;
  timestamp: number;
  
  // Final decision
  action: "LONG" | "SHORT" | "CLOSE" | "SCALE_IN" | "PARTIAL_EXIT" | "HOLD";
  confidence: number;
  
  // Context
  regime: MarketRegime;
  forecasts: Forecast[];
  
  // Execution plan
  executionPlan: ExecutionPlan | null;
  
  // Risk
  riskAssessment: RiskAssessment;
  
  // Agent contributions
  agentSignals: AgentSignal[];
  moeWeights: MoEWeights;
  
  // Intelligence
  orderBookIntel: OrderBookIntelligence | null;
  fundingAnalysis: FundingRateAnalysis | null;
  liquidationIntel: LiquidationIntelligence | null;
  
  // Audit
  decisionReason: string;
  decisionHash: string;         // SHA-256 of all inputs for audit trail
}

/* ───────── Exchange Adapter Interface ───────── */

export interface ExchangeAdapter {
  name: string;
  isConnected: boolean;
  
  // Market Data
  getKlines(symbol: string, interval: string, limit?: number): Promise<OHLCV[]>;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBookSnapshot>;
  getTicker(symbol: string): Promise<TickerData>;
  getTickerPrice(symbol: string): Promise<number>;
  getFundingRate(symbol: string): Promise<FundingRateData>;
  getOpenInterest(symbol: string): Promise<OpenInterestData>;
  getLiquidations(symbol: string, limit?: number): Promise<LiquidationEvent[]>;
  
  // Trading
  placeOrder(order: OrderRequest): Promise<OrderResult>;
  cancelOrder(symbol: string, orderId: string): Promise<boolean>;
  getOpenOrders(symbol: string): Promise<OrderResult[]>;
  getAccountBalance(): Promise<AccountBalance>;
  
  // WebSocket
  subscribeToTrades(symbol: string, callback: (trade: TradeEvent) => void): void;
  subscribeToOrderBook(symbol: string, callback: (snapshot: OrderBookSnapshot) => void): void;
  unsubscribeAll(): void;
  
  // Health
  isHealthy(): Promise<boolean>;
  getLatencyMs(): number;
}

export interface OrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP_MARKET" | "STOP_LIMIT" | "TAKE_PROFIT_MARKET";
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: "GTC" | "IOC" | "FOK";
  reduceOnly?: boolean;
  leverage?: number;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  quantity: number;
  price: number;
  status: "NEW" | "FILLED" | "PARTIALLY_FILLED" | "CANCELLED" | "REJECTED";
  filledQuantity: number;
  avgFillPrice: number;
  timestamp: number;
  exchange: string;
}

export interface AccountBalance {
  totalBalance: number;
  availableBalance: number;
  unrealizedPnl: number;
  assets: Record<string, { free: number; locked: number }>;
}

export interface TradeEvent {
  symbol: string;
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
  timestamp: number;
  isMaker: boolean;
}
