const fs = require('fs');

let content = fs.readFileSync('server/src/services/autoTradeEngine.ts', 'utf8');

const targetFuncStart = content.indexOf('async function processSymbol(');
const targetFuncEnd = content.indexOf('/* ── LONG handler ─────────────────────────────────────── */');

if (targetFuncStart !== -1 && targetFuncEnd !== -1) {
  let funcBody = content.substring(targetFuncStart, targetFuncEnd);

  // We construct the correct body
  const correctFuncBody = `async function processSymbol(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: "SPOT" | "FUTURES",
  settings: ISettings,
): Promise<void> {
  // Check cooldown
  const cooldownKey = userId + ":" + symbol;
  const expiry = cooldowns.get(cooldownKey) || 0;
  if (expiry > Date.now()) {
    console.log("[COOLDOWN] ACTIVE symbol=" + symbol);
    return;
  }

  /* 1. Build Context (Legacy Fetcher) */
  const ctx = await agent.buildContext(symbol, mode, userId);
  
  /* 2. AQEA CORE DECISION (SOLE AUTHORITY) */
  const avgVol = ctx.bars.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20;
  let btcDom = 53.5;
  try {
    const p = await binance.getTickerPriceSync("BTCDOMUSDT", true);
    if (p) btcDom = p;
  } catch (err) {}

  const perfMetrics = await AnalyticsCache.getPerformanceMetrics(userId, symbol);

  const aqeaDecision = await AQEAEngine.decide(symbol, userId, {
    mode,
    accountType,
    currentPrice: ctx.ind.close,
    indicators: ctx.ind,
    bars: ctx.bars,
    marketData: {
      btcDominance: btcDom,
      fundingRate: ctx.fundingRate || 0,
      volumeAvg: avgVol
    },
    performance: {
      winRate: (perfMetrics.winRate / 100) || 0.50,
      rewardRisk: perfMetrics.profitFactor || 1.5
    }
  });

  // Emit real-time decision for dashboard
  UITelemetryService.emitDecision(userId, symbol, aqeaDecision);

  // 1. Regime Detection (V8.0)
  const regime = RegimeDetectionEngine.detect({ trendStrength: 65, volatility: 0.12 });

  // 2. Trade Quality Scoring (V8.0)
  const quality = TradeQualityEngine.calculateScore({ trendStrength: 65, confidence: aqeaDecision.confidence / 100, atrStatus: 'STABLE' });

  if (quality.rating === "REJECT") {
     return;
  }

  // Calculate Adaptive Risk Profile (V8.0)
  const currentHeat = 8.4; // Simplified for logic integration
  let riskProfile: any = null;
  if (aqeaDecision.decision !== "HOLD") {
    riskProfile = AdaptiveRiskEngine.calculate(
      aqeaDecision.decision === "LONG" ? "BUY" : "SELL",
      quality, 
      regime, 
      currentHeat, 
      { entry: ctx.ind.close, atr: ctx.ind.atr14 || ctx.ind.close * 0.01 }
    );
  }

  /* 3. Shadow Simulation */
  if (aqeaDecision.decision !== "HOLD") {
    ShadowSimulator.openPosition(
      userId, symbol, 
      aqeaDecision.decision === "LONG" ? "BUY" : "SELL", 
      ctx.ind.close, 
      { tp1: riskProfile.tp1, tp2: riskProfile.tp2, tp3: riskProfile.tp3, sl: riskProfile.sl },
      riskProfile.positionSize / ctx.ind.close
    );
  }
  await ShadowSimulator.update(userId, symbol, ctx.ind.close);

  /* 4. Log decision as alert */
  await Alert.create({
    userId,
    severity: aqeaDecision.decision === "LONG" ? "GREEN" : aqeaDecision.decision === "HOLD" ? "GREEN" : "AMBER",
    symbol,
    title: "AQEA v3.0: " + aqeaDecision.decision,
    message: "Score=" + aqeaDecision.confidence,
  });

  /* 5. Act on decision (ENTRY) */
  if (aqeaDecision.decision === "LONG") {
    await handleLong(userId, symbol, mode, settings, aqeaDecision, riskProfile);
  } else if (aqeaDecision.decision === "SHORT") {
    await handleShort(userId, symbol, mode, settings, aqeaDecision, riskProfile);
  }
  
  /* 6. EXIT MONITORING (V4.0 Dynamic AI Position Management) */
  const pos = paper.getPosition(userId, symbol, mode, accountType);
  if (pos) {
      // V8.0 AI Auto Close Engine
      let autoCloseTrigger = { triggered: false, reason: "", action: "" };
      try {
         const { AutoCloseEngine } = await import("./autoCloseEngine.js");
         autoCloseTrigger = AutoCloseEngine.check(await Trade.findById(pos.tradeId) as any, {
           price: ctx.ind.close,
           regime,
           sentiment: { fearGreed: 72 }, // Mocked
           whaleActivity: { dumpDetected: false } // Mocked
         });
      } catch(e) {}

      if (autoCloseTrigger.triggered) {
          if (autoCloseTrigger.action === "CLOSE") {
             await handleExit(userId, symbol, mode, accountType, autoCloseTrigger.reason);
             return;
          } else if (autoCloseTrigger.action === "MOVE_SL_TO_BE") {
             pos.sl = pos.entryPrice;
             paper.setPosition(userId, symbol, mode, pos);
             await Trade.findByIdAndUpdate(pos.tradeId, { sl: pos.sl, autoCloseStatus: "TRIGGERED" });
          }
      }

      // V4.0 AI Position Manager
      const managementSignal = PositionManager.evaluate(
        userId, symbol, 
        {
          side: pos.side as any,
          entryPrice: pos.entryPrice,
          tp1: pos.tp || 0,
          tp2: pos.tp || 0,
          tp3: pos.tp || 0,
          sl: pos.sl || 0,
          tp1Hit: pos.meta?.tp1Hit || false,
          tp2Hit: pos.meta?.tp2Hit || false,
          tp3Hit: pos.meta?.tp3Hit || false
        },
        aqeaDecision,
        ctx.ind.close,
        ctx.ind.atr14 || 0
      );

      if (managementSignal.action === "CLOSE_FULL") {
          await handleExit(userId, symbol, mode, accountType, managementSignal.reason);
          return;
      } else if (managementSignal.action === "CLOSE_PARTIAL") {
          await handleExit(userId, symbol, mode, accountType, managementSignal.reason);
          return;
      } else if (managementSignal.action === "MODIFY_STOP" && managementSignal.newStopLoss) {
          pos.sl = managementSignal.newStopLoss;
          paper.setPosition(userId, symbol, mode, pos);
          await Trade.findByIdAndUpdate(pos.tradeId, { sl: pos.sl });
      } else if (managementSignal.action === "EXTEND_TP" && managementSignal.newTakeProfit) {
          pos.tp = managementSignal.newTakeProfit;
          paper.setPosition(userId, symbol, mode, pos);
          await Trade.findByIdAndUpdate(pos.tradeId, { tp: pos.tp });
      }

      // 7. Fallback to static ExitEngine (for hard SL/TP checks)
      const exitSignal = ExitEngine.evaluateExit(ctx.ind.close, {
          side: pos.side as any,
          entryPrice: pos.entryPrice,
          tp1: pos.tp || 0,
          tp2: pos.tp || 0,
          tp3: pos.tp || 0,
          sl: pos.sl || 0,
          tp1Hit: pos.meta?.tp1Hit || false, 
          tp2Hit: pos.meta?.tp2Hit || false, 
          tp3Hit: pos.meta?.tp3Hit || false 
      });

      if (exitSignal.shouldExit) {
          await handleExit(userId, symbol, mode, accountType, exitSignal.reason);
      }
  }
}

`;

  const newContent = content.substring(0, targetFuncStart) + correctFuncBody + content.substring(targetFuncEnd);
  fs.writeFileSync('server/src/services/autoTradeEngine.ts', newContent, 'utf8');
  console.log("Successfully patched processSymbol in autoTradeEngine.ts");
} else {
  console.error("Could not find function bounds.");
}
