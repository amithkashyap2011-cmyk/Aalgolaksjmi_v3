/*
 * ─── Portfolio Heat Engine (V8.0) ─────────────────────
 *
 * Hard-block enforcement for capital preservation.
 */

import { weatherIntelligenceEngine } from "./weatherIntelligenceEngine.js";

export enum HeatZone {
  GREEN = "GREEN",   // 0-30
  YELLOW = "YELLOW", // 30-50
  ORANGE = "ORANGE", // 50-70
  RED = "RED"        // 70+
}

export class PortfolioHeatEngine {
  public static getZone(heat: number): HeatZone {
    if (heat >= 70) return HeatZone.RED;
    if (heat >= 50) return HeatZone.ORANGE;
    if (heat >= 30) return HeatZone.YELLOW;
    return HeatZone.GREEN;
  }

  public static checkEnforcement(heat: number): { allowed: boolean; action: string } {
    // 1. Weather Influence (V1.0)
    const weatherAlpha = weatherIntelligenceEngine.getWeatherAlpha();
    let threshold = 40;
    
    if (weatherAlpha > 85) {
      threshold = 15; // Extreme tightening
    } else if (weatherAlpha > 70) {
      threshold = 25; // Significant tightening
    }

    if (heat > 80 || (weatherAlpha > 90 && heat > 20)) return { allowed: false, action: "EMERGENCY_PROTECTION" };
    if (heat > 60) return { allowed: true, action: "REDUCE_SIZE" };
    if (heat > threshold) return { allowed: false, action: "BLOCK_NEW_TRADES" };
    
    return { allowed: true, action: "NOMINAL" };
  }
}
