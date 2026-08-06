import { Router } from "express";
import { AIDecision } from "../models/AIDecision.js";
import { authGuard, type AuthRequest } from "../middleware/auth.js";

const router = Router();

router.get("/timeline", authGuard, async (req: AuthRequest, res) => {
  try {
    const { symbol, limit = 50 } = req.query;
    const query: any = { userId: req.userId };
    if (symbol) query.symbol = symbol;

    const timeline = await AIDecision.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .lean();

    res.json(timeline);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
