import mongoose, { Schema, type Document } from "mongoose";

export interface IAqeaProductionAudit extends Document {
  timestamp: Date;
  level: "INFO" | "WARNING" | "CRITICAL" | "SECURITY";
  event: string; // ORDER_PLACED, PPO_INTERVENTION, RISK_REJECTION, CIRCUIT_BREAKER, etc.
  symbol?: string;
  userId?: mongoose.Types.ObjectId;
  message: string;
  data: any;
  latencyMs?: number;
}

const AqeaProductionAuditSchema = new Schema<IAqeaProductionAudit>({
  timestamp: { type: Date, default: Date.now, index: true },
  level: { type: String, enum: ["INFO", "WARNING", "CRITICAL", "SECURITY"], required: true, index: true },
  event: { type: String, required: true, index: true },
  symbol: { type: String, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  message: { type: String, required: true },
  data: { type: Schema.Types.Mixed, default: {} },
  latencyMs: { type: Number }
});

// Institutional retention requirement: 12 months minimum (index will handle faster lookups)
// In production, a TTL index or archival job would be used.
export const AqeaProductionAudit = mongoose.model<IAqeaProductionAudit>("AqeaProductionAudit", AqeaProductionAuditSchema);
