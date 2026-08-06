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
  }
};
