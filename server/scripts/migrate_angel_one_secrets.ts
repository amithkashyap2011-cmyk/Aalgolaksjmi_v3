/**
 * One-off: encrypt Angel One secrets that were stored in plaintext in Settings
 * (angelOneApiKey / angelOnePin / angelOneTotpSecret). Idempotent — already
 * sealed values are skipped. Each value is verified to decrypt back to the
 * original before it is written. Prints counts only, never values.
 *
 *   cd server && npx tsx scripts/migrate_angel_one_secrets.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { ANGEL_SECRET_FIELDS, isSealed, sealSecret, openSecret } from "../src/services/indianMarket/angelOneCredentials.js";

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  await mongoose.connect(uri);
  const col = mongoose.connection.db!.collection("settings");
  const docs = await col.find({ $or: ANGEL_SECRET_FIELDS.map((f) => ({ [f]: { $type: "string", $ne: "" } })) }).toArray();
  let docsUpdated = 0, fieldsSealed = 0, alreadySealed = 0;
  for (const d of docs) {
    const set: Record<string, string> = {};
    for (const f of ANGEL_SECRET_FIELDS) {
      const v = (d as any)[f];
      if (typeof v !== "string" || v === "") continue;
      if (isSealed(v)) { alreadySealed++; continue; }
      const sealed = sealSecret(v);
      if (openSecret(sealed) !== v) throw new Error(`round-trip check failed for ${f} on ${d._id}`);
      set[f] = sealed;
    }
    if (Object.keys(set).length) {
      await col.updateOne({ _id: d._id }, { $set: set });
      docsUpdated++; fieldsSealed += Object.keys(set).length;
    }
  }
  console.log(JSON.stringify({ docsScanned: docs.length, docsUpdated, fieldsSealed, alreadySealed }));
  await mongoose.disconnect();
}
main().catch((e) => { console.error("migration failed:", e.message); process.exit(1); });
