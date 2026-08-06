import WebSocket from "ws";

const streams = [
  "btcusdt@miniTicker",
  "ethusdt@miniTicker",
  "adausdt@miniTicker",
  "bnbusdt@miniTicker",
  "solusdt@miniTicker",
  "dogeusdt@miniTicker",
  "1000shibusdt@miniTicker",
  "xrpusdt@miniTicker"
];

const url = "wss://fstream.binance.com/public/stream?streams=" + streams.join("/");
console.log("Connecting to:", url);

const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("WebSocket connection established!");
});

ws.on("message", (data) => {
  try {
    const payload = JSON.parse(data.toString());
    console.log("Received stream update:", payload.stream);
  } catch (err: any) {
    console.error("Error parsing frame:", err.message);
  }
});

ws.on("error", (err) => {
  console.error("WS Error:", err.message);
});

ws.on("close", (code, reason) => {
  console.log("WS Closed:", code, reason.toString());
});

setTimeout(() => {
  console.log("Closing connection...");
  ws.close();
  process.exit(0);
}, 6000);
