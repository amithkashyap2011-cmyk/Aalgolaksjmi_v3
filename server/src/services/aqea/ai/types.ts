/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — AI Predictor Types
 * ═══════════════════════════════════════════════════════════════════
 */

import { PredictorRole } from "../votingRegistry.js";

export type AIDirection = "LONG" | "SHORT" | "HOLD";

export interface AIPrediction {
  direction: AIDirection;
  confidence: number;   // 0-1
  probability: number;  // 0-1
  predictor: string;    // Name of the model
  role?: PredictorRole; // Governance role
  meta?: any;
}

export interface PredictorHealth {
  name: string;
  available: boolean;
  checkpointLoaded: boolean;
  inferenceLatencyMs: number;
  predictionCount: number;
  errorCount: number;
  uptime: number; // in seconds
  lastUpdated: Date;
  meta?: any;
}

export type PredictorType = "CNN" | "LSTM" | "MAMBA" | "XLSTM" | "PPO" | "TRANSFORMER" | "LNN" | "NOT_AVAILABLE";
