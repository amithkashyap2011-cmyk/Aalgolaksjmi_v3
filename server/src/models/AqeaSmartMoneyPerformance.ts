import mongoose, { Schema, type Document } from "mongoose";

export interface IAqeaSmartMoneyPerformance extends Document {
  timestamp: Date;
  userId: mongoose.Types.ObjectId;
  symbol: string;
  smartMoneySignal: string;
  aqeaSignal: string;
  orderFlowSignal: string;
  agreement: boolean;
  diagnostics: any;
}

const AqeaSmartMoneyPerformanceSchema = new Schema<IAqeaSmartMoneyPerformance>({
  timestamp: { type: Date, default: Date.now, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  symbol: { type: String, required: true, index: true },
  smartMoneySignal: { type: String },
  aqeaSignal: { type: String },
  orderFlowSignal: { type: String },
  agreement: { type: Boolean, default: false },
  diagnostics: { type: Schema.Types.Mixed, default: {} },
});

export const AqeaSmartMoneyPerformance = mongoose.model<IAqeaSmartMoneyPerformance>("AqeaSmartMoneyPerformance", AqeaSmartMoneyPerformanceSchema);
