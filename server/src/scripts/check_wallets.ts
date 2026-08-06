import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function run() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";
  console.log("Connecting to", uri);
  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("MongoDB connection did not expose a database handle");
    }

    const collections = await db.listCollections().toArray();
    console.log("Collections:");
    for (const c of collections) {
      console.log(`- ${c.name}`);
    }
    
    // Check walletsnapshots
    const wallets = await db.collection("walletsnapshots").find({}).toArray();
    console.log("\nWallet Snapshots:");
    console.log(JSON.stringify(wallets, null, 2));

    // Check users
    const users = await db.collection("users").find({}).toArray();
    console.log("\nUsers:");
    console.log(JSON.stringify(users.map(u => ({ id: u._id, email: u.email, role: u.role })), null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
