import WebSocket from 'ws';
import { io } from 'socket.io-client';

async function triggerReconnect() {
  console.log("Starting server...");
  // This is hard since I can't easily reach the internal Map of combinedSockets.
  // I will just wait for the session log I already have.
}
