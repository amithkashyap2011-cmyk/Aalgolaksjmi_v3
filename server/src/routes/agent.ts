/*
 * ─── Agent routes ──────────────────────────────────────
 *
 * GET  /agent/quantum/recommendation?symbol=X&mode=Y
 * POST /agent/auto/enable
 * POST /agent/auto/disable
 * GET  /agent/auto/status
 *
 * NOTE: the legacy GET /agent/recommendation (rule-based recommend() with the
 * animal-model + checklist scoring) was retired — it was never called by the UI
 * and the live engine uses AQEAEngine.decide(). The quantum endpoint below is the
 * sole recommendation surface.
 */
import { Router } from "express";
import { authGuard, optionalAuth, type AuthRequest } from "../middleware/auth.js";
import { AgentOrchestrator } from "../services/quantum/agentOrchestrator.js";
import * as autoEngine from "../services/autoTradeEngine.js";
import { Settings } from "../models/Settings.js";
import mongoose from "mongoose";

const router = Router();

/* ── recommendation (quantum orchestrator) ────────────── */

router.get("/quantum/recommendation", authGuard, async (req: AuthRequest, res) => {
  try {
    const symbol = (req.query?.symbol as string) || "BTCUSDT";
    const mode = ((req.query?.mode as string) || "PAPER") as "PAPER" | "LIVE";
    const exchange = (req.query?.exchange as string) || "binance";
    const orchestrator = AgentOrchestrator.getInstance();
    const result = await orchestrator.run(symbol, exchange, req.userId!, mode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── auto‑trade control ──────────────────────────────── */

router.post("/auto/enable", authGuard, async (req: AuthRequest, res) => {
  const primarySymbol = (req.body?.primarySymbol as string) || null;
  const rawAcct = req.body?.accountType;
  const accountType: "SPOT" | "FUTURES" | "BOTH" = (rawAcct === "SPOT" || rawAcct === "BOTH") ? rawAcct : "FUTURES";
  console.log(`[api] /auto/enable called for user: ${req.userId} | accountType: ${accountType} | primary: ${primarySymbol}`);

  // Persist to DB — use $setOnInsert to ensure userId is always set on new docs
  const updateFields: Record<string, boolean> = { autoTrade: true };
  if (accountType === "BOTH") {
    updateFields.autoTradeSpot = true;
    updateFields.autoTradeFutures = true;
  } else if (accountType === "SPOT") {
    updateFields.autoTradeSpot = true;
  } else {
    updateFields.autoTradeFutures = true;
  }

  await Settings.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(req.userId!) },
    {
      $set: updateFields,
      $setOnInsert: { userId: new mongoose.Types.ObjectId(req.userId!) }
    },
    { upsert: true, new: true }
  );

  autoEngine.enableUser(req.userId!, accountType);
  if (primarySymbol) {
    autoEngine.setPrimarySymbol(req.userId!, primarySymbol);
  }

  // Trigger immediate cycle for instant reactive execution
  if (accountType === "BOTH") {
    autoEngine.processUser(req.userId!, "SPOT").catch(console.error);
    autoEngine.processUser(req.userId!, "FUTURES").catch(console.error);
  } else {
    autoEngine.processUser(req.userId!, accountType).catch(console.error);
  }
  res.json({ autoTrade: true, accountType, primarySymbol });
});

router.post("/auto/disable", authGuard, async (req: AuthRequest, res) => {
  const rawAcct = req.body?.accountType;
  const accountType: "SPOT" | "FUTURES" | "BOTH" = (rawAcct === "SPOT" || rawAcct === "BOTH") ? rawAcct : "FUTURES";
  autoEngine.disableUser(req.userId!, accountType);

  const disableFields: Record<string, boolean> = {};
  if (accountType === "BOTH") {
    disableFields.autoTrade = false;
    disableFields.autoTradeSpot = false;
    disableFields.autoTradeFutures = false;
  } else if (accountType === "SPOT") {
    disableFields.autoTradeSpot = false;
  } else {
    disableFields.autoTradeFutures = false;
  }
  const field = accountType === "SPOT" ? "autoTradeSpot" : "autoTradeFutures";
  await Settings.updateOne(
    { userId: new mongoose.Types.ObjectId(req.userId!) },
    { $set: { [field]: false, autoTrade: autoEngine.isEnabledAny(req.userId!) } }
  );

  res.json({ autoTrade: false, accountType });
});

router.get("/auto/status", optionalAuth, async (req: AuthRequest, res) => {
  const userId = req.userId || "6a39c0e7a5e2995ed257ca68";
  const spot = autoEngine.isEnabled(userId, "SPOT");
  const futures = autoEngine.isEnabled(userId, "FUTURES");
  res.json({ autoTrade: spot || futures, spot, futures });
});

export default router;
