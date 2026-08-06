import WebSocket from "ws";

const url = "wss://fstream.binance.com/ws/btcusdt@aggTrade";
console.log("Connecting to:", url);

const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("WebSocket connection established!");
});

ws.on("message", (data) => {
  console.log("Received data:", data.toString());
});

setTimeout(() => {
  console.log("Closing connection...");
  ws.close();
  process.exit(0);
}, 10000);
