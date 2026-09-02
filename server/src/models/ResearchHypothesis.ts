import mongoose, { Schema, Document } from "mongoose";

export interface IResearchHypothesis extends Document {
  hypothesisId: string;
  weaknessType: "STRATEGY_UNDERPERFORMANCE" | "HIGH_SLIPPAGE" | "PREMATURE_EXITS" | "FALSE_BREAKOUTS" | "MODEL_DRIFT";
  targetComponent: string;
  problemStatement: string;
  proposedHypothesis: string;
  proposedParameterChange: any;
  baselineProfitFactor: number;
  baselineSharpe: number;
  state: "GENERATED" | "EXPERIMENT_RUNNING" | "APPROVED_FOR_PROMOTION" | "REJECTED_STATISTICALLY";
  createdAt: Date;
}

const ResearchHypothesisSchema: Schema = new Schema({
  hypothesisId: { type: String, required: true, unique: true },
  weaknessType: {
    type: String,
    enum: ["STRATEGY_UNDERPERFORMANCE", "HIGH_SLIPPAGE", "PREMATURE_EXITS", "FALSE_BREAKOUTS", "MODEL_DRIFT"],
    required: true,
  },
  targetComponent: { type: String, required: true },
  problemStatement: { type: String, required: true },
  proposedHypothesis: { type: String, required: true },
  proposedParameterChange: { type: Object, required: true },
  baselineProfitFactor: { type: Number, default: 1.84 },
  baselineSharpe: { type: Number, default: 1.82 },
  state: {
    type: String,
    enum: ["GENERATED", "EXPERIMENT_RUNNING", "APPROVED_FOR_PROMOTION", "REJECTED_STATISTICALLY"],
    default: "GENERATED",
    index: true,
  },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const ResearchHypothesis = mongoose.models.ResearchHypothesis || mongoose.model<IResearchHypothesis>("ResearchHypothesis", ResearchHypothesisSchema);
