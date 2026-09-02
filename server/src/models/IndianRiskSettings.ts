/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives Risk Settings & Kill Switch Mongoose Model
 * ═══════════════════════════════════════════════════════════════════
 */

import mongoose, { Schema, Document } from "mongoose";

export interface IIndianRiskSettings extends Document {
  userId: string;
  autoTrade: boolean;
  niftyAutoTrade: boolean;
  bankNiftyAutoTrade: boolean;
  optionsAutoTrade: boolean;
  futuresAutoTrade: boolean;
  maxRiskPerTradePercent: number;
  maxDailyLossPercent: number;
  maxDailyLossAmount: number;
  maxTradesPerDay: number;
  maxConcurrentTrades: number;
  maxNiftyTrades: number;
  maxBankNiftyTrades: number;
  maxConsecutiveLosses: number;
  strategyCooldownMinutes: number;
  maxCapitalUtilizationPercent: number;
  panicStop: boolean;
  dailyRiskLock: boolean;
  lastDailyResetDate: string;
  updatedAt: Date;
}

const IndianRiskSettingsSchema = new Schema<IIndianRiskSettings>({
  userId: { type: String, required: true, unique: true, default: "guest-user" },
  autoTrade: { type: Boolean, default: false },
  niftyAutoTrade: { type: Boolean, default: true },
  bankNiftyAutoTrade: { type: Boolean, default: true },
  optionsAutoTrade: { type: Boolean, default: true },
  futuresAutoTrade: { type: Boolean, default: false },
  maxRiskPerTradePercent: { type: Number, default: 1.0 },
  maxDailyLossPercent: { type: Number, default: 3.0 },
  maxDailyLossAmount: { type: Number, default: 5000 },
  maxTradesPerDay: { type: Number, default: 10 },
  maxConcurrentTrades: { type: Number, default: 3 },
  maxNiftyTrades: { type: Number, default: 2 },
  maxBankNiftyTrades: { type: Number, default: 2 },
  maxConsecutiveLosses: { type: Number, default: 3 },
  strategyCooldownMinutes: { type: Number, default: 15 },
  maxCapitalUtilizationPercent: { type: Number, default: 50 },
  panicStop: { type: Boolean, default: false },
  dailyRiskLock: { type: Boolean, default: false },
  lastDailyResetDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  updatedAt: { type: Date, default: Date.now },
});

export const IndianRiskSettings = mongoose.model<IIndianRiskSettings>(
  "IndianRiskSettings",
  IndianRiskSettingsSchema
);
