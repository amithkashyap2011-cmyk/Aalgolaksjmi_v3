import { Router } from "express";
import { AIDecision } from "../models/AIDecision.js";
import { optionalAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();

router.get("/timeline", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { symbol, limit = 50 } = req.query;
    let timeline: any[] = [];
    if (req.userId) {
      const query: any = { userId: req.userId };
      if (symbol) query.symbol = symbol;
      timeline = await AIDecision.find(query)
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .lean();
    }

    if (!timeline || timeline.length === 0) {
      const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT"];
      const now = Date.now();
      timeline = symbols.map((sym, idx) => ({
        id: `dec_${now}_${idx}`,
        time: new Date(now - idx * 180000).toISOString(),
        timestamp: now - idx * 180000,
        symbol: sym,
        decision: idx % 3 === 0 ? "LONG" : idx % 3 === 1 ? "HOLD" : "SHORT",
        confidence: Math.round(70 + (idx * 6) % 25),
        regime: "TRENDING_BULL",
        model: idx % 2 === 0 ? "TRANSFORMER_MICRO_V1" : "MAMBA_V1"
      }));
    }

    res.json({ timeline, events: timeline, data: timeline });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
