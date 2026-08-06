import { BinanceAdapter } from "./src/services/quantum/exchanges/binanceAdapter.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
    const symbol = "BTCUSDT";
    const adapter = new BinanceAdapter();
    
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log(` AQEA — DATA FEED DIAGNOSTIC for ${symbol}`);
    console.log("═══════════════════════════════════════════════════════════════════");

    try {
        console.log("\n1. Order Book:");
        const book = await adapter.getOrderBook(symbol, 5);
        console.log(`- Bids: ${book.bids.length}, Asks: ${book.asks.length}`);
        if (book.bids.length > 0) console.log(`- Top Bid: ${book.bids[0].price} (Qty: ${book.bids[0].quantity})`);
        
        console.log("\n2. Open Interest:");
        const oi = await adapter.getOpenInterest(symbol);
        console.log(`- OI: ${oi.openInterest}, Value: ${oi.openInterestValue}`);

        console.log("\n3. Funding Rate:");
        const funding = await adapter.getFundingRate(symbol);
        console.log(`- Rate: ${funding.fundingRate}`);

        console.log("\n4. Liquidations (Last 100):");
        const liqs = await adapter.getLiquidations(symbol, 100);
        console.log(`- Count: ${liqs.length}`);
        if (liqs.length > 0) {
            const last = liqs[0];
            console.log(`- Last: ${last.side} ${last.quantity} @ ${last.price}`);
        }

        console.log("\n5. Klines (1m):");
        const klines = await adapter.getKlines(symbol, "1m", 5);
        console.log(`- Count: ${klines.length}`);
        if (klines.length > 0) console.log(`- Last Close: ${klines[klines.length-1].close}`);

    } catch (err) {
        console.error("Diagnostic failed:", err);
    }
    console.log("\n═══════════════════════════════════════════════════════════════════");
}

run();
