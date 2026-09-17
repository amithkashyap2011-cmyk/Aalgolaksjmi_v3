import mongoose, { Schema, Document } from "mongoose";
import {
  StrategyLifecycleStatus,
  StrategyType,
  MarketSegment,
  IStrategyDSL,
  IBacktestMetrics,
  IAIStrategyExplanation,
  IStrategyDriftMetrics,
} from "../services/agentic/strategy/types.js";

export interface IAutonomousStrategyDocument extends Document {
  strategyId: string;
  name: string;
  description: string;
  version: string; // SemVer: e.g. "1.0.0"
  type: StrategyType;
  instrument: string; // e.g. "NIFTY", "BANKNIFTY"
  exchange: "NSE" | "NFO" | "BSE" | "BFO";
  timeframe: string; // e.g. "5m", "15m"
  marketSegment: MarketSegment;
  dsl: IStrategyDSL;
  parameterSchema: Record<string, any>;
  status: StrategyLifecycleStatus;
  healthScore: number; // 0 - 100
  createdBy: string; // Agent name or user id
  createdAt: Date;
  updatedAt: Date;
  parentStrategyId?: string;
  modelVersion: string;
  promptVersion: string;
  codeVersion: string;
  metrics?: IBacktestMetrics;
  driftMetrics?: IStrategyDriftMetrics;
  explanation?: IAIStrategyExplanation;
  activeStage?: "STAGE_1" | "STAGE_2" | "FULL";
  allocationCapital: number;
}

const AutonomousStrategySchema: Schema = new Schema(
  {
    strategyId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    description: { type: String, required: true },
    version: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: [
        "MOMENTUM",
        "TREND_FOLLOWING",
        "MEAN_REVERSION",
        "BREAKOUT",
        "OPTIONS_SPREAD",
        "VOLATILITY",
        "REGIME_ADAPTIVE",
      ],
      required: true,
      index: true,
    },
    instrument: { type: String, required: true, index: true },
    exchange: { type: String, enum: ["NSE", "NFO", "BSE", "BFO"], default: "NFO" },
    timeframe: { type: String, default: "5m" },
    marketSegment: { type: String, enum: ["EQUITY", "FUTURES", "OPTIONS"], required: true },
    dsl: { type: Object, required: true },
    parameterSchema: { type: Object, default: {} },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "RESEARCH",
        "VALIDATING",
        "BACKTESTING",
        "PAPER",
        "SHADOW",
        "APPROVED",
        "LIVE_STAGE_1",
        "LIVE_STAGE_2",
        "LIVE",
        "PAUSED",
        "DEGRADED",
        "RETIRED",
        "REJECTED",
      ],
      default: "DRAFT",
      index: true,
    },
    healthScore: { type: Number, default: 100, index: true },
    createdBy: { type: String, default: "StrategyResearchAgent" },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
    parentStrategyId: { type: String, default: null },
    modelVersion: { type: String, default: "v2.0.0" },
    promptVersion: { type: String, default: "p1.0" },
    codeVersion: { type: String, default: "c2.0.0" },
    metrics: { type: Object, default: null },
    driftMetrics: { type: Object, default: null },
    explanation: { type: Object, default: null },
    activeStage: { type: String, enum: ["STAGE_1", "STAGE_2", "FULL"], default: "STAGE_1" },
    allocationCapital: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

AutonomousStrategySchema.index({ name: 1, version: 1 }, { unique: true });

export const AutonomousStrategy =
  mongoose.models.AutonomousStrategy ||
  mongoose.model<IAutonomousStrategyDocument>("AutonomousStrategy", AutonomousStrategySchema);
