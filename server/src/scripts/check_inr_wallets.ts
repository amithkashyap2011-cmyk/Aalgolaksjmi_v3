import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function run() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";
  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error("No DB handle");

    const wallets = await db.collection("walletsnapshots").find({}).toArray();
    console.log("\n--- ALL WALLET SNAPSHOTS IN DB ---");
    wallets.forEach(w => {
      console.log(`User: ${w.userId} | Mode: ${w.mode} | AccountType: ${w.accountType} | Balances:`, w.balances);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
