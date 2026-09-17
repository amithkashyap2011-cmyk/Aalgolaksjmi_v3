/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO CORRELATION & HIDDEN EXPOSURE ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Detects cross-strategy, cross-instrument, and cross-underlying correlations.
 *  Discovers hidden composite risks (e.g. NIFTY Call + NIFTY Future + BankNIFTY Buy)
 *  normalizing delta-equivalent directional exposure.
 */

import {
  IPortfolioPositionItem,
  IHiddenExposureCluster,
} from "../types.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";
import { PortfolioExposureEngine } from "../exposure/PortfolioExposureEngine.js";

export interface ICorrelationMatrix {
  entities: string[];
  matrix: Record<string, Record<string, number>>;
}

export interface IPortfolioClusteringReport {
  clusters: IHiddenExposureCluster[];
  hasCriticalClustering: boolean;
  warnings: string[];
}

export class PortfolioCorrelationEngine {
  // Underlying market benchmark correlation coefficients (NSE historical proxies)
  private static readonly PROXY_CORRELATIONS: Record<string, Record<string, number>> = {
    NIFTY: { NIFTY: 1.0, BANKNIFTY: 0.82, FINNIFTY: 0.88, SENSEX: 0.96 },
    BANKNIFTY: { NIFTY: 0.82, BANKNIFTY: 1.0, FINNIFTY: 0.91, SENSEX: 0.84 },
    FINNIFTY: { NIFTY: 0.88, BANKNIFTY: 0.91, FINNIFTY: 1.0, SENSEX: 0.89 },
    SENSEX: { NIFTY: 0.96, BANKNIFTY: 0.84, FINNIFTY: 0.89, SENSEX: 1.0 },
  };

  /**
   * Computes Pearson correlation matrix between strategy returns.
   */
  public static calculateReturnCorrelationMatrix(
    returnsMap: Record<string, number[]>
  ): ICorrelationMatrix {
    const entities = Object.keys(returnsMap);
    const matrix: Record<string, Record<string, number>> = {};

    for (const a of entities) {
      matrix[a] = {};
      for (const b of entities) {
        if (a === b) {
          matrix[a][b] = 1.0;
        } else {
          matrix[a][b] = this.pearson(returnsMap[a], returnsMap[b]);
        }
      }
    }

    return { entities, matrix };
  }

  /**
   * Hidden Exposure & Normalized Directional Clustering Detector.
   * Identifies when multiple distinct instruments (Options, Futures, ETFs, Stocks)
   * compound risk into the same underlying index or correlated sector.
   */
  public static detectHiddenExposure(positions: IPortfolioPositionItem[]): IPortfolioClusteringReport {
    const warnings: string[] = [];
    const clustersByUnderlying = new Map<string, IPortfolioPositionItem[]>();

    for (const pos of positions) {
      const norm = this.normalizeUnderlying(pos.underlying);
      if (!clustersByUnderlying.has(norm)) {
        clustersByUnderlying.set(norm, []);
      }
      clustersByUnderlying.get(norm)!.push(pos);
    }

    const clusters: IHiddenExposureCluster[] = [];
    let hasCriticalClustering = false;

    for (const [normUnderlying, posList] of clustersByUnderlying.entries()) {
      let totalEquivalentDelta = 0;
      const compositeInstruments = posList.map((p) => {
        const g = PortfolioExposureEngine.resolvePositionGreeks(p);
        const deltaEquivalent = roundTo2(g.delta * p.quantity);
        totalEquivalentDelta += deltaEquivalent;

        return {
          symbol: p.symbol,
          assetClass: p.assetClass,
          direction: p.side,
          quantity: p.quantity,
          deltaEquivalent,
        };
      });

      // Assess risk level based on quantity & instrument diversity
      let correlationRiskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL" = "LOW";
      const distinctInstruments = new Set(posList.map((p) => p.instrumentType)).size;

      if (posList.length >= 3 && Math.abs(totalEquivalentDelta) >= 100) {
        correlationRiskLevel = "CRITICAL";
        hasCriticalClustering = true;
        warnings.push(
          `CRITICAL_HIDDEN_EXPOSURE: ${posList.length} positions compounding into ${normUnderlying} with net delta of ${totalEquivalentDelta}.`
        );
      } else if (posList.length >= 2 && Math.abs(totalEquivalentDelta) >= 50) {
        correlationRiskLevel = "HIGH";
        warnings.push(
          `HIGH_CORRELATION_CLUSTER: ${posList.length} positions on ${normUnderlying} across ${distinctInstruments} instrument types.`
        );
      } else if (posList.length >= 2) {
        correlationRiskLevel = "MODERATE";
      }

      clusters.push({
        underlying: normUnderlying,
        totalEquivalentDelta: roundTo2(totalEquivalentDelta),
        compositeInstruments,
        correlationRiskLevel,
      });
    }

    // Cross-underlying check: NIFTY + BANKNIFTY + FINNIFTY simultaneous longs
    const indexDeltas = clusters
      .filter((c) => ["NIFTY", "BANKNIFTY", "FINNIFTY"].includes(c.underlying))
      .map((c) => c.totalEquivalentDelta);

    const allLong = indexDeltas.length >= 2 && indexDeltas.every((d) => d > 0);
    const allShort = indexDeltas.length >= 2 && indexDeltas.every((d) => d < 0);
    if (allLong || allShort) {
      warnings.push(
        `CROSS_INDEX_DIRECTIONAL_BIAS: Simultaneous ${allLong ? "LONG" : "SHORT"} bias detected across NIFTY and BankNIFTY derivatives.`
      );
    }

    return {
      clusters,
      hasCriticalClustering,
      warnings,
    };
  }

  /**
   * Retrieves estimated correlation between two underlyings.
   */
  public static getUnderlyingCorrelation(uA: string, uB: string): number {
    const a = this.normalizeUnderlying(uA);
    const b = this.normalizeUnderlying(uB);
    if (a === b) return 1.0;
    if (this.PROXY_CORRELATIONS[a]?.[b] !== undefined) {
      return this.PROXY_CORRELATIONS[a][b];
    }
    if (this.PROXY_CORRELATIONS[b]?.[a] !== undefined) {
      return this.PROXY_CORRELATIONS[b][a];
    }
    return 0.35; // Default modest positive correlation for broad Indian equities
  }

  public static normalizeUnderlying(sym: string): string {
    const s = sym.toUpperCase();
    if (s.includes("BANK") || s.includes("BNF")) return "BANKNIFTY";
    if (s.includes("FIN") || s.includes("FINNIFTY")) return "FINNIFTY";
    if (s.includes("SENSEX") || s.includes("BSE")) return "SENSEX";
    if (s.includes("NIFTY")) return "NIFTY";
    return s.split(" ")[0].replace(/[^A-Z]/g, "");
  }

  private static pearson(arrA: number[], arrB: number[]): number {
    const len = Math.min(arrA?.length || 0, arrB?.length || 0);
    if (len < 3) return 0.0;

    let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;
    for (let i = 0; i < len; i++) {
      const a = arrA[i];
      const b = arrB[i];
      sumA += a;
      sumB += b;
      sumA2 += a * a;
      sumB2 += b * b;
      sumAB += a * b;
    }

    const numerator = len * sumAB - sumA * sumB;
    const denominator = Math.sqrt((len * sumA2 - sumA * sumA) * (len * sumB2 - sumB * sumB));

    if (denominator === 0) return 0.0;
    return roundTo2(numerator / denominator);
  }
}
