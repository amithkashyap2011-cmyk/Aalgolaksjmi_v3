import { Router } from "express";
import { Trade } from "../models/Trade.js";

const router = Router();

// Simple in-memory cache
let statsCache: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds

router.get("/trade-stats", async (req, res) => {
  try {
    const now = Date.now();
    if (statsCache && (now - lastFetchTime) < CACHE_TTL) {
      return res.json(statsCache);
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [liveTrades, backtestTrades, liveTradesToday, backtestTradesToday] = await Promise.all([
      Trade.countDocuments({ mode: "LIVE" }),
      Trade.countDocuments({ mode: "PAPER" }),
      Trade.countDocuments({ mode: "LIVE", openedAt: { $gte: startOfDay } }),
      Trade.countDocuments({ mode: "PAPER", openedAt: { $gte: startOfDay } })
    ]);

    statsCache = {
      liveTrades,
      backtestTrades,
      liveTradesToday,
      backtestTradesToday
    };
    lastFetchTime = now;

    res.json(statsCache);
  } catch (error: any) {
    console.error("[Dashboard Route Error]", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

export default router;
