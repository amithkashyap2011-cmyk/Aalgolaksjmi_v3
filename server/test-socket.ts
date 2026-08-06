import { io } from "socket.io-client";
const socket = io("process.env.API_GATEWAY_URL", { path: "/socket.io" });
socket.on("connect", () => {
  console.log("Connected");
  socket.emit("subscribe", { symbol: "SHIBUSDT", isFutures: true });
});
socket.on("tick", (data) => {
  console.log("Tick:", data);
});
setTimeout(() => process.exit(0), 10000);
