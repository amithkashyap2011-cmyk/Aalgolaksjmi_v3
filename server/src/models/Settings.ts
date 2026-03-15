/*
 * ─── Settings model ───────────────────────────────────
 *
 * Per‑user risk config, behavior weights, chart settings.
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IRiskConfig {
  maxDailyLoss: number;       // e.g. 100 USDT
  maxPositionSizePct: number; // e.g. 21 (%)
  defaultSL: number;          // % below entry
  defaultTP: number;          // % above entry
  trailingSL: number;         // trailing stop %
}

export interface IBehaviorWeights {
  eagle: number;
  tiger: number;
  cheetah: number;
  fox: number;
  tortoise: number;
  dog: number;
  owl: number;
  cow: number;
  spider: number;
  lion: number;
  om_chant: number;
  gayatri_mantra: number;
  aaryan: number;
  aayush: number;
  lakshmi_hybrid: number;
}

export interface IChartSettings {
  showFibZones: boolean;
  defaultTimeframe: string;
  darkMode: boolean;
}

export interface ISettings extends Document {
  userId: Types.ObjectId;
  defaultMode: "PAPER" | "LIVE" | "BACKTEST";
  allowedSymbols: string[];
  riskConfig: IRiskConfig;
  behaviorWeights: IBehaviorWeights;
  chartSettings: IChartSettings;
}

const SettingsSchema = new Schema<ISettings>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  defaultMode: { type: String, enum: ["PAPER", "LIVE", "BACKTEST"], default: "PAPER" },
  allowedSymbols: {
    type: [String],
    default: ["DOGEUSDT", "SHIBUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT"],
  },
  riskConfig: {
    type: new Schema(
      {
        maxDailyLoss: { type: Number, default: 100 },
        maxPositionSizePct: { type: Number, default: 21 },
        defaultSL: { type: Number, default: 2 },
        defaultTP: { type: Number, default: 4 },
        trailingSL: { type: Number, default: 1 },
      },
      { _id: false },
    ),
    default: () => ({}),
  },
  behaviorWeights: {
    type: new Schema(
      {
        eagle: { type: Number, default: 50 },
        tiger: { type: Number, default: 50 },
        cheetah: { type: Number, default: 50 },
        fox: { type: Number, default: 50 },
        tortoise: { type: Number, default: 50 },
        dog: { type: Number, default: 50 },
        owl: { type: Number, default: 50 },
        cow: { type: Number, default: 50 },
        spider: { type: Number, default: 50 },
        lion: { type: Number, default: 50 },
        om_chant: { type: Number, default: 50 },
        gayatri_mantra: { type: Number, default: 50 },
        aaryan: { type: Number, default: 50 },
        aayush: { type: Number, default: 50 },
        lakshmi_hybrid: { type: Number, default: 50 },
      },
      { _id: false },
    ),
    default: () => ({}),
  },
  chartSettings: {
    type: new Schema(
      {
        showFibZones: { type: Boolean, default: true },
        defaultTimeframe: { type: String, default: "5m" },
        darkMode: { type: Boolean, default: false },
      },
      { _id: false },
    ),
    default: () => ({}),
  },
});

export const Settings = mongoose.model<ISettings>("Settings", SettingsSchema);
