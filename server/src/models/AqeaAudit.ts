import mongoose, { Schema, type Document } from "mongoose";

export interface IAqeaAudit extends Document {
  timestamp: Date;
  userId: mongoose.Types.ObjectId;
  symbol: string;
  component: string; // riskEngine, exitEngine, regimeEngine, multiTfEngine, orchestrator
  level: "INFO" | "WARNING" | "CRITICAL" | "ERROR";
  message: string;
  data: any;
}

const AqeaAuditSchema = new Schema<IAqeaAudit>({
  timestamp: { type: Date, default: Date.now, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  symbol: { type: String, required: true, index: true },
  component: { type: String, required: true, index: true },
  level: { type: String, enum: ["INFO", "WARNING", "CRITICAL", "ERROR"], default: "INFO" },
  message: { type: String, required: true },
  data: { type: Schema.Types.Mixed, default: {} },
});

export const AqeaAudit = mongoose.model<IAqeaAudit>("AqeaAudit", AqeaAuditSchema);
