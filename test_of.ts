
import { OrderFlowEngine } from "./server/src/services/aqea/orderFlowEngine.js";
import mongoose from "mongoose";

async function test() {
  const symbol = "BTCUSDT";
  console.log(`Testing OrderFlowEngine for ${symbol}...`);
  try {
    const result = await OrderFlowEngine.analyze(symbol);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

test().then(() => process.exit());
