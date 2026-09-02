/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Centralized Configuration & Feature Flags
 * ═══════════════════════════════════════════════════════════════════
 */

export const AQEA_CONFIG = {
  // Global Switch
  AQEA_ENABLED: true,
  AQEA_SHADOW_MODE: true,

  // Aliases for legacy code
  ENABLED: true,
  SHADOW_MODE: true,

  // Phase 2: Core Orchestration
  CORE_VOTING_ENABLED: true,
  CORE_WEIGHT: 0.40,

  // Phase 3: Order Flow & Smart Money
  // NOTE: these are now FALLBACK DEFAULTS only — per-user overrides live in Settings
  // (orderFlowVotingEnabled / smartMoneyVotingEnabled / cnnVotingEnabled / aiPredictorsEnabled
  // / transitionOverrideEnabled) and are toggled from the UI.
  ORDERFLOW_VOTING_ENABLED: true,
  ORDERFLOW_WEIGHT: 0.30,
  SMART_MONEY_VOTING_ENABLED: true,
  SMART_MONEY_WEIGHT: 0.30,
  SMART_MONEY_SHADOW_MODE: true,

  // Phase 4: AI Predictors
  AI_ENABLED: true,
  AI_VOTING_WEIGHT: 0.05,
  CNN_VOTING_ENABLED: true,

  // PPO Execution Optimization (Phase 5)
  PPO_ENABLED: true,
  PPO_SHADOW_MODE: true,
  // Was false — PPO's recommendation (engine.ts:609-636) was computed
  // every cycle but never actually applied. Now that PPO is demoted out of
  // directional voting (votingRegistry.ts), this is its real job: scale
  // position size (REDUCE_SIZE/INCREASE_SIZE), veto a trade the ensemble
  // otherwise approved (SKIP_TRADE), or tag an exit strategy
  // (CONSERVATIVE_EXIT/AGGRESSIVE_EXIT) — bounded by the existing
  // maxAllowedSize safety cap, and it can only scale/cancel a decision
  // already reached by CNN/Transformer/core score, never originate one.
  PPO_EXECUTION_AUTHORITY: true,

  // Phase 8: Mamba Integration Prep (RESEARCH_FROZEN)
  MAMBA_SHADOW_MODE: true, 
  MAMBA_VOTING_ENABLED: false, 

  // Track B: Transformer Integration Prep (RESEARCH_FROZEN)
  TRANSFORMER_SHADOW_MODE: true,
  TRANSFORMER_VOTING_ENABLED: false,

  // AQEA v2.2A: Dynamic Regime Router (RESEARCH_FROZEN)
  AQEA_ROUTER_SHADOW_MODE: true,

  // AQEA v2.4F: Meta Alpha Ensemble (ARCHIVED: REJECTED)
  META_ALPHA_SHADOW_ENABLED: false,
  META_ALPHA_VOTING_ENABLED: false,

  // AQEA v2.4H: Research Governance
  RESEARCH_FROZEN: true,

  // AQEA v2.4L: Transition Override (fallback default; per-user override in Settings)
  TRANSITION_OVERRIDE_ENABLED: true,

  // 🛡️ INSTITUTIONAL RISK LIMITS (v2.8 PRODUCTION RECOVERY)
  MAX_RISK_PER_TRADE: 0.02,         // 2% of equity
  MAX_PORTFOLIO_EXPOSURE: 0.60,     // 60% total notional exposure for multi-position paper testing
  MAX_CONCURRENT_POSITIONS: 5,      // Up to 5 concurrent positions
  MAX_LEVERAGE: 5,                  // Ceiling for AI-decided dynamic leverage (varies 1–5x by conviction)
  DAILY_DRAWDOWN_LIMIT: 0.03,       // 3% daily halt
  // Only the daily check below was ever actually wired into riskEngine.ts —
  // a string of daily losses each individually under 3% could still
  // compound into a much larger rolling drawdown with nothing catching it
  // until PORTFOLIO_DRAWDOWN_LIMIT (which was ALSO only ever defined here,
  // never enforced anywhere — found and fixed in the same pass as this).
  WEEKLY_DRAWDOWN_LIMIT: 0.08,      // 8% weekly halt
  MONTHLY_DRAWDOWN_LIMIT: 0.15,     // 15% monthly halt
  PORTFOLIO_DRAWDOWN_LIMIT: 0.10,   // 10% emergency stop (now actually enforced)
  MIN_FREE_MARGIN_PCT: 0.20,        // 20% minimum liquidity buffer

  // Performance Benchmarking Targets
  TARGETS: {
    MIN_TRADES: 1000,
    MIN_PROFIT_FACTOR: 1.4,
    MIN_SHARPE_RATIO: 1.2,
    MAX_DRAWDOWN: 0.10,
  },

  // ═══════════════════════════════════════════════════════════════════
  //  AQEA 2026–27 — Ensemble Subset Optimizer & Forward Utility Config
  // ═══════════════════════════════════════════════════════════════════
  SUBSET_OPTIMIZER: {
    VERSION: "1.0.0",
    LAMBDA_DRAWDOWN: 2.0,          // Penalty for max drawdown (lambda_DD)
    LAMBDA_EXPECTED_SHORTFALL: 1.5, // Penalty for expected shortfall / tail risk (lambda_ES)
    LAMBDA_TURNOVER: 0.5,          // Penalty for directional turnover (lambda_Turnover)
    LAMBDA_COMPLEXITY: 0.01,       // Penalty per model in active subset (lambda_Complexity)
    MIN_OOS_SAMPLES: 100,          // Minimum verified OOS sample size for promotion/selection
    MIN_EVAL_SAMPLES: 30,          // Minimum samples for preliminary search evaluation
    MAX_SUBSET_SIZE: 10,           // Maximum candidate models evaluated
    EXHAUSTIVE_MAX_SIZE: 4,        // Subsets of size <= 4 evaluated exhaustively
    MIN_NET_EV: 0.0,               // Required positive net forward EV
    MAX_DRAWDOWN: 15.0,            // 15.0% maximum allowed drawdown
    MIN_PROFIT_FACTOR: 1.30,       // Institutional profit factor threshold
    MAX_BRIER: 0.22,               // Maximum Brier score limit
    MAX_ECE: 0.12,                 // Maximum Expected Calibration Error limit
    SHRINKAGE_K_GLOBAL: 30,        // Smooth Bayesian shrinkage prior (global)
    SHRINKAGE_K_REGIME: 15         // Smooth Bayesian shrinkage prior (regime)
  },

  // ═══════════════════════════════════════════════════════════════════
  //  AQEA 2026–27 — Canonical Safety Thresholds (Phase 7.5 Single Source of Truth)
  // ═══════════════════════════════════════════════════════════════════
  CANONICAL_SAFETY: {
    STALE_MARKET_DATA_MS: 60_000,          // 60 seconds strict market tick freshness limit
    EXECUTION_AUTHORIZATION_MAX_AGE_MS: 60_000, // 60 seconds maximum execution authorization age
    MAX_DRAWDOWN_LIMIT_PCT: 15.0,          // 15.0% maximum portfolio drawdown
    MAX_DAILY_LOSS_LIMIT_PCT: 5.0,         // 5.0% maximum daily loss
    ECONOMIC_HURDLE_BPS: 10.0,             // 10 bps minimum expected Net EV hurdle
    MIN_NET_EV_BPS: 10.0,                  // Alias: 10 bps minimum Net EV
    ECONOMIC_HURDLE_DECIMAL: 0.0010,       // 0.0010 decimal representation of 10 bps
    MIN_BAYESIAN_CONVICTION: 0.60,         // 60% minimum posterior conviction
    MAX_CONFORMAL_UNCERTAINTY: 0.85,       // 0.85 maximum predictive uncertainty
    MIN_FORWARD_OOS_SAMPLES: 100,          // Minimum verified forward OOS sample count
    MIN_EFFECTIVE_SAMPLE_SIZE: 100,        // Minimum autocorrelation-adjusted sample size (N_eff)
    MIN_REGIME_COVERAGE_SCORE: 0.375,      // Minimum coverage across canonical regimes (3/8)
    REGIME_COVERAGE_MIN: 0.375,            // Alias: 3/8 minimum regime coverage
    MAX_BRIER_SCORE: 0.22,                 // Maximum Brier score threshold
    MAX_BRIER: 0.22,                       // Alias: 0.22 maximum Brier score
    MAX_ECE: 0.12,                         // Maximum Expected Calibration Error threshold
    MAX_FDR_SIGNIFICANCE: 0.05,            // 5% Benjamini-Hochberg FDR significance gate
    FDR_Q: 0.05                            // Alias: 0.05 FDR q-value threshold
  }
};
