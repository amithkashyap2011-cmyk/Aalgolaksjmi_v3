import { ResearchMetaAlphaAudit } from "./src/models/ResearchMetaAlphaAudit.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function runAudit() {
  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  try {
    const records = await ResearchMetaAlphaAudit.find({ actualOutcome: { $exists: true } }).lean();
    console.log(`Replayed Records Found: ${records.length}`);

    const pfs = [];
    const wrs = [];

    for (let i = 0; i < 1000; i++) {
        const sample = Array.from({ length: 1000 }, () => records[Math.floor(Math.random() * records.length)]);
        const wins = sample.filter(r => r.actualOutcome === "WIN").length;
        const total = sample.length;
        const totalGains = sample.filter(r => (r.pnlImpact || 0) > 0).reduce((sum, r) => sum + (r.pnlImpact || 0), 0);
        const totalLosses = Math.abs(sample.filter(r => (r.pnlImpact || 0) < 0).reduce((sum, r) => sum + (r.pnlImpact || 0), 0));
        const pf = totalLosses > 0 ? totalGains / totalLosses : totalGains;
        pfs.push(pf);
        wrs.push(wins / total);
    }

    pfs.sort((a, b) => a - b);
    wrs.sort((a, b) => a - b);

    console.log(JSON.stringify({
        meanPF: pfs.reduce((a, b) => a + b, 0) / 1000,
        medianPF: pfs[500],
        ciPF: [pfs[25], pfs[975]],
        meanWR: wrs.reduce((a, b) => a + b, 0) / 1000,
        ciWR: [wrs[25], wrs[975]]
    }, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

runAudit();
