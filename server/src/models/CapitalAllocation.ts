import mongoose, { Schema, Document } from "mongoose";

export interface ICapitalAllocation extends Document {
  snapshotId: string;
  allocations: Array<{
    strategyId: string;
    strategyName: string;
    dynamicWeightPct: number;
    allocatedCapitalUsdt: number;
  }>;
  totalCapitalUsdt: number;
  portfolioHeatPct: number;
  createdAt: Date;
}

const CapitalAllocationSchema: Schema = new Schema({
  snapshotId: { type: String, required: true, unique: true, index: true },
  allocations: { type: Array, required: true },
  totalCapitalUsdt: { type: Number, required: true },
  portfolioHeatPct: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const CapitalAllocation = mongoose.models.CapitalAllocation || mongoose.model<ICapitalAllocation>("CapitalAllocation", CapitalAllocationSchema);
