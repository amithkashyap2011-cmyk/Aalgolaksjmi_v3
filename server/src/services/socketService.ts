import { Server as IOServer } from "socket.io";

let io: IOServer | null = null;

export function setIO(ioInstance: IOServer) {
  io = ioInstance;
}

export function getIO(): IOServer | null {
  return io;
}

export function emitAlert(level: "GREEN" | "AMBER" | "RED", text: string) {
  if (io) {
    io.emit("alert", { level, text });
  }
}
