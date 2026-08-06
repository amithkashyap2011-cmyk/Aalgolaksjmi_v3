import mongoose from "mongoose";
import { User } from "./src/models/User.js";
import { ApiKeys } from "./src/models/ApiKeys.js";
import { decrypt } from "./src/lib/crypto.js";
import * as binance from "./src/services/binanceService.js";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, ".env") });

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not defined");
  await mongoose.connect(mongoUri);
  
  const user = await User.findOne({ email: "demo@aalgo.local" });
  if (!user) {
    console.error("Demo user not found");
    process.exit(1);
  }
  const userId = user._id.toString();
  
  console.log(`Checking API Keys for user: ${user.email} (${userId})`);
  const keys = await ApiKeys.findOne({ userId });
  if (!keys) {
    console.log("❌ No API Keys found in the database for this user.");
    await mongoose.disconnect();
    process.exit(0);
  }
  
  try {
    const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
    const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });
    
    console.log(`✅ API Key Decrypted successfully.`);
    console.log(`- API Key: ${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 6)}`);
    console.log(`- API Secret length: ${apiSecret.length} chars`);
    
    console.log("\nTesting connection to Binance public endpoints...");
    const pingPrice = await binance.getTickerPrice("BTCUSDT");
    console.log(`✅ Public API connection working. BTCUSDT Price: ${pingPrice}`);
    
    console.log("\nTesting Spot Account details (Private API)...");
    try {
      const spotAcct = await binance.getAccount(apiKey, apiSecret);
      console.log("✅ Spot API connection working!");
      const spotBalances = spotAcct.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
      console.log("Spot Balances (> 0):", spotBalances);
    } catch (spotErr: any) {
      console.log(`❌ Spot API connection failed: ${spotErr.message}`);
    }
    
    console.log("\nTesting Futures Account details (Private API)...");
    try {
      const futuresAcct = await binance.getFuturesAccount(apiKey, apiSecret);
      console.log("✅ Futures API connection working!");
      console.log("Futures Assets (with balance):", futuresAcct.assets.filter((a: any) => parseFloat(a.walletBalance) > 0));
      console.log("Futures Open Positions:", futuresAcct.positions.filter((p: any) => parseFloat(p.positionAmt) !== 0));
    } catch (futuresErr: any) {
      console.log(`❌ Futures API connection failed: ${futuresErr.message}`);
    }
    
  } catch (err: any) {
    console.log(`❌ Decryption or execution error: ${err.message}`);
  }
  
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
