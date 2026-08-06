/*
 * ─── Settings model ───────────────────────────────────
 *
 * Per‑user risk config, behavior weights, chart settings.
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IRiskConfig {
  maxDailyLoss: number;       // e.g. 100 USDT
  // A daily loss limit was already implemented and enforced (checklist.ts's
  // R2, trading.ts's manual place-order hard block) — but nothing capped
  // cumulative loss over a rolling week or month, so a string of daily
  // losses each individually under the daily cap could still compound into
  // a much larger drawdown with no circuit breaker catching it.
  maxWeeklyLoss: number;      // e.g. 300 USDT
  maxMonthlyLoss: number;     // e.g. 800 USDT
  maxPositionSizePct: number; // e.g. 21 (%)
  defaultSL: number;          // % below entry
  defaultTP: number;          // % above entry
  trailingSL: number;         // trailing stop %
  defaultLeverage: number;    // x1‑x125
  maxConcurrentPositions: number; // max simultaneous open positions (1–30)

  // V8.0 Institutional Risk
  maxPortfolioHeat: number;
  capitalPreservationMode: boolean;
  riskEngineEnabled: boolean;
  autoCloseEnabled: boolean;
  dynamicSLTP: boolean;
  multiStageTP: boolean;
}

export interface IBehaviorWeights {
  eagle: number;
  tiger: number;
  cheetah: number;
  fox: number;
  tortoise: number;
  dog: number;
  owl: number;
  om_chant: number;
  gayatri_mantra: number;
  aaryan: number;
  aayush: number;
  lakshmi_hybrid: number;
  // Legacy fields (kept in DB, ignored in scoring)
  cow?: number;
  spider?: number;
  lion?: number;
}

export interface IChartSettings {
  showFibZones: boolean;
  defaultTimeframe: string;
  darkMode: boolean;
  density: "COMPACT" | "COMFORTABLE" | "SPACIOUS";
}

export interface ISettings extends Document {
  userId: Types.ObjectId;
  defaultMode: "PAPER" | "LIVE" | "BACKTEST";
  allowedSymbols: string[];
  riskConfig: IRiskConfig;
  behaviorWeights: IBehaviorWeights;
  chartSettings: IChartSettings;
  autoTrade: boolean;
  accountType: "SPOT" | "FUTURES" | "BOTH";
  /** Independent per-account-type auto-trade toggles — lets SPOT and
   * FUTURES run concurrently instead of the single `accountType`/`autoTrade`
   * pair only ever describing one active leg at a time. `accountType`
   * above is kept as the legacy "default" account type for code that still
   * expects a single value (deposits, older UI reads). */
  autoTradeSpot: boolean;
  autoTradeFutures: boolean;
  highPrecisionMode: boolean;
  bypassHtfTrendGate: boolean;
  bypassChecklist: boolean;
  bypassConsensusLag: boolean;
  dynamicGuardian: boolean;
  dynamicWeights: boolean;
  dynamicAnimals: boolean;
  overdrive: boolean;
  noLossMode: boolean;
  useEnsemble: boolean;
  ensembleMode: "LEGACY" | "ENSEMBLE" | "AB" | "HYBRID";
  ensembleABRatio: number;
  ensembleConfidenceThreshold: number;
  autoTradeThreshold: number;   // LONG triggers when AQEA finalScore exceeds this
  shortScoreThreshold: number;  // SHORT triggers when AQEA finalScore falls below this
  aiFlipExitMinProfitR: number; // min profit (in R-multiple) before an AI-trend-flip exit banks the position
  adxMinimum: number;           // Minimum ADX for T7 directional-movement check
  saraswatiAlphaThreshold: number; // Min Saraswati alphaScore to allow entry
  driftHaltThreshold: number;   // Capital drift score above which all entries halt
  driftReduceThreshold: number; // Capital drift score above which risk is halved
  aiConsensusGate: boolean;
  behaviourModelEnabled: boolean;
  /** AQEA voting-layer toggles — per-user control for each of the 10 AI models. */
  orderFlowVotingEnabled: boolean;
  smartMoneyVotingEnabled: boolean;
  liveNewsSentimentEnabled: boolean;
  cnnVotingEnabled: boolean;
  lstmVotingEnabled: boolean;
  mambaVotingEnabled: boolean;
  lnnVotingEnabled: boolean;
  transformerVotingEnabled: boolean;
  ppoVotingEnabled: boolean;
  gayatriVotingEnabled: boolean;
  ohmkaraVotingEnabled: boolean;
  lakshmiVotingEnabled: boolean;
  /** Angel One SmartAPI Credentials (NSE / BSE Indian Market) */
  angelOneApiKey?: string;
  angelOneClientCode?: string;
  angelOnePin?: string;
  angelOneTotpSecret?: string;
  angelOneDisabled?: boolean;
  aiPredictorsEnabled: boolean;
  transitionOverrideEnabled: boolean;
  /** When the AI quant engine is offline, allow falling back to technical/core signal. */
  taFallbackEnabled: boolean;
  /** Which modes the TA fallback applies to when enabled. */
  taFallbackScope: "PAPER_ONLY" | "PAPER_AND_LIVE";
  primarySymbol?: string;
  lastAutoTick?: Date;
}

const SettingsSchema = new Schema<ISettings>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  defaultMode: { type: String, enum: ["PAPER", "LIVE", "BACKTEST"], default: "PAPER" },
  accountType: { type: String, enum: ["SPOT", "FUTURES", "BOTH"], default: "FUTURES" },
  allowedSymbols: {
    type: [String],
    default: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT"],
  },
  riskConfig: {
    type: new Schema(
      {
        maxDailyLoss: { type: Number, default: 100 },
        maxWeeklyLoss: { type: Number, default: 300 },
        maxMonthlyLoss: { type: Number, default: 800 },
        maxPositionSizePct: { type: Number, default: 21 },
        defaultSL: { type: Number, default: 2 },
        defaultTP: { type: Number, default: 4 },
        trailingSL: { type: Number, default: 1 },
        defaultLeverage: { type: Number, default: 1 },
        maxConcurrentPositions: { type: Number, default: 15 },
        maxPortfolioHeat: { type: Number, default: 40 },
        capitalPreservationMode: { type: Boolean, default: true },
        riskEngineEnabled: { type: Boolean, default: true },
        autoCloseEnabled: { type: Boolean, default: true },
        dynamicSLTP: { type: Boolean, default: true },
        multiStageTP: { type: Boolean, default: true },
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
        om_chant: { type: Number, default: 50 },
        gayatri_mantra: { type: Number, default: 0 },
        aaryan: { type: Number, default: 50 },
        aayush: { type: Number, default: 0 },
        lakshmi_hybrid: { type: Number, default: 0 },
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
        darkMode: { type: Boolean, default: true },
        density: { type: String, enum: ["COMPACT", "COMFORTABLE", "SPACIOUS"], default: "COMFORTABLE" },
      },
      { _id: false },
    ),
    default: () => ({}),
  },
  autoTrade: { type: Boolean, default: true },
  // FUTURES defaults to on to preserve pre-existing single-account-type
  // behavior for accounts that predate this field; SPOT opts in explicitly.
  autoTradeSpot: { type: Boolean, default: false },
  autoTradeFutures: { type: Boolean, default: true },
  highPrecisionMode: { type: Boolean, default: true },
  bypassHtfTrendGate: { type: Boolean, default: false },
  bypassChecklist: { type: Boolean, default: false },
  bypassConsensusLag: { type: Boolean, default: false },
  dynamicGuardian: { type: Boolean, default: false },
  dynamicWeights: { type: Boolean, default: false },
  dynamicAnimals: { type: Boolean, default: false },
  overdrive: { type: Boolean, default: false },
  noLossMode: { type: Boolean, default: false },
  useEnsemble: { type: Boolean, default: false },
  ensembleMode: { type: String, enum: ["LEGACY", "ENSEMBLE", "AB", "HYBRID"], default: "LEGACY" },
  ensembleABRatio: { type: Number, default: 0 },
  ensembleConfidenceThreshold: { type: Number, default: 0.55 },
  autoTradeThreshold:      { type: Number, default: 65, min: 40, max: 95 },
  shortScoreThreshold:     { type: Number, default: 35, min: 5,  max: 50 },
  aiFlipExitMinProfitR:    { type: Number, default: 0.3, min: 0, max: 5 },
  adxMinimum:              { type: Number, default: 15, min: 5,  max: 30 },
  saraswatiAlphaThreshold: { type: Number, default: 45, min: 20, max: 75 },
  driftHaltThreshold:      { type: Number, default: 80, min: 50, max: 100 },
  driftReduceThreshold:    { type: Number, default: 60, min: 30, max: 80 },
  aiConsensusGate: { type: Boolean, default: true },
  behaviourModelEnabled: { type: Boolean, default: true },
  orderFlowVotingEnabled:    { type: Boolean, default: true },
  smartMoneyVotingEnabled:   { type: Boolean, default: true },
  liveNewsSentimentEnabled:  { type: Boolean, default: true },
  cnnVotingEnabled:          { type: Boolean, default: true },
  lstmVotingEnabled:          { type: Boolean, default: true },
  mambaVotingEnabled:        { type: Boolean, default: true },
  lnnVotingEnabled:          { type: Boolean, default: true },
  transformerVotingEnabled:  { type: Boolean, default: true },
  ppoVotingEnabled:          { type: Boolean, default: true },
  gayatriVotingEnabled:      { type: Boolean, default: true },
  ohmkaraVotingEnabled:      { type: Boolean, default: true },
  lakshmiVotingEnabled:      { type: Boolean, default: true },
  angelOneApiKey:     { type: String, default: "" },
  angelOneClientCode: { type: String, default: "" },
  angelOnePin:        { type: String, default: "" },
  angelOneTotpSecret: { type: String, default: "" },
  angelOneDisabled:   { type: Boolean, default: false },
  aiPredictorsEnabled:       { type: Boolean, default: true },
  transitionOverrideEnabled: { type: Boolean, default: true },
  taFallbackEnabled: { type: Boolean, default: true },
  taFallbackScope: { type: String, enum: ["PAPER_ONLY", "PAPER_AND_LIVE"], default: "PAPER_ONLY" },
  primarySymbol: { type: String },
  lastAutoTick: { type: Date },
});

export const Settings = mongoose.model<ISettings>("Settings", SettingsSchema);
