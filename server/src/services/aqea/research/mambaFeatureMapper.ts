import { FeatureVector } from "../featureStore.js";

export type MambaFeatureVector = number[];

export class MambaFeatureMapper {
  /**
   * Maps a standardized FeatureVector to the specific flat array
   * expected by the Mamba State Space Model.
   * Total 21 features.
   */
  public static map(fv: FeatureVector): MambaFeatureVector {
    return [
      // OHLCV (5)
      fv.market.open,
      fv.market.high,
      fv.market.low,
      fv.market.close,
      fv.market.volume,

      // Technicals (8)
      fv.market.atr,
      fv.market.adx,
      fv.market.rsi,
      fv.market.macd,
      fv.market.vwap,
      fv.market.ema20,
      fv.market.ema50,
      fv.market.ema200,

      // Regime (1) - Encode state to numeric or just use score
      fv.regime.score,

      // Order Flow (5)
      fv.orderFlow.cvd,
      fv.orderFlow.delta,
      fv.orderFlow.oiExpansion,
      fv.orderFlow.fundingRate,
      fv.orderFlow.liquidationScore,

      // Smart Money (2) - Simplified encoding
      fv.smartMoney.liquiditySweep ? 1.0 : 0.0,
      fv.smartMoney.poc
    ];
  }

  /**
   * Builds a historical sequence of Mamba feature vectors.
   * Supports configured context lengths (e.g. 256, 512, 1024).
   * Note: In a production shadow environment, this would fetch 
   * historical bars from the DB/FeatureStore. For this mapper interface,
   * we expect the raw historical FeatureVectors to be provided.
   */
  public static mapSequence(historicalFvs: FeatureVector[], contextLength: 256 | 512 | 1024): MambaFeatureVector[] {
    // Truncate or pad as necessary. For research, we pad with zeros if insufficient history
    const sequence = historicalFvs.map(this.map);
    
    if (sequence.length > contextLength) {
        return sequence.slice(sequence.length - contextLength);
    }
    
    // Pad with zeros if needed (assuming 21 features per vector)
    const paddingLength = contextLength - sequence.length;
    const padding = new Array(paddingLength).fill(new Array(21).fill(0));
    
    return [...padding, ...sequence];
  }
}
