#!/usr/bin/env node
/**
 * 30-Minute Mistake & Error Audit Logger for AALGOLAKSHMI V3
 * Runs for 30 minutes (1800s), sampling every 30s.
 * Collects and categorizes errors from server, quant, client, and trading engine.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const LOG_DIR = path.join(ROOT_DIR, "logs");
const AUDIT_LOG = path.join(LOG_DIR, "audit_30min_mistakes.log");
const SUMMARY_JSON = path.join(LOG_DIR, "audit_30min_summary.json");

fs.mkdirSync(LOG_DIR, { recursive: true });

const TOTAL_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const POLL_INTERVAL_MS = 30 * 1000;       // 30 seconds
const startTime = Date.now();
const endTime = startTime + TOTAL_DURATION_MS;

const errorPointers = {
  serverError: 0,
  clientError: 0,
  quantError: 0,
  autoTrade: 0
};

// Initialize file pointers to current sizes so we only audit newly generated mistakes during this 30m window
function initFilePointer(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.statSync(filePath).size;
    }
  } catch {}
  return 0;
}

errorPointers.serverError = initFilePointer(path.join(ROOT_DIR, "server", "logs", "server-error.log"));
errorPointers.clientError = initFilePointer(path.join(ROOT_DIR, "client", "logs", "client-error.log"));
errorPointers.quantError = initFilePointer(path.join(ROOT_DIR, "quant_engine", "logs", "quant-error.log"));
errorPointers.autoTrade = initFilePointer(path.join(ROOT_DIR, "server", "auto_trade.log"));

const mistakeStats = {
  startTime: new Date(startTime).toISOString(),
  lastUpdated: new Date(startTime).toISOString(),
  targetEndTime: new Date(endTime).toISOString(),
  completed: false,
  ticksSampled: 0,
  categories: {
    symbolEvaluationTimeouts: 0,
    globalTickTimeouts: 0,
    concurrencyLockSkips: 0,
    websocketDisconnectsOrErrors: 0,
    quantModelErrors: 0,
    healthCheckFailures: 0,
    pm2Restarts: 0,
    clientErrors: 0,
    uncaughtExceptions: 0
  },
  sampleLogSummary: []
};

function readNewLogContent(filePath, pointerKey) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const stat = fs.statSync(filePath);
    let lastSize = errorPointers[pointerKey] || 0;
    if (stat.size < lastSize) lastSize = 0; // rotated
    if (stat.size === lastSize) return "";
    
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(stat.size - lastSize);
    fs.readSync(fd, buffer, 0, buffer.length, lastSize);
    fs.closeSync(fd);
    errorPointers[pointerKey] = stat.size;
    return buffer.toString("utf8");
  } catch (err) {
    return "";
  }
}

function appendAudit(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(AUDIT_LOG, line);
  console.log(line.trim());
}

async function runSample() {
  mistakeStats.ticksSampled++;
  const now = Date.now();
  const elapsedMinutes = ((now - startTime) / 60000).toFixed(1);
  const remainingMinutes = Math.max(0, (endTime - now) / 60000).toFixed(1);
  mistakeStats.lastUpdated = new Date().toISOString();

  appendAudit(`─── Sample ${mistakeStats.ticksSampled} (Elapsed: ${elapsedMinutes}m / Remaining: ${remainingMinutes}m) ───`);

  // 1. Health checks
  try {
    const res = await fetch("http://127.0.0.1:9991/health", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      mistakeStats.categories.healthCheckFailures++;
      appendAudit(`[MISTAKE:HEALTH] /health returned status ${res.status}`);
    }
  } catch (err) {
    mistakeStats.categories.healthCheckFailures++;
    appendAudit(`[MISTAKE:HEALTH] /health failed: ${err.message}`);
  }

  // 2. Client endpoint check (port 9996)
  try {
    const res = await fetch("http://127.0.0.1:9996/", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      mistakeStats.categories.clientErrors++;
      appendAudit(`[MISTAKE:CLIENT] Vite client returned status ${res.status}`);
    }
  } catch (err) {
    mistakeStats.categories.clientErrors++;
    appendAudit(`[MISTAKE:CLIENT] Vite client unreachable on port 9996: ${err.message}`);
  }

  // 3. PM2 restarts
  try {
    const out = execSync("pm2 jlist", { encoding: "utf8", timeout: 5000 });
    const list = JSON.parse(out);
    for (const p of list) {
      if (p.pm2_env.restart_time > 0) {
        mistakeStats.categories.pm2Restarts = Math.max(mistakeStats.categories.pm2Restarts, p.pm2_env.restart_time);
      }
      if (p.pm2_env.status !== "online") {
        appendAudit(`[MISTAKE:PROCESS] Process ${p.name} status is ${p.pm2_env.status}`);
      }
    }
  } catch {}

  // 4. Server error log inspection
  const serverErrors = readNewLogContent(path.join(ROOT_DIR, "server", "logs", "server-error.log"), "serverError");
  if (serverErrors) {
    const lines = serverErrors.split("\n").filter(Boolean);
    for (const line of lines) {
      if (line.includes("Timeout evaluating symbol")) {
        mistakeStats.categories.symbolEvaluationTimeouts++;
        appendAudit(`[MISTAKE:ENGINE_TIMEOUT] ${line}`);
      } else if (line.includes("Global tick exceeded") || line.includes("SCHEDULER_TIMEOUT")) {
        mistakeStats.categories.globalTickTimeouts++;
        appendAudit(`[MISTAKE:GLOBAL_TICK_TIMEOUT] ${line}`);
      } else if (line.includes("CONCURRENCY_LOCK_ACTIVE")) {
        mistakeStats.categories.concurrencyLockSkips++;
        appendAudit(`[MISTAKE:CONCURRENCY_LOCK_SKIP] ${line}`);
      } else if (line.includes("binance-ws") || line.includes("ENOTFOUND") || line.includes("WebSocket")) {
        mistakeStats.categories.websocketDisconnectsOrErrors++;
        appendAudit(`[MISTAKE:WS_NETWORK] ${line}`);
      } else if (line.includes("Python service error") || line.includes("DL service") || line.includes("CNN_V1") || line.includes("PPO_V1")) {
        mistakeStats.categories.quantModelErrors++;
        appendAudit(`[MISTAKE:QUANT_ML] ${line}`);
      } else {
        appendAudit(`[MISTAKE:SERVER_ERROR] ${line}`);
      }
    }
  }

  // 5. Client error log inspection
  const clientErrors = readNewLogContent(path.join(ROOT_DIR, "client", "logs", "client-error.log"), "clientError");
  if (clientErrors) {
    const lines = clientErrors.split("\n").filter(Boolean);
    for (const line of lines) {
      if (!line.includes("Browserslist")) {
        mistakeStats.categories.clientErrors++;
        appendAudit(`[MISTAKE:CLIENT_ERROR] ${line}`);
      }
    }
  }

  // 6. Quant error log inspection
  const quantErrors = readNewLogContent(path.join(ROOT_DIR, "quant_engine", "logs", "quant-error.log"), "quantError");
  if (quantErrors) {
    const lines = quantErrors.split("\n").filter(Boolean);
    for (const line of lines) {
      mistakeStats.categories.quantModelErrors++;
      appendAudit(`[MISTAKE:QUANT_ERROR] ${line}`);
    }
  }

  // Save JSON summary
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(mistakeStats, null, 2));

  if (Date.now() >= endTime) {
    mistakeStats.completed = true;
    fs.writeFileSync(SUMMARY_JSON, JSON.stringify(mistakeStats, null, 2));
    appendAudit("=================================================");
    appendAudit("🏁 30-MINUTE MISTAKE AUDIT COMPLETED");
    appendAudit(`Final Summary:\n${JSON.stringify(mistakeStats.categories, null, 2)}`);
    appendAudit("=================================================");
    process.exit(0);
  }
}

appendAudit("🚀 Starting 30-Minute Mistake Audit Session for AALGOLAKSHMI V3...");
appendAudit(`Start Time: ${new Date(startTime).toISOString()} | Target End: ${new Date(endTime).toISOString()}`);
runSample();
const timer = setInterval(runSample, POLL_INTERVAL_MS);

process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
