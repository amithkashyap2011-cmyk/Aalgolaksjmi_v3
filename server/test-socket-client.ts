import { io } from "socket.io-client";

const socket = io("process.env.API_GATEWAY_URL", {
  path: "/socket.io",
  transports: ["websocket"]
});

const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "ADAUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "DOGEUSDT",
  "SHIBUSDT",
  "XRPUSDT"
];

socket.on("connect", () => {
  console.log("Connected to Socket.io server! ID:", socket.id);
  // Subscribe to all symbols
  symbols.forEach((sym) => {
    socket.emit("subscribe", { symbol: sym, isFutures: true });
    console.log("Subscribed to:", sym);
  });
});

const receivedTicks = new Set<string>();

socket.on("tick", (data) => {
  console.log(`[tick] Received tick for ${data.symbol}: ${data.price} (isFutures: ${data.isFutures})`);
  receivedTicks.add(data.symbol);
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});

setTimeout(() => {
  console.log("\nSummary of received ticks:");
  console.log("--------------------------");
  symbols.forEach((sym) => {
    console.log(`${sym}: ${receivedTicks.has(sym) ? "OK ✅" : "NO TICK ❌"}`);
  });
  socket.close();
  process.exit(0);
}, 6000);
