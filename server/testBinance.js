import { getTickerPrice } from "./src/services/binanceService.ts";
async function run() {
  try {
    const p = await getTickerPrice("ADAUSDT", true);
    console.log("Price:", p);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
