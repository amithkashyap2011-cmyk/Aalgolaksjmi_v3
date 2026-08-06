import { io } from "socket.io-client";

const socket = io(process.env.VITE_API_URL || "http://GATEWAY_REQUIRED", {
  path: "/socket.io",
  transports: ["websocket", "polling"]
});

socket.on("connect", () => {
  console.log("Connected to local socket.io server");
  socket.emit("subscribe", { symbol: "BTCUSDT", isFutures: true });
});

socket.on("tick", (data) => {
  console.log("Received tick data:", data);
  process.exit(0);
});

setTimeout(() => {
  console.log("Timeout waiting for tick");
  process.exit(1);
}, 10000);
