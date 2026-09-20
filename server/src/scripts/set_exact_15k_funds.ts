import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/amithks/aalgolakshmi_v3/server/.env" });

async function main() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";
  await mongoose.connect(uri);
  const userId = "6a39c0e7a5e2995ed257ca68";
  const userObjId = new mongoose.Types.ObjectId(userId);

  // ₹15,000 INR @ ~95.940282 = 156.3473 USDT
  const rate = 95.940282;
  const targetUsdt = +(15000 / rate).toFixed(4); // 156.3473

  console.log(`Setting SPOT and FUTURES to ${targetUsdt} USDT (₹15,000 INR each)...`);

  const snapshots = mongoose.connection.db!.collection("walletsnapshots");
  const transactions = mongoose.connection.db!.collection("wallettransactions");

  await snapshots.updateOne(
    { userId: userObjId, mode: "PAPER", accountType: "SPOT" },
    { $set: { "balances.USDT": targetUsdt, "balances.INR": 0, updatedAt: new Date() } },
    { upsert: true }
  );

  await snapshots.updateOne(
    { userId: userObjId, mode: "PAPER", accountType: "FUTURES" },
    { $set: { "balances.USDT": targetUsdt, "balances.INR": 0, updatedAt: new Date() } },
    { upsert: true }
  );

  await transactions.deleteMany({
    userId: userObjId,
    method: "DEBUG",
    accountType: { $in: ["SPOT", "FUTURES"] },
  });

  const now = new Date();
  await transactions.insertMany([
    {
      userId: userObjId,
      type: "DEPOSIT",
      method: "DEBUG",
      capitalSource: "PAPER_INITIALIZATION",
      amount: targetUsdt,
      currency: "USDT",
      status: "COMPLETED",
      txnRef: "INIT_SPOT_15K_INR",
      note: "Paper Deposit: +156.3473 USDT (converted from ₹15,000 INR @ ₹95.94/USDT)",
      accountType: "SPOT",
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
    {
      userId: userObjId,
      type: "DEPOSIT",
      method: "DEBUG",
      capitalSource: "PAPER_INITIALIZATION",
      amount: targetUsdt,
      currency: "USDT",
      status: "COMPLETED",
      txnRef: "INIT_FUT_15K_INR",
      note: "Paper Deposit: +156.3473 USDT (converted from ₹15,000 INR @ ₹95.94/USDT)",
      accountType: "FUTURES",
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
  ]);

  console.log("Database updated successfully!");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
