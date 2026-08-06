import { getKlines } from "./binanceService.js";
import { log } from "../utils/logger.js";
import fs from "node:fs";
import { AI_ENDPOINTS, buildEndpointUrl } from "../config/aiEndpointRegistry.js";

export interface SpectralRegimeReport {
  absorptionRatio: number;
  eigenvalues: number[];
  marchenkoPasturUpper: number;
  regime: "NORMAL_RISK_ON" | "CORRELATION_SHOCK_RISK_OFF" | "CALIBRATING";
  shieldActive: boolean;
  timestamp: string;
}

// In-Memory cache for current spectral status
let currentReport: SpectralRegimeReport = {
  absorptionRatio: 0.0,
  eigenvalues: [],
  marchenkoPasturUpper: 0.0,
  regime: "CALIBRATING",
  shieldActive: false,
  timestamp: new Date().toISOString()
};

const LOG_PATH = "/Users/amithks/aalgolakshmi_v3/server/auto_trade.log";

function logRegime(msg: string) {
  const line = `[${new Date().toISOString()}] [SPECTRAL] 🧠 ${msg}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch {}
  console.log(line.trim());
}

/**
 * Returns the current cached spectral regime report
 */
export function getRegimeReport(): SpectralRegimeReport {
  return { ...currentReport };
}

/**
 * Checks whether the correlation shock shield is active
 */
export function isCorrelationShockActive(): boolean {
  return currentReport.shieldActive;
}

/**
 * Audits the cointegration/correlation matrix across all active symbols 
 * and identifies systemic regime shocks via eigenvalue decomposition.
 */
export async function runSpectralRegimeAudit(symbols: string[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT"]): Promise<SpectralRegimeReport> {
  try {
    if (symbols.length < 2) {
      logRegime("At least 2 symbols are required for correlation audit. Skipping.");
      return currentReport;
    }

    const limit = 61; // Need 61 close prices to compute 60 returns
    const klinesMap = new Map<string, number[]>();

    // 1. Fetch klines in parallel for all symbols
    const fetchPromises = symbols.map(async (symbol) => {
      try {
        const klines = await getKlines(symbol, "5m", undefined, undefined, limit);
        if (klines && klines.length >= 50) {
          const closes = klines.map(k => parseFloat(k.close));
          klinesMap.set(symbol, closes);
        }
      } catch (err: any) {
        logRegime(`Failed to fetch klines for ${symbol}: ${err.message}`);
      }
    });

    await Promise.all(fetchPromises);

    // Verify we have sufficient data for at least 2 assets
    const activeSymbols = Array.from(klinesMap.keys());
    if (activeSymbols.length < 2) {
      logRegime("Insufficient asset price arrays fetched. Calibrating...");
      return currentReport;
    }

    // Determine the minimum length of price series to align returns
    const minLength = Math.min(...Array.from(klinesMap.values()).map(arr => arr.length));
    if (minLength < 10) {
      logRegime(`Aligned price array length (${minLength}) is too short. Calibrating...`);
      return currentReport;
    }

    // 2. Compute returns matrix [T, N]
    const returnPeriods = minLength - 1;
    const numAssets = activeSymbols.length;
    const returnsMatrix: number[][] = Array.from({ length: returnPeriods }, () => Array(numAssets).fill(0));

    for (let j = 0; j < numAssets; j++) {
      const symbol = activeSymbols[j];
      const prices = klinesMap.get(symbol)!;
      // Slice prices from the end to align them
      const alignedPrices = prices.slice(prices.length - minLength);

      for (let i = 0; i < returnPeriods; i++) {
        const prev = alignedPrices[i];
        const curr = alignedPrices[i + 1];
        const ret = prev > 0 ? (curr - prev) / prev : 0.0;
        returnsMatrix[i][j] = ret;
      }
    }

    // 3. Post returns matrix to Python Quant Engine
    try {
      const url = await buildEndpointUrl(AI_ENDPOINTS.SPECTRAL_REGIME);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: activeSymbols,
          returns: returnsMatrix
        })
      });

      if (res.ok) {
        const data = await res.json() as any;
        if (data && data.analysis) {
          const analysis = data.analysis;
          currentReport = {
            absorptionRatio: analysis.absorption_ratio,
            eigenvalues: analysis.eigenvalues || [],
            marchenkoPasturUpper: analysis.marchenko_pastur_upper,
            regime: analysis.regime,
            shieldActive: analysis.shield_active,
            timestamp: new Date().toISOString()
          };

          if (currentReport.shieldActive) {
            logRegime(`🚨 SYSTEMIC RISK DETECTED! Absorption Ratio: ${(currentReport.absorptionRatio * 100).toFixed(2)}% (>= 70%). PCA Shield ENGAGED.`);
          } else {
            logRegime(`🟢 Normal market conditions. Absorption Ratio: ${(currentReport.absorptionRatio * 100).toFixed(2)}% (under 70%). Shield DISENGAGED.`);
          }
        }
      } else {
        throw new Error(`FastAPI returned status ${res.status}`);
      }
    } catch (err: any) {
      // Degrade gracefully if Python engine is offline
      logRegime(`Python Quant Engine offline or unreachable (${err.message}). Safe fallback engaged.`);
      currentReport = {
        absorptionRatio: 0.0,
        eigenvalues: [],
        marchenkoPasturUpper: 0.0,
        regime: "NORMAL_RISK_ON",
        shieldActive: false,
        timestamp: new Date().toISOString()
      };
    }
  } catch (globalErr: any) {
    logRegime(`Spectral regime audit exception: ${globalErr.message}`);
  }

  return currentReport;
}
