import WebSocket from "ws";
const ws = new WebSocket("wss://fstream-auth.binance.com/ws/btcusdt@ticker");
ws.on("open", () => console.log("Connected to Binance Auth"));
ws.on("message", (data) => console.log("Message:", data.toString()));
ws.on("error", console.error);
ws.on("close", () => console.log("Closed"));
setTimeout(() => process.exit(0), 10000);
