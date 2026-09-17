import mongoose from "mongoose";
import { DataIntegrityScanner } from "../services/indianMarket/security/dataIntegrityScanner.js";

async function run() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";
  console.log(`Connecting to MongoDB at ${uri}...`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log("Connected. Running Data Integrity Scan...");
  const report = await DataIntegrityScanner.runScan();
  console.log("DATA_INTEGRITY_SCAN_REPORT_START");
  console.log(JSON.stringify(report, null, 2));
  console.log("DATA_INTEGRITY_SCAN_REPORT_END");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Data Integrity Audit Failed:", err);
  process.exit(1);
});
