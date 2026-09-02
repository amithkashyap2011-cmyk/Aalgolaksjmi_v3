import mongoose, { Schema, type Document } from "mongoose";

export interface IAIPredictionTelemetry extends Document {
  prediction_id: string;
  model_name: string;
  symbol: string;
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  timestamp: Date;
  
  // Outcome resolution
  priceAtPrediction?: number;
  price15m?: number;
  price25m?: number;
  price30m?: number;
  price60m?: number;

  outcome15m?: "WIN" | "LOSS" | "NEUTRAL";
  outcome25m?: "WIN" | "LOSS" | "NEUTRAL";
  outcome30m?: "WIN" | "LOSS" | "NEUTRAL";
  outcome60m?: "WIN" | "LOSS" | "NEUTRAL";
  isCorrect?: boolean;
  /** Grading semantics version. 2 = graded at the model's trained horizon
   *  (25m) with NEUTRAL excluded from the sample. Absent/1 = legacy 60m
   *  grading where NEUTRAL counted as incorrect. */
  gradingVersion?: number;
}

const AIPredictionTelemetrySchema = new Schema<IAIPredictionTelemetry>({
  prediction_id: { type: String, required: true, index: true },
  model_name: { type: String, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  direction: { type: String, required: true },
  confidence: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  
  priceAtPrediction: { type: Number },
  price15m: { type: Number },
  price25m: { type: Number },
  price30m: { type: Number },
  price60m: { type: Number },

  outcome15m: { type: String, enum: ["WIN", "LOSS", "NEUTRAL"] },
  outcome25m: { type: String, enum: ["WIN", "LOSS", "NEUTRAL"] },
  outcome30m: { type: String, enum: ["WIN", "LOSS", "NEUTRAL"] },
  outcome60m: { type: String, enum: ["WIN", "LOSS", "NEUTRAL"] },
  isCorrect: { type: Boolean },
  gradingVersion: { type: Number }
});

AIPredictionTelemetrySchema.index({ model_name: 1, isCorrect: 1, timestamp: -1 });
AIPredictionTelemetrySchema.index({ model_name: 1, timestamp: -1 });
AIPredictionTelemetrySchema.index({ symbol: 1, timestamp: -1 });
AIPredictionTelemetrySchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 }); // 7-day automatic TTL expiration

export const AIPredictionTelemetry = mongoose.model<IAIPredictionTelemetry>("AIPredictionTelemetry", AIPredictionTelemetrySchema);

// Store rolling accuracies separately or computed on the fly?
export interface IModelAccuracyMetrics extends Document {
  model_name: string;
  timestamp: Date;
  rolling50_accuracy: number;
  rolling100_accuracy: number;
  rolling500_accuracy: number;
}

const ModelAccuracyMetricsSchema = new Schema<IModelAccuracyMetrics>({
  model_name: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  rolling50_accuracy: { type: Number, default: 0 },
  rolling100_accuracy: { type: Number, default: 0 },
  rolling500_accuracy: { type: Number, default: 0 }
});

export const ModelAccuracyMetrics = mongoose.model<IModelAccuracyMetrics>("ModelAccuracyMetrics", ModelAccuracyMetricsSchema);
