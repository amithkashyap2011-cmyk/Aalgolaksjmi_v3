import { getPrice } from "./src/services/autoTradeEngine.ts";
async function run() {
  const p = await getPrice("ADAUSDT", "FUTURES");
  console.log("Price:", p);
}
run();
