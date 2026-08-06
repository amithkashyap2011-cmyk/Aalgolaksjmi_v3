import mongoose, { Schema, Document } from "mongoose";

export interface IResearchReport extends Document {
  reportId: string;
  hypothesisId: string;
  title: string;
  summary: string;
  results: any;
  recommendation: "APPROVE_PROMOTION" | "REJECT_EXPERIMENT";
  humanApproved: boolean;
  approvedAt?: Date;
  createdAt: Date;
}

const ResearchReportSchema: Schema = new Schema({
  reportId: { type: String, required: true, unique: true, index: true },
  hypothesisId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  summary: { type: String, required: true },
  results: { type: Object, required: true },
  recommendation: { type: String, enum: ["APPROVE_PROMOTION", "REJECT_EXPERIMENT"], required: true },
  humanApproved: { type: Boolean, default: false },
  approvedAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const ResearchReport = mongoose.models.ResearchReport || mongoose.model<IResearchReport>("ResearchReport", ResearchReportSchema);
