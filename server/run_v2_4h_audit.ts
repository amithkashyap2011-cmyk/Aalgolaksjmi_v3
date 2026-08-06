import { AutonomousAuditService } from "./src/services/aqea/institutional/autonomousAuditService.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);
  console.log(await AutonomousAuditService.generateDailyReport());
  await mongoose.disconnect();
}

run();
