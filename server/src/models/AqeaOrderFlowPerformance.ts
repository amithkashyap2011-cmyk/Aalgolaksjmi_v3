import mongoose, { Schema, type Document } from "mongoose";

export interface IAqeaOrderFlowPerformance extends Document {
  timestamp: Date;
  userId: mongoose.Types.ObjectId;
  symbol: string;
  orderFlowSignal: string;
  aqeaSignal: string;
  agreement: boolean;
  diagnostics: any;
}

const AqeaOrderFlowPerformanceSchema = new Schema<IAqeaOrderFlowPerformance>({
  timestamp: { type: Date, default: Date.now, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  symbol: { type: String, required: true, index: true },
  orderFlowSignal: { type: String },
  aqeaSignal: { type: String },
  agreement: { type: Boolean, default: false },
  diagnostics: { type: Schema.Types.Mixed, default: {} },
});

export const AqeaOrderFlowPerformance = mongoose.model<IAqeaOrderFlowPerformance>("AqeaOrderFlowPerformance", AqeaOrderFlowPerformanceSchema);
