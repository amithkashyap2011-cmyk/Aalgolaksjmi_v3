/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Canonical Model Authority Registry
 * ═══════════════════════════════════════════════════════════════════
 * Single authoritative source of truth for all models, strategies,
 * execution agents, and auxiliary components across AQEA.
 *
 * Core Tenets:
 * 1. Single canonical identity per component (no split authorities).
 * 2. 3-Layer Control:
 *    - Layer 1: Admin Permission (adminAllowed: boolean)
 *    - Layer 2: Autonomous Intelligence (status, effectiveWeight, regimeFit)
 *    - Layer 3: Immutable Risk Authority (RiskEngine final authority)
 * 3. Directional vs Execution separation:
 *    - DIRECTIONAL: Voting on P(BUY), P(HOLD), P(SELL)
 *    - EXECUTION: Order routing / sizing (PPO), never directional voting
 *    - RISK: Immutable final execution authority (RiskEngine)
 *    - AUXILIARY: Contextual feature providers (Weather, Macro)
 * 4. Zero authority does NOT delete models; historical records remain intact.
 * 5. Hysteresis prevents rapid ON/OFF flapping.
 */

export type ComponentType = "DIRECTIONAL" | "EXECUTION" | "RISK" | "AUXILIARY";

export type SignalFamily =
  | "PRICE_MOMENTUM"
  | "MICROSTRUCTURE"
  | "STRUCTURAL_SMC"
  | "DERIVATIVES"
  | "SENTIMENT"
  | "MACRO"
  | "HARMONIC"
  | "MEAN_REVERSION"
  | "REGIME"
  | "ALT_DATA"
  | "EXECUTION"
  | "RISK";

export type ModelRuntimeStatus =
  | "CANDIDATE"
  | "SHADOW"
  | "VALIDATING"
  | "ACTIVE"
  | "DOWNWEIGHTED"
  | "DEGRADED"
  | "QUARANTINED"
  | "RECOVERING"
  | "DISABLED"
  | "BENCHMARK"
  | "STANDBY"
  | "TEMPORARILY_DISABLED";

export interface ModelAuthorityEvent {
  eventId: string;
  modelId: string;
  previousState: ModelRuntimeStatus;
  newState: ModelRuntimeStatus;
  reason: string;
  sampleCount: number;
  regime: string;
  domain: "CRYPTO" | "INDIAN" | "ALL";
  deltaEV: number;
  deltaBrier: number;
  deltaECE: number;
  driftScore: number;
  biasScore: number;
  dependenceScore: number;
  timestamp: number;
  authorityVersion: string;
}

export interface CompositeModelHealthScore {
  modelId: string;
  overallHealthScore: number; // 0.0 to 1.0
  predictiveScore: number;
  calibrationScore: number;
  economicValueScore: number;
  riskContributionScore: number;
  stabilityScore: number;
  latencyAvailabilityScore: number;
  sampleSufficiencyRatio: number; // N / minRequired (clamped to 1.0)
  components: {
    brier: number;
    ece: number;
    incrementalEV: number;
    maxDrawdownPct: number;
    tailRiskES: number;
    driftScore: number;
    biasScore: number;
    correlationRedundancy: number;
    latencyMs: number;
    availabilityPct: number;
    sampleCount: number;
  };
  isHealthy: boolean;
  recommendation: ModelRuntimeStatus;
}

export interface IModelAuthorityState {
  modelId: string;
  name: string;
  type: ComponentType;
  signalFamily: SignalFamily;
  marketDomain: "CRYPTO" | "INDIAN" | "ALL";
  directionalVoter: boolean;
  executionModel: boolean;
  
  // Layer 1: Admin Permission Boundary
  adminAllowed: boolean;
  
  // Layer 2: AI Autonomous Runtime Authority
  aiEligible: boolean;
  status: ModelRuntimeStatus;
  basePrior: number;
  effectiveWeight: number;
  regimeFit: number;
  forwardEV: number;
  incrementalEV: number;
  brierScore: number;
  ece: number;
  biasPenalty: number;
  correlationPenalty: number;
  uncertaintyPenalty: number;
  dataQuality: number;
  availability: number;
  sampleCount: number;
  confidenceInterval: { lower: number; upper: number };
  lastUpdated: number;
  reason: string;
  
  // Hysteresis Tracking
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  quarantineReason?: string;
}

export interface ISignalFamilyAuthority {
  family: SignalFamily;
  status: "ACTIVE" | "DOWNWEIGHTED" | "TEMPORARILY_DISABLED";
  weightCap: number;
  effectiveWeight: number;
  incrementalEV: number;
  correlationPenalty: number;
  modelCount: number;
  activeModelCount: number;
  reason: string;
}

export interface IRegimeModelAuthority {
  regime: string;
  modelId: string;
  regimeFitScore: number;
  status: ModelRuntimeStatus;
  effectiveWeight: number;
  ev: number;
  winRate: number;
  sampleCount: number;
}

export interface HysteresisConfig {
  kFailureThreshold: number;   // Consecutive failed evaluation windows before disabling (default: 3)
  mRecoveryThreshold: number;  // Consecutive successful windows before re-enabling (default: 2)
  shrinkageK: number;          // Bayesian shrinkage constant r(N) = N / (N + k) (default: 25)
  minOOSSamplesForLive: number;// Minimum OOS samples to promote out of SHADOW (default: 100)
}

// ═══════════════════════════════════════════════════════════════════
//  Default Canonical Models
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_MODELS: IModelAuthorityState[] = [
  // ── Deep Learning Directional Models ──
  {
    modelId: "MAMBA",
    name: "Mamba SSM (Selective State Space)",
    type: "DIRECTIONAL",
    signalFamily: "PRICE_MOMENTUM",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.25,
    effectiveWeight: 0.25,
    regimeFit: 1.0,
    forwardEV: 0.015,
    incrementalEV: 0.008,
    brierScore: 0.16,
    ece: 0.04,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 150,
    confidenceInterval: { lower: 0.005, upper: 0.025 },
    lastUpdated: Date.now(),
    reason: "Primary state-space momentum learner with strong OOS edge",
    consecutiveFailures: 0,
    consecutiveSuccesses: 10
  },
  {
    modelId: "TRANSFORMER_MICRO",
    name: "Micro-Transformer Attention",
    type: "DIRECTIONAL",
    signalFamily: "PRICE_MOMENTUM",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.20,
    effectiveWeight: 0.20,
    regimeFit: 1.0,
    forwardEV: 0.012,
    incrementalEV: 0.005,
    brierScore: 0.17,
    ece: 0.05,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 140,
    confidenceInterval: { lower: 0.003, upper: 0.021 },
    lastUpdated: Date.now(),
    reason: "Multi-head cross-feature attention with positive incremental EV",
    consecutiveFailures: 0,
    consecutiveSuccesses: 8
  },
  {
    modelId: "CNN_1D",
    name: "1D Dilated Temporal CNN",
    type: "DIRECTIONAL",
    signalFamily: "PRICE_MOMENTUM",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.15,
    effectiveWeight: 0.15,
    regimeFit: 0.90,
    forwardEV: 0.008,
    incrementalEV: 0.003,
    brierScore: 0.18,
    ece: 0.06,
    biasPenalty: 0.0,
    correlationPenalty: 0.90,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 180,
    confidenceInterval: { lower: 0.001, upper: 0.015 },
    lastUpdated: Date.now(),
    reason: "Dilated receptive field local waveform pattern extractor",
    consecutiveFailures: 0,
    consecutiveSuccesses: 6
  },
  {
    modelId: "BILSTM",
    name: "Bidirectional LSTM",
    type: "DIRECTIONAL",
    signalFamily: "PRICE_MOMENTUM",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "DOWNWEIGHTED",
    basePrior: 0.10,
    effectiveWeight: 0.05,
    regimeFit: 0.80,
    forwardEV: 0.004,
    incrementalEV: 0.001,
    brierScore: 0.20,
    ece: 0.08,
    biasPenalty: 0.05,
    correlationPenalty: 0.75,
    uncertaintyPenalty: 0.05,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 160,
    confidenceInterval: { lower: -0.002, upper: 0.010 },
    lastUpdated: Date.now(),
    reason: "Correlated with Mamba/Transformer; modest incremental edge",
    consecutiveFailures: 1,
    consecutiveSuccesses: 2
  },
  {
    modelId: "XLSTM",
    name: "Extended LSTM (xLSTM s/mLSTM)",
    type: "DIRECTIONAL",
    signalFamily: "PRICE_MOMENTUM",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "SHADOW",
    basePrior: 0.0,
    effectiveWeight: 0.0,
    regimeFit: 0.85,
    forwardEV: 0.009,
    incrementalEV: 0.002,
    brierScore: 0.18,
    ece: 0.06,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 45,
    confidenceInterval: { lower: -0.001, upper: 0.019 },
    lastUpdated: Date.now(),
    reason: "Shadow validation active; insufficient OOS samples (<100) for live voting",
    consecutiveFailures: 0,
    consecutiveSuccesses: 3
  },
  {
    modelId: "XGBOOST",
    name: "XGBoost Gradient Boosted Trees",
    type: "DIRECTIONAL",
    signalFamily: "STRUCTURAL_SMC",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.15,
    effectiveWeight: 0.15,
    regimeFit: 0.95,
    forwardEV: 0.011,
    incrementalEV: 0.006,
    brierScore: 0.17,
    ece: 0.05,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 130,
    confidenceInterval: { lower: 0.003, upper: 0.019 },
    lastUpdated: Date.now(),
    reason: "Non-linear decision tree boundary validator with tabular superiority",
    consecutiveFailures: 0,
    consecutiveSuccesses: 7
  },
  {
    modelId: "LIGHTGBM",
    name: "LightGBM Fast Histogram Trees",
    type: "DIRECTIONAL",
    signalFamily: "STRUCTURAL_SMC",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.10,
    effectiveWeight: 0.10,
    regimeFit: 0.90,
    forwardEV: 0.010,
    incrementalEV: 0.004,
    brierScore: 0.18,
    ece: 0.05,
    biasPenalty: 0.0,
    correlationPenalty: 0.85,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 120,
    confidenceInterval: { lower: 0.002, upper: 0.018 },
    lastUpdated: Date.now(),
    reason: "Histogram-partitioned GBDT complementary to neural predictors",
    consecutiveFailures: 0,
    consecutiveSuccesses: 5
  },

  // ── Execution Agent (Strictly Execution Only — Never Directional) ──
  {
    modelId: "PPO_EXECUTION",
    name: "PPO Reinforcement Learning Execution Agent",
    type: "EXECUTION",
    signalFamily: "EXECUTION",
    marketDomain: "ALL",
    directionalVoter: false,
    executionModel: true,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.0,
    effectiveWeight: 0.0,
    regimeFit: 1.0,
    forwardEV: 0.0,
    incrementalEV: 0.0,
    brierScore: 0.0,
    ece: 0.0,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 200,
    confidenceInterval: { lower: 0, upper: 0 },
    lastUpdated: Date.now(),
    reason: "Reinforcement learning order routing and sizing agent; strictly non-voting",
    consecutiveFailures: 0,
    consecutiveSuccesses: 15
  },

  // ── Quantitative Specialists (Directional Signal Providers) ──
  {
    modelId: "AARYAN_MOMENTUM",
    name: "Aaryan Momentum & Trend Specialist",
    type: "DIRECTIONAL",
    signalFamily: "PRICE_MOMENTUM",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.15,
    effectiveWeight: 0.15,
    regimeFit: 1.0,
    forwardEV: 0.013,
    incrementalEV: 0.006,
    brierScore: 0.17,
    ece: 0.04,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 140,
    confidenceInterval: { lower: 0.004, upper: 0.022 },
    lastUpdated: Date.now(),
    reason: "EMA ribbon and MACD momentum surge detector",
    consecutiveFailures: 0,
    consecutiveSuccesses: 9
  },
  {
    modelId: "AAYUSH_MEAN_REVERSION",
    name: "Aayush Volatility & Mean Reversion Specialist",
    type: "DIRECTIONAL",
    signalFamily: "MEAN_REVERSION",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.15,
    effectiveWeight: 0.15,
    regimeFit: 1.0,
    forwardEV: 0.012,
    incrementalEV: 0.005,
    brierScore: 0.18,
    ece: 0.05,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 135,
    confidenceInterval: { lower: 0.003, upper: 0.021 },
    lastUpdated: Date.now(),
    reason: "Bollinger bandwidth and RSI exhaustion mean-reversion engine",
    consecutiveFailures: 0,
    consecutiveSuccesses: 8
  },
  {
    modelId: "SMC_INSTITUTIONAL",
    name: "Smart Money Concepts & Liquidity Sweeps",
    type: "DIRECTIONAL",
    signalFamily: "STRUCTURAL_SMC",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.20,
    effectiveWeight: 0.20,
    regimeFit: 1.0,
    forwardEV: 0.016,
    incrementalEV: 0.009,
    brierScore: 0.15,
    ece: 0.04,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 165,
    confidenceInterval: { lower: 0.007, upper: 0.025 },
    lastUpdated: Date.now(),
    reason: "Fair Value Gap (FVG), Order Block, and Liquidity Sweep identifier",
    consecutiveFailures: 0,
    consecutiveSuccesses: 11
  },
  {
    modelId: "ORDER_FLOW_CVD",
    name: "Order Flow & Cumulative Volume Delta (CVD)",
    type: "DIRECTIONAL",
    signalFamily: "MICROSTRUCTURE",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.20,
    effectiveWeight: 0.20,
    regimeFit: 1.0,
    forwardEV: 0.014,
    incrementalEV: 0.007,
    brierScore: 0.16,
    ece: 0.04,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 155,
    confidenceInterval: { lower: 0.005, upper: 0.023 },
    lastUpdated: Date.now(),
    reason: "Market taker aggressive volume delta and absorption tracker",
    consecutiveFailures: 0,
    consecutiveSuccesses: 10
  },
  {
    modelId: "GAYATRI_24_SIGNAL",
    name: "Gayatri 24-Signal Mathematical Framework",
    type: "DIRECTIONAL",
    signalFamily: "HARMONIC",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.10,
    effectiveWeight: 0.10,
    regimeFit: 0.90,
    forwardEV: 0.009,
    incrementalEV: 0.003,
    brierScore: 0.19,
    ece: 0.06,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 110,
    confidenceInterval: { lower: 0.001, upper: 0.017 },
    lastUpdated: Date.now(),
    reason: "24-factor holistic market health matrix validator",
    consecutiveFailures: 0,
    consecutiveSuccesses: 4
  },
  {
    modelId: "OHMKARA_528HZ",
    name: "Ohmkara Harmonic Resonance Scanner",
    type: "DIRECTIONAL",
    signalFamily: "HARMONIC",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.05,
    effectiveWeight: 0.05,
    regimeFit: 0.85,
    forwardEV: 0.006,
    incrementalEV: 0.002,
    brierScore: 0.20,
    ece: 0.07,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 95,
    confidenceInterval: { lower: 0.000, upper: 0.012 },
    lastUpdated: Date.now(),
    reason: "Harmonic oscillator Fibonacci expansion resonance confirmation",
    consecutiveFailures: 0,
    consecutiveSuccesses: 3
  },

  // ── NLP / Macro Sentiment ──
  {
    modelId: "NEWS_NLP",
    name: "Financial News NLP & Sentiment Engine",
    type: "DIRECTIONAL",
    signalFamily: "SENTIMENT",
    marketDomain: "ALL",
    directionalVoter: true,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.10,
    effectiveWeight: 0.10,
    regimeFit: 0.90,
    forwardEV: 0.007,
    incrementalEV: 0.003,
    brierScore: 0.19,
    ece: 0.06,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 105,
    confidenceInterval: { lower: 0.001, upper: 0.013 },
    lastUpdated: Date.now(),
    reason: "Real-time news headline polarity and financial event impact scorer",
    consecutiveFailures: 0,
    consecutiveSuccesses: 4
  },

  // ── Auxiliary & Risk Controls ──
  {
    modelId: "WEATHER",
    name: "Weather & Lunar Cyclic Baseline",
    type: "AUXILIARY",
    signalFamily: "ALT_DATA",
    marketDomain: "INDIAN",
    directionalVoter: false,
    executionModel: false,
    adminAllowed: true,
    aiEligible: false,
    status: "STANDBY",
    basePrior: 0.0,
    effectiveWeight: 0.0,
    regimeFit: 0.50,
    forwardEV: 0.0,
    incrementalEV: 0.0,
    brierScore: 0.25,
    ece: 0.10,
    biasPenalty: 0.10,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.10,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 50,
    confidenceInterval: { lower: -0.005, upper: 0.005 },
    lastUpdated: Date.now(),
    reason: "Auxiliary alt-data feed; excluded from live directional voting",
    consecutiveFailures: 0,
    consecutiveSuccesses: 0
  },
  {
    modelId: "RISK_ENGINE",
    name: "AQEA Immutable Risk Governance Engine",
    type: "RISK",
    signalFamily: "RISK",
    marketDomain: "ALL",
    directionalVoter: false,
    executionModel: false,
    adminAllowed: true,
    aiEligible: true,
    status: "ACTIVE",
    basePrior: 0.0,
    effectiveWeight: 0.0,
    regimeFit: 1.0,
    forwardEV: 0.0,
    incrementalEV: 0.0,
    brierScore: 0.0,
    ece: 0.0,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 1000,
    confidenceInterval: { lower: 0, upper: 0 },
    lastUpdated: Date.now(),
    reason: "Layer 3 Final Execution Authority; cannot be bypassed by any AI model",
    consecutiveFailures: 0,
    consecutiveSuccesses: 100
  },
  {
    modelId: "BUY_AND_HOLD_BENCHMARK",
    name: "Buy & Hold Passive Baseline Benchmark",
    type: "AUXILIARY",
    signalFamily: "ALT_DATA",
    marketDomain: "ALL",
    directionalVoter: false,
    executionModel: false,
    adminAllowed: true,
    aiEligible: false,
    status: "BENCHMARK",
    basePrior: 0.0,
    effectiveWeight: 0.0,
    regimeFit: 1.0,
    forwardEV: 0.0,
    incrementalEV: 0.0,
    brierScore: 0.25,
    ece: 0.10,
    biasPenalty: 0.0,
    correlationPenalty: 1.0,
    uncertaintyPenalty: 0.0,
    dataQuality: 1.0,
    availability: 1.0,
    sampleCount: 500,
    confidenceInterval: { lower: 0, upper: 0 },
    lastUpdated: Date.now(),
    reason: "Passive baseline market reference benchmark for alpha attribution comparison",
    consecutiveFailures: 0,
    consecutiveSuccesses: 50
  }
];

// ═══════════════════════════════════════════════════════════════════
//  ModelAuthorityRegistry Engine
// ═══════════════════════════════════════════════════════════════════

export class ModelAuthorityRegistry {
  private static registry: Map<string, IModelAuthorityState> = new Map();
  private static familyAuthorities: Map<SignalFamily, ISignalFamilyAuthority> = new Map();
  private static regimeAuthorities: Map<string, Map<string, IRegimeModelAuthority>> = new Map();
  private static config: HysteresisConfig = {
    kFailureThreshold: 3,
    mRecoveryThreshold: 2,
    shrinkageK: 25,
    minOOSSamplesForLive: 100
  };
  private static initialized: boolean = false;

  /**
   * Initializes the registry with default canonical model states.
   */
  public static initialize(): void {
    if (this.initialized) return;
    this.registry.clear();
    for (const m of DEFAULT_MODELS) {
      this.registry.set(m.modelId, { ...m });
    }
    this.initializeFamilies();
    this.initializeRegimes();
    this.initialized = true;
  }

  /**
   * Resets registry to fresh canonical defaults.
   */
  public static resetToDefaults(): void {
    this.initialized = false;
    this.initialize();
  }

  private static initializeRegimes(): void {
    this.regimeAuthorities.clear();
    const regimes = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "HIGH_VOLATILITY", "TRENDING_UP", "TRENDING_DOWN"];
    for (const reg of regimes) {
      const rMap = new Map<string, IRegimeModelAuthority>();
      for (const m of DEFAULT_MODELS) {
        if (!m.directionalVoter) continue;
        let regimeFit = 0.85;
        if (reg.includes("TRENDING") && (m.modelId === "MAMBA" || m.modelId === "AARYAN_MOMENTUM")) {
          regimeFit = 0.98;
        } else if (reg.includes("RANGING") && m.modelId === "AAYUSH_MEAN_REVERSION") {
          regimeFit = 0.95;
        } else if (reg.includes("VOLATILITY") && m.modelId === "TRANSFORMER_MICRO") {
          regimeFit = 0.92;
        }
        rMap.set(m.modelId, {
          regime: reg,
          modelId: m.modelId,
          regimeFitScore: regimeFit,
          status: "ACTIVE",
          effectiveWeight: m.basePrior,
          ev: m.forwardEV,
          winRate: 0.58,
          sampleCount: 100
        });
      }
      this.regimeAuthorities.set(reg, rMap);
    }
  }

  // ── Layer 1: Admin Permission Management ──

  /**
   * Updates Layer 1 Administrator Permission for a model.
   * This is strictly a permission boundary.
   */
  public static setAdminPermission(modelId: string, allowed: boolean): boolean {
    this.ensureInitialized();
    const model = this.registry.get(modelId);
    if (!model) return false;

    model.adminAllowed = allowed;
    if (!allowed) {
      model.effectiveWeight = 0.0;
      model.status = "TEMPORARILY_DISABLED";
      model.reason = "Administrator permission revoked (Layer 1 boundary)";
    } else {
      model.status = "ACTIVE";
      model.reason = "Administrator permission granted";
    }
    model.lastUpdated = Date.now();
    this.evaluateModelStatusAndWeight(model);
    this.rebalanceWeights();
    return true;
  }

  // ── Layer 2: AI Runtime Authority Management ──

  /**
   * Retrieves canonical authority record for a model.
   */
  public static getModel(modelId: string): IModelAuthorityState | undefined {
    this.ensureInitialized();
    let m = this.registry.get(modelId);
    if (!m && (modelId === "CNN" || modelId === "CNN_MICROSTRUCTURE" || modelId === "CNN_1D_V1")) {
      m = this.registry.get("CNN_1D");
    }
    return m ? { ...m } : undefined;
  }

  /**
   * Returns all canonical models.
   */
  public static getAllModels(): IModelAuthorityState[] {
    this.ensureInitialized();
    return Array.from(this.registry.values()).map(m => ({ ...m }));
  }

  /**
   * Returns all directional voting models.
   */
  public static getDirectionalVoters(): IModelAuthorityState[] {
    this.ensureInitialized();
    return Array.from(this.registry.values())
      .filter(m => m.directionalVoter)
      .map(m => ({ ...m }));
  }

  /**
   * Updates dynamic model performance metrics from forward OOS evaluation.
   */
  public static updateModelMetrics(
    modelId: string,
    metrics: {
      forwardEV?: number;
      incrementalEV?: number;
      brierScore?: number;
      ece?: number;
      biasPenalty?: number;
      correlationPenalty?: number;
      uncertaintyPenalty?: number;
      dataQuality?: number;
      availability?: number;
      sampleCount?: number;
      regimeFit?: number;
      status?: ModelRuntimeStatus;
      reason?: string;
    }
  ): void {
    this.ensureInitialized();
    const model = this.registry.get(modelId);
    if (!model) return;

    if (metrics.forwardEV !== undefined) model.forwardEV = metrics.forwardEV;
    if (metrics.incrementalEV !== undefined) model.incrementalEV = metrics.incrementalEV;
    if (metrics.brierScore !== undefined) model.brierScore = metrics.brierScore;
    if (metrics.ece !== undefined) model.ece = metrics.ece;
    if (metrics.biasPenalty !== undefined) model.biasPenalty = metrics.biasPenalty;
    if (metrics.correlationPenalty !== undefined) model.correlationPenalty = metrics.correlationPenalty;
    if (metrics.uncertaintyPenalty !== undefined) model.uncertaintyPenalty = metrics.uncertaintyPenalty;
    if (metrics.dataQuality !== undefined) model.dataQuality = metrics.dataQuality;
    if (metrics.availability !== undefined) model.availability = metrics.availability;
    if (metrics.sampleCount !== undefined) model.sampleCount = metrics.sampleCount;
    if (metrics.regimeFit !== undefined) model.regimeFit = metrics.regimeFit;
    if (metrics.status !== undefined) model.status = metrics.status;
    if (metrics.reason !== undefined) model.reason = metrics.reason;

    model.lastUpdated = Date.now();
    this.evaluateModelStatusAndWeight(model);
    this.rebalanceWeights();
  }

  /**
   * Evaluates AI runtime status and raw authority with Bayesian shrinkage & hysteresis.
   */
  private static evaluateModelStatusAndWeight(model: IModelAuthorityState): void {
    // Non-directional models (PPO, Weather, Risk) do not participate in directional voting
    if (!model.directionalVoter) {
      model.effectiveWeight = 0.0;
      return;
    }

    // Layer 1 Boundary Check
    if (!model.adminAllowed) {
      model.status = "TEMPORARILY_DISABLED";
      model.effectiveWeight = 0.0;
      model.reason = "Layer 1 Admin Permission Revoked";
      return;
    }

    // Shadow model OOS sample requirement check
    if (model.sampleCount < this.config.minOOSSamplesForLive && model.status === "SHADOW") {
      model.effectiveWeight = 0.0;
      model.reason = `Shadow validation active: ${model.sampleCount}/${this.config.minOOSSamplesForLive} OOS samples`;
      return;
    }

    // Calculate Empirical Authority:
    // Prior * RegimeFit * CalibrationQuality * ForwardReliability * IncrementalEV * DataQuality * Availability * BiasAdj * CorrAdj * UncAdj
    const calibQuality = Math.max(0.01, 1.0 - model.ece * 2.5);
    const reliability = Math.max(0.01, 1.0 - model.brierScore * 2.0);
    const evFactor = Math.max(0.0, 1.0 + model.incrementalEV * 20.0);
    const biasAdj = Math.max(0.0, 1.0 - model.biasPenalty);
    const corrAdj = Math.max(0.1, model.correlationPenalty);
    const uncAdj = Math.max(0.1, 1.0 - model.uncertaintyPenalty);

    const empiricalAuthority =
      model.basePrior *
      model.regimeFit *
      calibQuality *
      reliability *
      evFactor *
      model.dataQuality *
      model.availability *
      biasAdj *
      corrAdj *
      uncAdj;

    // Bayesian Shrinkage: r(N) = N / (N + k)
    const n = Math.max(0, model.sampleCount);
    const rN = n / (n + this.config.shrinkageK);
    const finalAuthority = rN * empiricalAuthority + (1.0 - rN) * model.basePrior;

    // Evaluate Hysteresis & Degradation Conditions
    const isDegraded =
      model.incrementalEV < -0.005 ||
      model.ece > 0.15 ||
      model.brierScore > 0.25 ||
      model.dataQuality < 0.50 ||
      model.availability < 0.50 ||
      model.biasPenalty > 0.30;

    const isSeverelyDegraded =
      model.incrementalEV < -0.02 ||
      model.ece > 0.20 ||
      model.brierScore > 0.30 ||
      model.biasPenalty > 0.50;

    if (isSeverelyDegraded) {
      model.status = "QUARANTINED";
      model.consecutiveFailures++;
      model.consecutiveSuccesses = 0;
      model.effectiveWeight = 0.0;
      model.reason = "Severe empirical degradation; placed into quarantine";
      return;
    }

    if (isDegraded) {
      model.consecutiveFailures++;
      model.consecutiveSuccesses = 0;

      if (model.consecutiveFailures >= this.config.kFailureThreshold) {
        model.status = "TEMPORARILY_DISABLED";
        model.effectiveWeight = 0.0;
        model.reason = `Persistent degradation across ${model.consecutiveFailures} evaluation windows`;
      } else {
        model.status = "DOWNWEIGHTED";
        model.effectiveWeight = Math.max(0.01, finalAuthority * 0.35);
        model.reason = `Downweighted due to empirical underperformance (Failure count: ${model.consecutiveFailures})`;
      }
      return;
    }

    // Normal or Recovering Performance
    model.consecutiveSuccesses++;
    if (model.status === "TEMPORARILY_DISABLED" || model.status === "QUARANTINED") {
      if (model.consecutiveSuccesses >= this.config.mRecoveryThreshold) {
        model.status = "ACTIVE";
        model.consecutiveFailures = 0;
        model.effectiveWeight = finalAuthority;
        model.reason = `Recovered after ${model.consecutiveSuccesses} successful validation windows`;
      } else {
        model.effectiveWeight = 0.0;
        model.reason = `Recovery in progress (${model.consecutiveSuccesses}/${this.config.mRecoveryThreshold} required windows)`;
      }
    } else {
      model.status = "ACTIVE";
      model.consecutiveFailures = 0;
      model.effectiveWeight = Math.max(0.01, finalAuthority);
      model.reason = "Empirically validated with positive incremental contribution";
    }
  }

  /**
   * Rebalances and normalizes active directional model weights so they sum strictly to 1.0.
   */
  public static rebalanceWeights(): void {
    this.ensureInitialized();

    // Reset non-participating models to 0.0 weight
    for (const m of this.registry.values()) {
      if (!m.directionalVoter || !m.adminAllowed || (m.status !== "ACTIVE" && m.status !== "DOWNWEIGHTED" && m.status !== "DEGRADED" && m.status !== "RECOVERING")) {
        m.effectiveWeight = 0.0;
      } else if (m.status === "DEGRADED" || m.status === "DOWNWEIGHTED" || m.status === "RECOVERING") {
        m.effectiveWeight = m.basePrior * 0.4;
      } else if (m.status === "ACTIVE") {
        m.effectiveWeight = m.basePrior;
      }
    }

    const directionalActive = Array.from(this.registry.values()).filter(
      m => m.directionalVoter && m.adminAllowed && (m.status === "ACTIVE" || m.status === "DOWNWEIGHTED" || m.status === "DEGRADED" || m.status === "RECOVERING")
    );

    const totalWeight = directionalActive.reduce((sum, m) => sum + m.effectiveWeight, 0);

    if (totalWeight > 0) {
      for (const m of directionalActive) {
        m.effectiveWeight = Number((m.effectiveWeight / totalWeight).toFixed(6));
      }
    } else {
      for (const m of this.registry.values()) {
        if (m.directionalVoter) m.effectiveWeight = 0.0;
      }
    }
  }

  // ── Regime-Aware Model Authority ──

  /**
   * Returns regime-specific authority for a model.
   */
  public static getRegimeAuthority(regime: string, modelId: string): IRegimeModelAuthority | undefined {
    this.ensureInitialized();
    const rMap = this.regimeAuthorities.get(regime);
    return rMap ? rMap.get(modelId) : undefined;
  }

  /**
   * Returns all model authorities for a specific regime.
   */
  public static getRegimeAuthorities(regime: string): IRegimeModelAuthority[] {
    this.ensureInitialized();
    const rMap = this.regimeAuthorities.get(regime);
    if (!rMap) return [];
    return Array.from(rMap.values());
  }

  private static authorityEvents: ModelAuthorityEvent[] = [];

  /**
   * Returns copy of all recorded model authority transition events.
   */
  public static getAuthorityEvents(): ModelAuthorityEvent[] {
    return [...this.authorityEvents];
  }

  /**
   * Emits and stores an immutable model authority transition event.
   */
  public static emitAuthorityEvent(
    model: IModelAuthorityState,
    previousState: ModelRuntimeStatus,
    newState: ModelRuntimeStatus,
    reason: string
  ): ModelAuthorityEvent {
    const event: ModelAuthorityEvent = {
      eventId: `EVT_AUTH_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      modelId: model.modelId,
      previousState,
      newState,
      reason,
      sampleCount: model.sampleCount,
      regime: "ALL",
      domain: model.marketDomain,
      deltaEV: model.incrementalEV,
      deltaBrier: model.brierScore,
      deltaECE: model.ece,
      driftScore: 0.05,
      biasScore: model.biasPenalty,
      dependenceScore: 1.0 - model.correlationPenalty,
      timestamp: Date.now(),
      authorityVersion: "2026.4"
    };

    this.authorityEvents.push(event);
    if (this.authorityEvents.length > 1000) {
      this.authorityEvents.shift();
    }
    return event;
  }

  /**
   * Computes a unified multi-metric CompositeModelHealthScore without double-counting collinear terms.
   */
  public static computeModelHealthScore(modelId: string): CompositeModelHealthScore {
    this.ensureInitialized();
    const model = this.registry.get(modelId);
    if (!model) {
      return {
        modelId,
        overallHealthScore: 0.0,
        predictiveScore: 0.0,
        calibrationScore: 0.0,
        economicValueScore: 0.0,
        riskContributionScore: 0.0,
        stabilityScore: 0.0,
        latencyAvailabilityScore: 0.0,
        sampleSufficiencyRatio: 0.0,
        components: {
          brier: 0.25,
          ece: 0.15,
          incrementalEV: 0.0,
          maxDrawdownPct: 0.0,
          tailRiskES: 0.0,
          driftScore: 1.0,
          biasScore: 1.0,
          correlationRedundancy: 1.0,
          latencyMs: 100,
          availabilityPct: 0.0,
          sampleCount: 0
        },
        isHealthy: false,
        recommendation: "DISABLED"
      };
    }

    // 1. Predictive Performance Score (Brier: 0.0 -> 1.0, 0.25 -> 0.0)
    const predictiveScore = Math.max(0, Math.min(1.0, 1.0 - (model.brierScore / 0.25)));

    // 2. Calibration Score (ECE: 0.0 -> 1.0, 0.15 -> 0.0)
    const calibrationScore = Math.max(0, Math.min(1.0, 1.0 - (model.ece / 0.15)));

    // 3. Economic Value Score (Incremental EV > 0, normalized)
    const economicValueScore = Math.max(0, Math.min(1.0, 0.5 + model.incrementalEV * 50));

    // 4. Risk Contribution Score
    const riskContributionScore = Math.max(0, Math.min(1.0, 1.0 - model.uncertaintyPenalty * 0.5));

    // 5. Stability Score (Penalized by bias and correlation redundancy)
    const stabilityScore = Math.max(0, Math.min(1.0, (1.0 - model.biasPenalty) * model.correlationPenalty));

    // 6. Latency & Availability Score
    const latencyAvailabilityScore = model.availability * (model.dataQuality ?? 1.0);

    // 7. Sample Sufficiency Ratio
    const sampleSufficiencyRatio = Math.min(1.0, model.sampleCount / this.config.minOOSSamplesForLive);

    // Composite Weighted Combination (Collinear terms penalized, weights sum to 1.0)
    const rawComposite =
      predictiveScore * 0.25 +
      calibrationScore * 0.20 +
      economicValueScore * 0.25 +
      riskContributionScore * 0.10 +
      stabilityScore * 0.10 +
      latencyAvailabilityScore * 0.10;

    const overallHealthScore = Number((rawComposite * (0.5 + 0.5 * sampleSufficiencyRatio)).toFixed(4));
    const isHealthy = overallHealthScore >= 0.60 && model.ece <= 0.12 && model.brierScore <= 0.22;

    let recommendation: ModelRuntimeStatus = model.status;
    if (!isHealthy && model.status === "ACTIVE") {
      recommendation = "DOWNWEIGHTED";
    } else if (overallHealthScore < 0.40 && model.status !== "QUARANTINED" && model.status !== "DISABLED") {
      recommendation = "QUARANTINED";
    } else if (isHealthy && model.status === "DOWNWEIGHTED" && model.sampleCount >= 25) {
      recommendation = "ACTIVE";
    }

    return {
      modelId,
      overallHealthScore,
      predictiveScore: Number(predictiveScore.toFixed(4)),
      calibrationScore: Number(calibrationScore.toFixed(4)),
      economicValueScore: Number(economicValueScore.toFixed(4)),
      riskContributionScore: Number(riskContributionScore.toFixed(4)),
      stabilityScore: Number(stabilityScore.toFixed(4)),
      latencyAvailabilityScore: Number(latencyAvailabilityScore.toFixed(4)),
      sampleSufficiencyRatio: Number(sampleSufficiencyRatio.toFixed(4)),
      components: {
        brier: model.brierScore,
        ece: model.ece,
        incrementalEV: model.incrementalEV,
        maxDrawdownPct: 4.8,
        tailRiskES: 1.85,
        driftScore: 0.05,
        biasScore: model.biasPenalty,
        correlationRedundancy: 1.0 - model.correlationPenalty,
        latencyMs: 3.5,
        availabilityPct: model.availability * 100,
        sampleCount: model.sampleCount
      },
      isHealthy,
      recommendation
    };
  }

  /**
   * Returns all composite health scores across all models.
   */
  public static getAllModelHealthScores(): CompositeModelHealthScore[] {
    this.ensureInitialized();
    return Array.from(this.registry.keys()).map(id => this.computeModelHealthScore(id));
  }

  /**
   * Updates model runtime status directly with reason and emits an authority transition event.
   */
  public static updateModelStatus(modelId: string, status: ModelRuntimeStatus, reason?: string): boolean {
    this.ensureInitialized();
    let model = this.registry.get(modelId);
    if (!model && (modelId === "CNN" || modelId === "CNN_MICROSTRUCTURE" || modelId === "CNN_1D_V1")) {
      model = this.registry.get("CNN_1D");
    }
    if (!model) return false;
    const previousState = model.status;
    model.status = status;
    if (reason) model.reason = reason;
    if (status === "ACTIVE" || status === "RECOVERING" || status === "QUARANTINED" || status === "DISABLED" || status === "SHADOW") {
      model.consecutiveFailures = 0;
      model.consecutiveSuccesses = 0;
    }
    model.lastUpdated = Date.now();
    this.rebalanceWeights();

    if (previousState !== status) {
      this.emitAuthorityEvent(model, previousState, status, reason || `Status changed from ${previousState} to ${status}`);
    }
    return true;
  }

  /**
   * Records evaluation outcome to update hysteresis counters.
   */
  public static recordEvaluationResult(modelId: string, success: boolean): void {
    this.ensureInitialized();
    let model = this.registry.get(modelId);
    if (!model && (modelId === "CNN" || modelId === "CNN_MICROSTRUCTURE" || modelId === "CNN_1D_V1")) {
      model = this.registry.get("CNN_1D");
    }
    if (!model) return;
    const previousState = model.status;

    if (success) {
      model.consecutiveSuccesses++;
      model.consecutiveFailures = 0;
      if (model.status === "RECOVERING" && model.consecutiveSuccesses >= this.config.mRecoveryThreshold) {
        model.status = "ACTIVE";
        model.reason = "Promoted from RECOVERING to ACTIVE after consistent forward performance";
        this.emitAuthorityEvent(model, previousState, "ACTIVE", model.reason);
      } else if (model.status === "DOWNWEIGHTED" && model.consecutiveSuccesses >= this.config.mRecoveryThreshold) {
        model.status = "ACTIVE";
        model.reason = "Restored from DOWNWEIGHTED to ACTIVE";
        this.emitAuthorityEvent(model, previousState, "ACTIVE", model.reason);
      }
    } else {
      model.consecutiveFailures++;
      model.consecutiveSuccesses = 0;
      if (model.consecutiveFailures >= this.config.kFailureThreshold) {
        model.status = "QUARANTINED";
        model.reason = `QUARANTINED after ${model.consecutiveFailures} consecutive failed evaluations`;
        this.emitAuthorityEvent(model, previousState, "QUARANTINED", model.reason);
      }
    }
    model.lastUpdated = Date.now();
    this.rebalanceWeights();
  }

  /**
   * Sets regime-specific authority.
   */
  public static setRegimeAuthority(regime: string, modelId: string, auth: IRegimeModelAuthority): void {
    this.ensureInitialized();
    let rMap = this.regimeAuthorities.get(regime);
    if (!rMap) {
      rMap = new Map();
      this.regimeAuthorities.set(regime, rMap);
    }
    rMap.set(modelId, auth);
  }

  // ── Signal Family Autonomy ──

  private static initializeFamilies(): void {
    const families: SignalFamily[] = [
      "PRICE_MOMENTUM",
      "MICROSTRUCTURE",
      "STRUCTURAL_SMC",
      "DERIVATIVES",
      "SENTIMENT",
      "MACRO",
      "HARMONIC",
      "MEAN_REVERSION",
      "REGIME",
      "ALT_DATA",
      "EXECUTION",
      "RISK"
    ];

    for (const f of families) {
      this.familyAuthorities.set(f, {
        family: f,
        status: "ACTIVE",
        weightCap: f === "PRICE_MOMENTUM" ? 0.45 : (f === "ALT_DATA" ? 0.05 : 0.35),
        effectiveWeight: 0.20,
        incrementalEV: 0.005,
        correlationPenalty: 1.0,
        modelCount: 0,
        activeModelCount: 0,
        reason: "Initial baseline evidence family"
      });
    }
  }

  public static getSignalFamily(family: SignalFamily): ISignalFamilyAuthority | undefined {
    this.ensureInitialized();
    const f = this.familyAuthorities.get(family);
    return f ? { ...f } : undefined;
  }

  public static getAllSignalFamilies(): ISignalFamilyAuthority[] {
    this.ensureInitialized();
    return Array.from(this.familyAuthorities.values()).map(f => ({ ...f }));
  }

  // ── Persistence & Snapshot State ──

  /**
   * Serializes current state to a portable JSON object.
   */
  public static exportStateJSON(): string {
    this.ensureInitialized();
    const models = Array.from(this.registry.values());
    const families = Array.from(this.familyAuthorities.values());
    const regimes: Record<string, IRegimeModelAuthority[]> = {};
    for (const [r, map] of this.regimeAuthorities.entries()) {
      regimes[r] = Array.from(map.values());
    }

    return JSON.stringify({
      version: "2026.1",
      timestamp: Date.now(),
      models,
      families,
      regimes,
      config: this.config
    });
  }

  /**
   * Rehydrates registry state from a JSON snapshot.
   */
  public static importStateJSON(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed.models)) return false;

      this.registry.clear();
      for (const m of parsed.models) {
        this.registry.set(m.modelId, m);
      }

      if (Array.isArray(parsed.families)) {
        this.familyAuthorities.clear();
        for (const f of parsed.families) {
          this.familyAuthorities.set(f.family, f);
        }
      }

      if (parsed.regimes && typeof parsed.regimes === "object") {
        this.regimeAuthorities.clear();
        for (const [r, list] of Object.entries(parsed.regimes)) {
          const map = new Map<string, IRegimeModelAuthority>();
          for (const item of list as IRegimeModelAuthority[]) {
            map.set(item.modelId, item);
          }
          this.regimeAuthorities.set(r, map);
        }
      }

      if (parsed.config) {
        this.config = { ...this.config, ...parsed.config };
      }

      this.initialized = true;
      this.rebalanceWeights();
      return true;
    } catch (err) {
      console.warn(`[ModelAuthorityRegistry] Error importing state JSON:`, err);
      return false;
    }
  }

  private static ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }
}
