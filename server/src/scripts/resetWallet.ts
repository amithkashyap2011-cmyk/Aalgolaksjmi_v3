import mongoose from 'mongoose';
import { Trade } from '../models/Trade.js';
import { WalletSnapshot } from '../models/WalletSnapshot.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Resetting database...");
  
  await Trade.updateMany({ status: 'OPEN' }, { $set: { status: 'CANCELLED', closedAt: new Date() } });
  await WalletSnapshot.updateMany({}, { $set: { balances: { USDT: 100 } } });
  
  console.log("Database reset to 100 USDT.");
  process.exit(0);
}

run();
