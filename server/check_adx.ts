import { getKlines } from "./src/services/binanceService.js";
import { computeSnapshot } from "./src/services/indicatorService.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
    const symbol = "BTCUSDT";
    const klines = await getKlines(symbol, "1m", undefined, undefined, 500);
    const bars = klines.map(k => ({
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume)
    }));

    const snap = computeSnapshot(bars);
    console.log(`BTCUSDT ADX14: ${snap.adx14}`);
    console.log(`BTCUSDT Close: ${snap.close}`);
    console.log(`BTCUSDT SMA200: ${snap.sma200}`);
}

run();
