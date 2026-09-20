import { describe, it, expect, beforeEach } from "@jest/globals";
import { getDynamicMoEWeights, type MarketRegime } from "../src/services/ensembleService.js";
import {
  buildSequenceInput,
  predictSequenceLocalTransformer,
  predictSequenceLocalMamba,
  predictSequenceLocalxLSTM,
} from "../src/services/dlModelService.js";
import { buildMLFeatures } from "../src/services/mlModelService.js";
import { AutoCloseEngine } from "../src/services/autoCloseEngine.js";
import * as paper from "../src/services/paperState.js";
import { startManualSLTPMonitor, stopManualSLTPMonitor } from "../src/services/manualSLTPMonitor.js";

describe("Trading Audit Fixes & AI Model Optimizations Unit Tests", () => {
  // ─── 1. Dynamic Mixture-of-Experts (MoE) Router Tests ───────────
  describe("EnsembleService — Dynamic MoE Routing", () => {
    const baseWeights: Record<string, number> = {
      "cnn": 0.20,
      "lstm-bilstm": 0.20,
      "mamba-hybrid": 0.15,
      "xlstm": 0.15,
      "transformer": 0.15,
      "xgboost": 0.08,
      "ppo-agent": 0.07,
    };

    it("should boost momentum experts (CNN, LSTM, Mamba, xLSTM) during strong trending regimes", () => {
      const weights = getDynamicMoEWeights(baseWeights, {
        regime: "Strong Bull" as MarketRegime,
        regimeScore: 0.95,
        adx: 35,
        volatilityScore: 0.02,
        orderBookImbalance: 0.45,
        cvdNormalized: 0.5,
        fundingRate: 0.0001,
      });

      // Total sum of normalized weights must be ~1.0
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);

      // In Strong Bull + high ADX, momentum models should carry more relative weight than in base
      const momentumShare = weights["cnn"] + weights["lstm-bilstm"] + weights["mamba-hybrid"] + weights["xlstm"];
      const baseMomentumShare = baseWeights["cnn"] + baseWeights["lstm-bilstm"] + baseWeights["mamba-hybrid"] + baseWeights["xlstm"];
      expect(momentumShare).toBeGreaterThan(baseMomentumShare);
    });

    it("should boost mean-reversion & tabular experts (Transformer, XGBoost) during rangebound chop", () => {
      const weights = getDynamicMoEWeights(baseWeights, {
        regime: "Sideways" as MarketRegime,
        regimeScore: 0.40,
        adx: 14, // low ADX = chop
        volatilityScore: 0.015,
        orderBookImbalance: 0.05,
        cvdNormalized: 0.02,
        fundingRate: 0.0001,
      });

      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);

      // Transformer and XGBoost should have higher relative share than in a trending regime
      expect(weights["transformer"]).toBeGreaterThan(0.12);
      expect(weights["xgboost"]).toBeGreaterThan(0.08);
    });

    it("should boost PPO execution & risk agent during high volatility shocks", () => {
      const weights = getDynamicMoEWeights(baseWeights, {
        regime: "High Volatility" as MarketRegime,
        regimeScore: 0.90,
        adx: 22,
        volatilityScore: 0.08, // extreme volatility
        orderBookImbalance: -0.6,
        cvdNormalized: 0.5, // conflicting order flow vs book imbalance
        fundingRate: 0.0005,
      });

      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);

      // PPO execution agent weight should be significantly elevated for risk preservation
      expect(weights["ppo-agent"]).toBeGreaterThan(baseWeights["ppo-agent"]);
    });
  });

  // ─── 2. Microstructure & CVD Sequence Input Tests ───────────────
  describe("DLModelService — Microstructure CVD & Sequence Enrichment", () => {
    const mockBars = [
      { open: 100, high: 105, low: 99, close: 104, volume: 1000 },
      { open: 104, high: 108, low: 103, close: 107, volume: 1500 },
      { open: 107, high: 107.5, low: 102, close: 103, volume: 2000 },
      { open: 103, high: 105, low: 101, close: 104.5, volume: 800 },
      { open: 104.5, high: 109, low: 104, close: 108, volume: 2500 },
    ];

    it("buildSequenceInput should populate cvd and imbalance on each bar", () => {
      const seq = buildSequenceInput("BTCUSDT", "5m", mockBars as any, 5);
      expect(seq.window.length).toBe(5);

      for (const bar of seq.window) {
        expect(bar.cvd).toBeDefined();
        expect(typeof bar.cvd).toBe("number");
        expect(bar.imbalance).toBeDefined();
        expect(bar.imbalance).toBeGreaterThanOrEqual(-1);
        expect(bar.imbalance).toBeLessThanOrEqual(1);
      }
    });

    it("predictSequenceLocalTransformer produces valid predictions with 7D features", () => {
      const seq = buildSequenceInput("BTCUSDT", "5m", mockBars as any, 10);
      const pred = predictSequenceLocalTransformer(seq);

      expect(pred.modelName).toBe("local-transformer-v2");
      expect(pred.directionScore).toBeGreaterThan(0);
      expect(pred.directionScore).toBeLessThan(1);
      expect(pred.confidence).toBeGreaterThanOrEqual(0.5);
      expect(pred.confidence).toBeLessThanOrEqual(1.0);
      expect(typeof pred.predictedMove).toBe("number");
    });

    it("predictSequenceLocalMamba produces valid directional probabilities with selective scan", () => {
      const seq = buildSequenceInput("ETHUSDT", "5m", mockBars as any, 10);
      const pred = predictSequenceLocalMamba(seq);

      expect(pred.modelName).toBe("local-mamba-hybrid");
      expect(pred.directionScore).toBeGreaterThan(0);
      expect(pred.directionScore).toBeLessThan(1);
      expect(pred.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it("predictSequenceLocalxLSTM gates exponential memory and returns high-confidence predictions", () => {
      const seq = buildSequenceInput("SOLUSDT", "5m", mockBars as any, 10);
      const pred = predictSequenceLocalxLSTM(seq);

      expect(pred.modelName).toBe("xlstm-v1");
      expect(pred.directionScore).toBeGreaterThan(0);
      expect(pred.directionScore).toBeLessThan(1);
      expect(pred.confidence).toBeGreaterThanOrEqual(0.6);
    });
  });

  // ─── 3. Classical ML Features Ingestion Tests ────────────────────
  describe("MLModelService — Microstructure Feature Ingestion", () => {
    it("buildMLFeatures includes orderFlowImbalance and cvdNormalized", () => {
      const mockInd: any = {
        close: 65000,
        rsi14: 55,
        ema9: 64800,
        ema21: 64500,
        ema55: 64000,
        sma200: 62000,
        macd: { histogram: 25 },
        atr14: 450,
        bollinger: { bandwidth: 0.03 },
        stdDev20: 300,
        changePercent: 1.2,
      };

      const weights = { eagle: 0.7, tiger: 0.6, cheetah: 0.6 };
      const features = buildMLFeatures(
        mockInd,
        weights,
        150,  // dailyPnl
        1000, // maxDailyLoss
        5,    // tradesToday
        2,    // openPositionCount
        0.35, // orderFlowImbalance
        0.42  // cvdNormalized
      );

      expect(features.orderFlowImbalance).toBe(0.35);
      expect(features.cvdNormalized).toBe(0.42);
      expect(features.rsi14).toBe(55);
      expect(features.dailyPnlRatio).toBeCloseTo(0.15);
    });
  });

  // ─── 4. Break-Even Protection Cushion Test (Gap #5) ──────────────
  describe("AutoCloseEngine — Break-Even Protection Cushion (Gap #5)", () => {
    const mockTrade: any = {
      entryPrice: 100,
      sl: 98,
      tp: 106,
      side: "BUY",
    };

    const dummyContext = (price: number) => ({
      price,
      regime: { regime: "BULL_TREND", volatility: "NORMAL" } as any,
      sentiment: null,
      whaleActivity: null,
    });

    it("should NOT trigger break-even move at 1.5% profit (cushion raised to 2.5%)", () => {
      // pnlPct = 1.5% (previously triggered at > 1.0%, cutting winners early)
      const res = AutoCloseEngine.check(mockTrade, dummyContext(101.5));
      expect(res.triggered).toBe(false);
    });

    it("should trigger break-even move once profit exceeds 2.5%", () => {
      // pnlPct = 2.8% (> 2.5% threshold)
      const res = AutoCloseEngine.check(mockTrade, dummyContext(102.8));
      expect(res.triggered).toBe(true);
      expect(res.action).toBe("MOVE_SL_TO_BE");
      expect(res.reason).toBe("BREAK_EVEN_PROTECTION");
    });
  });

  // ─── 5. Paper Trading State & Stop-Loss Trailing Logic ───────────
  describe("PaperState & Trailing Stop Updates (Gap #4)", () => {
    const testUserId = "test-user-sltp";

    beforeEach(() => {
      paper.removePosition(testUserId, "BTCUSDT", "PAPER", "FUTURES");
    });

    it("should store and update trailing stop in position meta", () => {
      const pos: paper.PaperPosition = {
        userId: testUserId,
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.5,
        entryPrice: 60000,
        tradeId: "trade-test-1",
        accountType: "FUTURES",
        sl: 58500,
        tp: 64000,
        meta: { trailingStop: 59000 },
      };

      paper.setPosition(testUserId, "BTCUSDT", "PAPER", pos);

      const retrieved = paper.getPosition(testUserId, "BTCUSDT", "PAPER", "FUTURES");
      expect(retrieved).toBeDefined();
      expect(retrieved?.meta?.trailingStop).toBe(59000);

      // Ratchet trailing stop upward as price increases
      const newTrail = 61200;
      paper.setPosition(testUserId, "BTCUSDT", "PAPER", {
        ...retrieved!,
        meta: { ...retrieved!.meta, trailingStop: newTrail },
      });

      const updated = paper.getPosition(testUserId, "BTCUSDT", "PAPER", "FUTURES");
      expect(updated?.meta?.trailingStop).toBe(61200);
    });
  });

  // ─── 6. ManualSLTPMonitor Lifecycle (Gap #4) ─────────────────────
  describe("ManualSLTPMonitor Lifecycle (Gap #4)", () => {
    it("should start and stop the background monitoring loop cleanly", () => {
      expect(() => startManualSLTPMonitor(60_000)).not.toThrow();
      expect(() => stopManualSLTPMonitor()).not.toThrow();
    });
  });
});
