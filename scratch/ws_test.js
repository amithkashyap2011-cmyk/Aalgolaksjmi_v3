const WebSocket = require("ws");
const ws = new WebSocket("wss://fstream.binance.com/stream?streams=btcusdt@miniTicker");
ws.on("message", (data) => {
  console.log(data.toString());
  process.exit(0);
});
