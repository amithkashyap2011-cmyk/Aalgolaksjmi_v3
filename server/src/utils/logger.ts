import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__moduleDir, "../../auto_trade.log");

// These hand-written logs (this file's auto_trade.log, plus
// server_crash.log written directly from index.ts's process-level error
// handlers) aren't PM2-managed stdout/stderr, so pm2-logrotate can't touch
// them — they grow via plain fs.appendFileSync with no bound. Observed
// sizes before this fix: auto_trade.log ~28MB, server_crash.log ~17MB, both
// still climbing. One rotated backup per file is kept (`.1`), matching the
// simplest common logrotate policy — this isn't a full logging overhaul,
// just a bound on unbounded growth.
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10MB
let lastRotateCheck = 0;
const ROTATE_CHECK_INTERVAL = 60_000; // 60 seconds throttle

export function rotateLogIfNeeded(filePath: string): void {
  const now = Date.now();
  if (now - lastRotateCheck < ROTATE_CHECK_INTERVAL) return;
  lastRotateCheck = now;
  try {
    if (fs.statSync(filePath).size > MAX_LOG_BYTES) {
      const rotated = `${filePath}.1`;
      fs.rmSync(rotated, { force: true });
      fs.renameSync(filePath, rotated);
    }
  } catch {
    // File doesn't exist yet — nothing to rotate.
  }
}

export function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    rotateLogIfNeeded(LOG_PATH);
    fs.appendFile(LOG_PATH, line, () => {});
  } catch (e) {}
  console.log(msg);
}
