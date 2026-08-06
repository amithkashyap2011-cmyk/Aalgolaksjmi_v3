import mongoose, { Schema, Document } from "mongoose";

export interface IWalkForwardRun extends Document {
  runId: string;
  config: {
    trainingStart: string;
    trainingEnd: string;
    validationStart: string;
    validationEnd: string;
    walkforwardStart: string;
    walkforwardEnd: string;
    paperStart: string;
    paperEnd: string;
  };
  metrics: {
    training: any;
    validation: any;
    walkforward: any;
    paper: any;
  };
  createdAt: Date;
}

const WalkForwardRunSchema: Schema = new Schema({
  runId: { type: String, required: true, unique: true, index: true },
  config: { type: Object, required: true },
  metrics: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const WalkForwardRun = mongoose.models.WalkForwardRun || mongoose.model<IWalkForwardRun>("WalkForwardRun", WalkForwardRunSchema);
