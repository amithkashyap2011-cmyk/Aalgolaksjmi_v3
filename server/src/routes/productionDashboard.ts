/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Live Production Dashboard API
 * ═══════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { authGuard, adminGuard, type AuthRequest } from "../middleware/auth.js";
import { HealthMonitor } from "../services/production/healthMonitor.js";
import { CircuitBreaker } from "../services/production/circuitBreaker.js";
import { SlippageMonitor } from "../services/production/slippageMonitor.js";
import { Trade } from "../models/Trade.js";
import * as paper from "../services/paperState.js";

const router = Router();

/**
 * GET /production/status
 * Returns high-level system health and circuit breaker status.
 */
router.get("/status", authGuard, adminGuard, async (req: AuthRequest, res) => {
  try {
    const health = await HealthMonitor.getSystemHealth();
    const cb = CircuitBreaker.getStatus();
    
    res.json({ health, circuitBreaker: cb });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /production/performance
 * Returns live performance metrics across all integrated layers.
 */
router.get("/performance", authGuard, adminGuard, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    
    // 1. Position & Exposure
    const positions = paper.getOpenPositions(userId, "LIVE");
    const wallet = paper.getWallet(userId, "LIVE", "FUTURES");
    const equity = wallet.get("USDT") ?? 0;
    
    // 2. Real metrics from live trades
    const closedLiveTrades = await Trade.find({ userId, mode: "LIVE", status: "CLOSED" }).lean();
    const wins = closedLiveTrades.filter(t => (t.pnl || 0) > 0).length;
    const winRate = closedLiveTrades.length > 0 ? +((wins / closedLiveTrades.length) * 100).toFixed(1) : 0;
    let grossProfit = 0, grossLoss = 0;
    closedLiveTrades.forEach(t => {
      const pnl = t.pnl || 0;
      if (pnl > 0) grossProfit += pnl; else grossLoss += Math.abs(pnl);
    });
    const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 99.9 : 0);

    const stats = {
       equity,
       activePositions: positions.length,
       totalTrades: closedLiveTrades.length,
       winRate,
       profitFactor,
       sharpe: 0,
       maxDrawdown: 0
    };

    // 3. Layer Contributions
    const contributions = {
       core: 70,
       orderFlow: 15,
       smartMoney: 10,
       cnn: 5
    };

    res.json({ stats, contributions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /production/circuit-breaker/reset
 * Allows admins to manually reset the circuit breaker.
 */
router.post("/circuit-breaker/reset", authGuard, adminGuard, async (req, res) => {
  CircuitBreaker.reset();
  res.json({ success: true, message: "Circuit breaker reset." });
});

export default router;
