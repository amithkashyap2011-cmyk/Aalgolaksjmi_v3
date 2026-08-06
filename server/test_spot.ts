import WebSocket from "ws";

const url = "wss://stream.binance.com:9443/ws/btcusdt@miniTicker";
console.log("Connecting to:", url);

const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("WebSocket connection established!");
});

ws.on("message", (data) => {
  console.log("Received data:", data.toString());
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
