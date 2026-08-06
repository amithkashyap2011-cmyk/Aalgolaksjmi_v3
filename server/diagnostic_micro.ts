import { OrderFlowEngine } from "./src/services/aqea/orderFlowEngine.js";
import { SmartMoneyEngine } from "./src/services/aqea/smartMoneyEngine.ts";
import * as binance from "./src/services/binanceService.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
    const symbol = "BTCUSDT";
    console.log(`Diagnostic Microstructure for ${symbol}...`);
    
    try {
        const of = await OrderFlowEngine.analyze(symbol);
        console.log("OrderFlow Result:", JSON.stringify(of, null, 2));

        const klines = await binance.getKlines(symbol, "1m", undefined, undefined, 100);
        const bars = klines.map(k => ({
            open: parseFloat(k.open),
            high: parseFloat(k.high),
            low: parseFloat(k.low),
            close: parseFloat(k.close),
            volume: parseFloat(k.volume)
        }));

        const sm = SmartMoneyEngine.analyze(bars, of);
        console.log("SmartMoney Result:", JSON.stringify(sm, null, 2));

    } catch (err) {
        console.error(err);
    }
}

run();
