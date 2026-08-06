import { Trade } from "../models/Trade.js";

interface PositionRequest {
  symbol: string;
  marginType: "ISOLATED" | "CROSS";
  leverage: number;
  qty: number;
  entryPrice: number;
}

/**
 * Hedge-Fund Derivatives Tracking System
 * Computes Futures tracking variables, Margin liquidations, Options Greeks
 */
export class DerivativesEngine {
  
  /**
   * Tracks future contract margin maintenance
   * Returns remaining margin balance or Error if liquidated
   */
  public static calculateMaintenanceMargin(
    position: PositionRequest, 
    currentPrice: number, 
    availableBalance: number
  ): number {
    
    // Abstract Maintenance Margin rate for Futures (Typically ~0.5% for major pairs)
    const M_MARGIN_RATE = 0.005;
    
    // Unrealized PNL mapping Long and Short dynamics
    const pnl = position.entryPrice ? (currentPrice - position.entryPrice) * position.qty : 0;
    
    const marginReq = (currentPrice * position.qty) / position.leverage;
    const maintenanceRequirement = currentPrice * position.qty * M_MARGIN_RATE;
    
    // Leverage Cross or Isolated isolation math
    let activeMargin = marginReq;
    if (position.marginType === "CROSS") {
      activeMargin = availableBalance; // Can use whole portfolio margin
    }
    
    activeMargin += pnl;

    if (activeMargin <= maintenanceRequirement) {
        console.warn(`🚨 MARGIN CALL: Position ${position.symbol} has hit maintenance margin liquidity threshold.`);
        return -1; // -1 denotes liquidation queue event required
    }
    
    return activeMargin; 
  }

  /**
   * Basic Black-Scholes inspired Greek logic approximation 
   * Useful when plotting out synthetic option overlays over crypto spots.
   */
  public static calculateOptionsGreeks(spot: number, strike: number, DTE: number, volatility: number) {
    // Delta approximation for At-The-Money calls
    let delta = 0.5;
    
    if (spot > strike * 1.05) delta = 0.8; // Deep ITM
    if (spot < strike * 0.95) delta = 0.2; // OTM
    
    // Gamma (maximized at ATM)
    const gamma = (spot === strike) ? 0.05 : 0.01;
    
    // Theta (time decay, increases as DTE decreases)
    const theta = -volatility / Math.max(0.1, DTE);

    return { delta, gamma, theta };
  }
}
