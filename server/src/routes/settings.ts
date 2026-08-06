/*
 * ─── Settings routes ───────────────────────────────────
 *
 * GET  /settings/get    – fetch user settings
 * PUT  /settings/update – partial update
 */
import { Router } from "express";
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import { Settings } from "../models/Settings.js";
import * as paper from "../services/paperState.js";

import mongoose from "mongoose";

const router = Router();

router.get("/get", authGuard, async (req: AuthRequest, res) => {
  try {
    let settings: any = {
      defaultMode: "PAPER",
      allowedSymbols: ["BTCUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT", "SOLUSDT"],
      riskConfig: { maxPositionSizePct: 33, defaultSL: 2, defaultTP: 5 },
      autoTradeThreshold:      65,
      shortScoreThreshold:     35,
      adxMinimum:              15,
      saraswatiAlphaThreshold: 45,
      driftHaltThreshold:      80,
      driftReduceThreshold:    60,
      alertsConfig: { telegramEnabled: false, emailEnabled: false },
      tradingFeatures: { autoTradeEnabled: false, trailingStopEnabled: false },
    };

    if (mongoose.connection.readyState === 1) {
      settings = (await Settings.findOne({ userId: req.userId }).lean()) || settings;
    }

    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const ALLOWED_SETTINGS_FIELDS = new Set([
  "defaultMode", "accountType", "allowedSymbols", "primarySymbol",
  "riskConfig", "autoTrade", "autoTradeThreshold", "tradingFeatures",
  "alertsConfig", "behaviorWeights", "chartPreferences", "theme",
  "notifications", "sessionTimeout",
  // Engine/AI toggles (previously dropped by the filter, so they never persisted)
  "highPrecisionMode", "noLossMode", "overdrive", "bypassHtfTrendGate",
  "bypassChecklist", "bypassConsensusLag", "dynamicGuardian", "dynamicWeights",
  "dynamicAnimals", "useEnsemble", "ensembleMode", "aiConsensusGate",
  "taFallbackEnabled", "taFallbackScope", "behaviourModelEnabled",
  // AQEA voting-layer toggles (per-user, previously hardcoded in AQEA_CONFIG)
  "orderFlowVotingEnabled", "smartMoneyVotingEnabled", "liveNewsSentimentEnabled", "cnnVotingEnabled", "lstmVotingEnabled",
  "mambaVotingEnabled", "lnnVotingEnabled", "transformerVotingEnabled", "ppoVotingEnabled",
  "gayatriVotingEnabled", "ohmkaraVotingEnabled", "lakshmiVotingEnabled",
  "aiPredictorsEnabled", "transitionOverrideEnabled",
  // Angel One SmartAPI Credentials (NSE / BSE Indian Market)
  "angelOneApiKey", "angelOneClientCode", "angelOnePin", "angelOneTotpSecret", "angelOneDisabled",
  // AI threshold controls — all come from DB, no hardcoding
  "shortScoreThreshold", "aiFlipExitMinProfitR", "adxMinimum", "saraswatiAlphaThreshold",
  "driftHaltThreshold", "driftReduceThreshold",
]);

// Allow dotted sub-document keys (e.g. "riskConfig.dynamicSLTP") for partial nested updates.
function isAllowedField(key: string): boolean {
  if (ALLOWED_SETTINGS_FIELDS.has(key)) return true;
  if (key.startsWith("riskConfig.") || key.startsWith("chartSettings.")) return true;
  return false;
}

router.put("/update", authGuard, async (req: AuthRequest, res) => {
  try {
    const safeUpdate: Record<string, unknown> = {};
    for (const key of Object.keys(req.body)) {
      if (isAllowedField(key)) {
        safeUpdate[key] = req.body[key];
      }
    }
    if (Object.keys(safeUpdate).length === 0) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    // 🛡️ Removing a symbol from allowedSymbols silently stops ALL exit
    // monitoring for it (SL/TP/trailing-stop/AI-exit — see
    // autoTradeEngine.ts's processSymbol, only ever called for symbols
    // still in this list). In LIVE mode there is no exchange-side stop
    // order backing any of that, so an open position on a removed symbol
    // would be left completely unprotected. Block the removal instead of
    // silently accepting it.
    if (Array.isArray(safeUpdate.allowedSymbols)) {
      const current = await Settings.findOne({ userId: req.userId }).lean();
      const currentSymbols: string[] = (current as any)?.allowedSymbols ?? [];
      const nextSymbols: string[] = safeUpdate.allowedSymbols as string[];
      const removed = currentSymbols.filter((s) => !nextSymbols.includes(s));

      if (removed.length > 0) {
        const openSymbols = new Set<string>();
        for (const mode of ["PAPER", "LIVE"] as const) {
          for (const pos of paper.getOpenPositions(req.userId!, mode)) {
            if (removed.includes(pos.symbol)) openSymbols.add(pos.symbol);
          }
        }
        if (openSymbols.size > 0) {
          return res.status(400).json({
            error: `Cannot remove ${[...openSymbols].join(", ")} — open position${openSymbols.size > 1 ? "s" : ""} still active. Close the position first, then remove the symbol.`,
            blockedSymbols: [...openSymbols],
          });
        }
      }
    }

    const doc = await Settings.findOneAndUpdate(
      { userId: req.userId },
      { $set: safeUpdate },
      { new: true, upsert: true, runValidators: true },
    );
    res.json(doc);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
