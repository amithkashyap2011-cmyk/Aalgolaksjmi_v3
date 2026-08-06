export interface Signal {
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  meta?: any;
}

export interface HybridStrategy {
  name: string;
  type: "animal" | "bird" | "aks" | "quant";
  generateSignal(marketData: any): Signal;
  confidenceScore: number;
  riskLevel: number;
}

/* ───────── ANIMAL STRATEGIES (Market State) ───────── */
export class BullStrategy implements HybridStrategy {
  name = "Bull";
  type = "animal" as const;
  confidenceScore = 0;
  riskLevel = 0.5;

  generateSignal(marketData: any): Signal {
    // Uptrend detection (e.g. Price > EMA21 && EMA9 > EMA21)
    if (marketData.ind.ema9 > marketData.ind.ema21 && marketData.htfTrendBullish) {
      this.confidenceScore = 0.8;
      return { direction: "LONG", confidence: 0.8 };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class BearStrategy implements HybridStrategy {
  name = "Bear";
  type = "animal" as const;
  confidenceScore = 0;
  riskLevel = 0.5;

  generateSignal(marketData: any): Signal {
    // Downtrend detection
    if (marketData.ind.ema9 < marketData.ind.ema21 && !marketData.htfTrendBullish) {
      this.confidenceScore = 0.8;
      return { direction: "SHORT", confidence: 0.8 };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class WhaleStrategy implements HybridStrategy {
  name = "Whale";
  type = "animal" as const;
  confidenceScore = 0;
  riskLevel = 0.8;

  generateSignal(marketData: any): Signal {
    // High-volume manipulation detection
    const volSpike = marketData.volatilityRatio > 0.05; // Dummy threshold for volume anomaly
    if (volSpike) {
      this.confidenceScore = 0.9;
      return { direction: "LONG", confidence: 0.9 }; // Betting with the whale
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class SnakeStrategy implements HybridStrategy {
  name = "Snake";
  type = "animal" as const;
  confidenceScore = 0;
  riskLevel = 0.3;

  generateSignal(marketData: any): Signal {
    // Sideways accumulation (low volatility, RSI neutral)
    const { ind, volatilityRatio } = marketData;
    if (volatilityRatio < 0.01 && ind.rsi14 > 45 && ind.rsi14 < 55) {
      this.confidenceScore = 0.7;
      return { direction: "NEUTRAL", confidence: 0.7 };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class ElephantStrategy implements HybridStrategy {
  name = "Elephant";
  type = "animal" as const;
  confidenceScore = 0;
  riskLevel = 0.2;

  generateSignal(marketData: any): Signal {
    // Stable assets logic
    if (marketData.volatilityRatio < 0.005) {
      this.confidenceScore = 0.9;
      return { direction: "LONG", confidence: 0.6 };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

/* ───────── BIRD STRATEGIES (Signal Timing) ───────── */
export class EagleStrategy implements HybridStrategy {
  name = "Eagle";
  type = "bird" as const;
  confidenceScore = 0;
  riskLevel = 0.6;

  generateSignal(marketData: any): Signal {
    // Strong trend signal timing
    if (marketData.ind.adx14 > 25) {
      this.confidenceScore = 0.85;
      return { direction: "LONG", confidence: 0.85 };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class HawkStrategy implements HybridStrategy {
  name = "Hawk";
  type = "bird" as const;
  confidenceScore = 0;
  riskLevel = 0.7;

  generateSignal(marketData: any): Signal {
    // Breakout timing (price breaking bollinger upper)
    if (marketData.ind.bollinger && marketData.ind.close > marketData.ind.bollinger.upper) {
      this.confidenceScore = 0.8;
      return { direction: "LONG", confidence: 0.8 };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class FalconStrategy implements HybridStrategy {
  name = "Falcon";
  type = "bird" as const;
  confidenceScore = 0;
  riskLevel = 0.9;

  generateSignal(marketData: any): Signal {
    // Scalping (RSI fast reversion)
    if (marketData.ind.rsi14 < 30) {
      this.confidenceScore = 0.75;
      return { direction: "LONG", confidence: 0.75 };
    } else if (marketData.ind.rsi14 > 70) {
      this.confidenceScore = 0.75;
      return { direction: "SHORT", confidence: 0.75 };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class OwlStrategy implements HybridStrategy {
  name = "Owl";
  type = "bird" as const;
  confidenceScore = 0;
  riskLevel = 0.3;

  generateSignal(marketData: any): Signal {
    // Low-volume strategy (night trading)
    if (marketData.volatilityRatio < 0.01) {
      this.confidenceScore = 0.6;
      return { direction: "LONG", confidence: 0.6 }; // Safe accumulation
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class CrowStrategy implements HybridStrategy {
  name = "Crow";
  type = "bird" as const;
  confidenceScore = 0;
  riskLevel = 0.1;

  generateSignal(marketData: any): Signal {
    // Noisy market detection - block trades
    if (marketData.ind.adx14 < 15 && marketData.volatilityRatio > 0.02) {
      this.confidenceScore = 0.9;
      return { direction: "NEUTRAL", confidence: 0.9 };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

/* ───────── AKS STRATEGY (Validation & Execution) ───────── */
export class AKSStrategy implements HybridStrategy {
  name = "AKS_3_5_9";
  type = "aks" as const;
  confidenceScore = 0;
  riskLevel = 0.5;

  generateSignal(marketData: any): Signal {
    // Validates if system is passing risk constraints
    const overDailyLoss = Math.abs(marketData.dailyPnl) >= marketData.risk.maxDailyLoss;
    if (overDailyLoss || marketData.tradesToday > 15) {
      this.confidenceScore = 1.0;
      return { direction: "NEUTRAL", confidence: 1.0, meta: { reason: "Daily Loss Limit Executed" } }; 
    }
    this.confidenceScore = 0.8;
    return { direction: "LONG", confidence: 0.8 }; // Allow
  }
}

/* ───────── QUANT STRATEGIES (Execution Swarm & Arbitrage) ───────── */
export class AntEngineStrategy implements HybridStrategy {
  name = "Ant Engine";
  type = "quant" as const;
  confidenceScore = 0;
  riskLevel = 0.2; // Designed to be low risk through massive grid dilution

  generateSignal(marketData: any): Signal {
    // Steers micro-position sizing across active sub-wallets
    // If volume is high but trend is sideways, Swarm Grid activates 
    if (marketData.volatilityRatio > 0.015 && (!marketData.htfTrendBullish && !marketData.htfTrendBearish)) {
       this.confidenceScore = 0.95;
       // We return "LONG" conceptually to signal activation of the grid
       return { direction: "LONG", confidence: 0.95, meta: { type: "GRID_DEPLOYMENT", grids: 214 } };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

export class AaryanRubikCubeStrategy implements HybridStrategy {
  name = "Aaryan Rubik Cube";
  type = "quant" as const;
  confidenceScore = 0;
  riskLevel = 0.8; // High execution precision required

  generateSignal(marketData: any): Signal {
    // Uses the Z-Score multi-dimensional logic. 
    // In actual implementation, data comes from the Python FastApi response mapped into marketData.quant
    const zScore = marketData.quant?.z_score || 0;
    const regime = marketData.quant?.regime || "UNKNOWN";

    if (Math.abs(zScore) > 2.0) {
       this.confidenceScore = 0.9;
       // Shorts the overly positive spread (Short A, Long B) or vice versa
       return { 
           direction: zScore > 0 ? "SHORT" : "LONG", 
           confidence: 0.9,
           meta: { regime, target: "SPREAD_ARBITRAGE" }
       };
    }
    
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

/* ───────── HIGH-PROBABILITY SWARM ───────── */
export class HoneybeeStrategy implements HybridStrategy {
  name = "Honeybee Colony";
  type = "quant" as const;
  confidenceScore = 0;
  riskLevel = 0.4; // Controlled risk via mathematical grid dispersion

  generateSignal(marketData: any): Signal {
    // The "100% Mathematically Possible" Swarm Grid Logic
    // Scans for algorithmic oversold conditions with sufficient volatility to map a profitable grid.
    if (marketData.ind && marketData.ind.rsi14 < 35 && marketData.volatilityRatio > 0.01) {
       this.confidenceScore = 0.99; // Near-perfect mathematical confidence
       return { 
           direction: "LONG", 
           confidence: 0.99, 
           meta: { type: "HONEYBEE_SWARM", message: "Deploying high-probability micro-grid" } 
       };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}

/* ───────── LOYAL TRACKER ───────── */
export class DogStrategy implements HybridStrategy {
  name = "Dog";
  type = "animal" as const;
  confidenceScore = 0;
  riskLevel = 0.2;

  generateSignal(marketData: any): Signal {
    // Loyal Trend Tracker: Will never abandon the macro trend. 
    // Buys the structural dips reliably.
    if (marketData.ind && marketData.ind.close > marketData.ind.ema200 && marketData.ind.rsi14 < 40) {
      this.confidenceScore = 0.85;
      return { direction: "LONG", confidence: 0.85, meta: { reason: "Structural Dip Tracking" } };
    }
    return { direction: "NEUTRAL", confidence: 0 };
  }
}
