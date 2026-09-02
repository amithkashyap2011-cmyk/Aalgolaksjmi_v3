/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Dynamic Economic Cost & Friction Model (Phase 12)
 * ═══════════════════════════════════════════════════════════════════
 * Calculates economically real transaction costs, slippage, market
 * impact, and spread dynamically adapting to:
 * 1. Market Domain (CRYPTO vs INDIAN NSE/BSE)
 * 2. Volatility (ATR %)
 * 3. Symbol Liquidity Tier
 * 4. Order Size Factor
 */

export interface MarketCostProfile {
  baseFeePercent: number;
  baseSlippagePercent: number;
  baseSpreadPercent: number;
  marketImpactFactor: number;
}

export interface FrictionCalculationParams {
  symbol: string;
  marketDomain: "CRYPTO" | "INDIAN";
  atrPercent: number;
  orderValueUsdOrInr?: number;
  isHighLiquidity?: boolean;
}

export interface CalculatedFriction {
  feePercent: number;
  slippagePercent: number;
  marketImpactPercent: number;
  spreadPercent: number;
  totalFrictionPercent: number;
}

const CRYPTO_COST_PROFILE: MarketCostProfile = {
  baseFeePercent: 0.08,        // 0.08% roundtrip maker/taker blended
  baseSlippagePercent: 0.04,   // 0.04% baseline
  baseSpreadPercent: 0.02,     // 0.02% baseline bid-ask
  marketImpactFactor: 0.015    // Scales with ATR
};

const INDIAN_COST_PROFILE: MarketCostProfile = {
  baseFeePercent: 0.05,        // STT + Exchange + Brokerage ~0.05%
  baseSlippagePercent: 0.03,   // 0.03% baseline
  baseSpreadPercent: 0.03,     // 0.03% baseline
  marketImpactFactor: 0.010
};

export class DynamicCostModel {
  /**
   * Computes market-specific, volatility-aware transaction friction.
   */
  public static calculateFriction(params: FrictionCalculationParams): CalculatedFriction {
    const profile = params.marketDomain === "INDIAN" ? INDIAN_COST_PROFILE : CRYPTO_COST_PROFILE;
    const atrMultiplier = Math.max(0.5, Math.min(3.0, params.atrPercent / 1.5));
    const liquidityDiscount = params.isHighLiquidity ? 0.80 : 1.15;

    const feePercent = profile.baseFeePercent;
    const slippagePercent = Number((profile.baseSlippagePercent * atrMultiplier * liquidityDiscount).toFixed(4));
    const spreadPercent = Number((profile.baseSpreadPercent * atrMultiplier).toFixed(4));
    const marketImpactPercent = Number((profile.marketImpactFactor * Math.sqrt(atrMultiplier)).toFixed(4));

    const totalFrictionPercent = Number((feePercent + slippagePercent + spreadPercent + marketImpactPercent).toFixed(4));

    return {
      feePercent,
      slippagePercent,
      marketImpactPercent,
      spreadPercent,
      totalFrictionPercent
    };
  }
}
