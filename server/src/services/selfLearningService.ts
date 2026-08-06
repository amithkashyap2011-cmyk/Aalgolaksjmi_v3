/*
 * ─── Self-Learning Service ────────────────────────────
 *
 * Tracks trade outcomes and produces decay / retrain signals.
 * Stores trade meta for entry/exit/slippage/latency.
 */

import { Trade } from "../models/Trade.js";
import mongoose from "mongoose";

export interface SelfLearningSummary {
  retrainWeekly: boolean;
  strategyDecayDetected: boolean;
  regimeChangeDetected: boolean;
  overfittingRisk: boolean;
  notes: string[];
}

export async function summarize(userId?: string | null): Promise<SelfLearningSummary> {
  if (!userId || mongoose.connection.readyState !== 1) {
    return {
      retrainWeekly: false,
      strategyDecayDetected: false,
      regimeChangeDetected: false,
      overfittingRisk: false,
      notes: ["User not authenticated or database unavailable. Self-learning summary unavailable."],
    };
  }

  const closedTrades = await Trade.find({ userId, status: "CLOSED" }).sort({ closedAt: -1 }).limit(120).lean();
  if (!closedTrades.length) {
    return {
      retrainWeekly: true,
      strategyDecayDetected: false,
      regimeChangeDetected: false,
      overfittingRisk: false,
      notes: ["No closed trades available, defaulting to weekly retrain signal."],
    };
  }

  const recent = closedTrades.slice(0, 20);
  const prior = closedTrades.slice(20, 60);
  const recentProfit = recent.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const priorProfit = prior.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const recentWinRate = recent.length ? recent.filter((trade) => (trade.pnl ?? 0) > 0).length / recent.length : 0;
  const priorWinRate = prior.length ? prior.filter((trade) => (trade.pnl ?? 0) > 0).length / prior.length : 0;

  const decay = priorProfit > 0 && recentProfit < priorProfit * 0.75;
  const regimeChange = Math.abs(recentWinRate - priorWinRate) > 0.15;
  const overfit = recentWinRate > 0.88 && priorWinRate < recentWinRate - 0.12;

  const notes = [
    `Recent return: ${recentProfit.toFixed(2)} USDT`,
    `Recent win rate: ${(recentWinRate * 100).toFixed(1)}%`,
  ];
  if (decay) notes.push("Strategy decay detected: schedule model retrain and regime review.");
  if (regimeChange) notes.push("Regime drift detected between recent and prior windows.");
  if (overfit) notes.push("Overfitting risk detected: strong recent win-rate exceeds prior performance materially.");

  return {
    retrainWeekly: true,
    strategyDecayDetected: decay,
    regimeChangeDetected: regimeChange,
    overfittingRisk: overfit,
    notes,
  };
}

export async function recordTradeMetrics(tradeId: string, slippage: number, latencyMs: number): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  await Trade.updateOne(
    { _id: tradeId },
    { $set: { "meta.executionMetrics": { slippage, latencyMs, recordedAt: new Date() } } },
  );
}
