import { subscribeTicker, getActiveSocketsInfo, syncTime } from './server/src/services/binanceService.js';
import { Server } from 'socket.io';
import http from 'http';

async function test() {
  await syncTime();
  const server = http.createServer();
  const io = new Server(server);
  
  console.log("Subscribing...");
  subscribeTicker("BTCUSDT", io, true);
  
  await new Promise(r => setTimeout(resolve, 10000));
  
  const sockets = getActiveSocketsInfo();
  console.log("Sockets found:", sockets.length);
  
  // We can't easily kill it from here without the combinedSockets map.
  process.exit(0);
}
