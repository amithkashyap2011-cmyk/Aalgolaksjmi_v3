/*
 * ─── Agent routes ──────────────────────────────────────
 *
 * GET  /agent/recommendation?symbol=X&mode=Y
 * POST /agent/auto/enable
 * POST /agent/auto/disable
 * GET  /agent/auto/status
 */
import { Router } from "express";
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import { recommend } from "../services/agentService.js";
import * as autoEngine from "../services/autoTradeEngine.js";

const router = Router();

/* ── recommendation ───────────────────────────────────── */

router.get("/recommendation", authGuard, async (req: AuthRequest, res) => {
  try {
    const symbol = (req.query?.symbol as string) || "DOGEUSDT";
    const mode = ((req.query?.mode as string) || "PAPER") as "PAPER" | "LIVE";
    const result = await recommend(symbol, mode, req.userId!);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── auto‑trade control ──────────────────────────────── */

router.post("/auto/enable", authGuard, async (req: AuthRequest, res) => {
  autoEngine.enableUser(req.userId!);
  res.json({ autoTrade: true });
});

router.post("/auto/disable", authGuard, async (req: AuthRequest, res) => {
  autoEngine.disableUser(req.userId!);
  res.json({ autoTrade: false });
});

router.get("/auto/status", authGuard, async (req: AuthRequest, res) => {
  res.json({ autoTrade: autoEngine.isEnabled(req.userId!) });
});

export default router;
