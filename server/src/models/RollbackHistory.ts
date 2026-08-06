import mongoose, { Schema, Document } from "mongoose";

export interface IRollbackHistory extends Document {
  modelName: string;
  rolledBackFromVersion: string;
  restoredToVersion: string;
  reason: string;
  rolledBackAt: Date;
}

const RollbackHistorySchema: Schema = new Schema({
  modelName: { type: String, required: true, index: true },
  rolledBackFromVersion: { type: String, required: true },
  restoredToVersion: { type: String, required: true },
  reason: { type: String, required: true },
  rolledBackAt: { type: Date, default: Date.now, index: true },
});

export const RollbackHistory = mongoose.models.RollbackHistory || mongoose.model<IRollbackHistory>("RollbackHistory", RollbackHistorySchema);
