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
    
    // 2. Win Rate & PF (Mocked for Ph 6A template)
    const stats = {
       equity,
       activePositions: positions.length,
       totalTrades: 5142,
       winRate: 64.8,
       profitFactor: 2.32,
       sharpe: 2.24,
       maxDrawdown: 3.4
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
