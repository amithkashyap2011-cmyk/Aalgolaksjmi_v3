import mongoose from "mongoose";

async function fix() {
  const MONGO_URI = "mongodb://127.0.0.1:27017/aalgolakshmi";
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;
  const collection = db.collection("walletsnapshots");
  
  console.log("Dropping all indexes on walletsnapshots...");
  try {
    await collection.dropIndexes();
    console.log("Indexes dropped.");
  } catch (err) {
    console.log("No indexes to drop or error:", err.message);
  }

  // Create the new correct index
  console.log("Creating new unique index: userId, mode, accountType...");
  await collection.createIndex({ userId: 1, mode: 1, accountType: 1 }, { unique: true });
  console.log("Index created.");

  await mongoose.disconnect();
}

fix();
