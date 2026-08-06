import mongoose, { Schema, Document } from "mongoose";

export interface IGraphRelationshipLog extends Document {
  sourceSymbol: string;
  targetSymbol: string;
  correlation: number;
  leadLagStrength: number;
  volatilityTransmissionScore: number;
  evaluatedAt: Date;
}

const GraphRelationshipLogSchema: Schema = new Schema({
  sourceSymbol: { type: String, required: true, index: true },
  targetSymbol: { type: String, required: true, index: true },
  correlation: { type: Number, required: true },
  leadLagStrength: { type: Number, required: true },
  volatilityTransmissionScore: { type: Number, required: true },
  evaluatedAt: { type: Date, default: Date.now, index: true },
});

export const GraphRelationshipLog = mongoose.models.GraphRelationshipLog || mongoose.model<IGraphRelationshipLog>("GraphRelationshipLog", GraphRelationshipLogSchema);
