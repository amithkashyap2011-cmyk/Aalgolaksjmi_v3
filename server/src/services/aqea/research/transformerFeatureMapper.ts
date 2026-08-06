import { FeatureVector } from "../featureStore.js";

export type TransformerFeatureVector = number[];

export class TransformerFeatureMapper {
  /**
   * Maps a standardized FeatureVector to the specific flat array
   * expected by the Transformer Microstructure Model.
   * Total 20 features.
   */
  public static map(fv: FeatureVector): TransformerFeatureVector {
    return [
      // 1-5: Market OHLCV
      fv.market.open,
      fv.market.high,
      fv.market.low,
      fv.market.close,
      fv.market.volume,

      // 6-10: Market Indicators
      fv.market.atr,
      fv.market.adx,
      fv.market.rsi,
      fv.market.macdHistogram,
      fv.market.vwap,

      // 11-15: Microstructure Features
      fv.orderFlow.cvd,
      fv.orderFlow.delta,
      fv.orderFlow.oiExpansion,
      fv.orderFlow.fundingRate,
      fv.orderFlow.liquidationScore,

      // 16-19: Smart Money Features
      fv.smartMoney.liquiditySweep ? 1.0 : 0.0,
      fv.smartMoney.bos ? 1.0 : 0.0,
      fv.smartMoney.orderBlock ? 1.0 : 0.0,
      fv.smartMoney.fvg ? 1.0 : 0.0,

      // 20: Regime Context
      fv.regime.score
    ];
  }

  /**
   * Builds a historical sequence of Transformer feature vectors.
   * Supports configured context windows (128, 256, 512).
   */
  public static mapSequence(historicalFvs: FeatureVector[], contextLength: number): TransformerFeatureVector[] {
    const sequence = historicalFvs.map(this.map);
    
    if (sequence.length > contextLength) {
        return sequence.slice(sequence.length - contextLength);
    }
    
    const paddingLength = contextLength - sequence.length;
    const padding = new Array(paddingLength).fill(new Array(20).fill(0));
    
    return [...padding, ...sequence];
  }
}
