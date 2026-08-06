import { getTickerPrice } from "./src/services/binanceService.js";
(async () => {
  const price = await getTickerPrice("SHIBUSDT", true);
  console.log("SHIBUSDT price:", price);
  const solPrice = await getTickerPrice("SOLUSDT", true);
  console.log("SOLUSDT price:", solPrice);
})().catch(console.error);
