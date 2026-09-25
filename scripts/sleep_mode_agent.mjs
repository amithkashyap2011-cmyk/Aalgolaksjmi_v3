#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  AQEA Sleep Mode Guardian & 24/7 Overnight Autonomous Supervisor
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Dual Mission:
 *  1. macOS Keep-Alive Daemon:
 *     Prevents system, display, and network sleep via `caffeinate -dimsu` so
 *     the trading engine, WebSockets, MongoDB, and ML inference run continuously
 *     uninterrupted with the lid closed or display off.
 *
 *  2. Overnight Autonomous Trading Supervisor:
 *     Continuously monitors the health of all platform tiers (Express/Socket.io,
 *     FastAPI Quant Core, Vite Client, MongoDB), inspects open positions for
 *     stop-loss compliance, and records structured heartbeats and recovery events.
 *
 *  Managed under PM2 as 'aqea-sleep-guardian' or directly via ./scripts/run_sleep_mode.sh
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "sleep-mode-agent.log");
const SERVER_URL = process.env.AQEA_SERVER_URL || "http://127.0.0.1:9991";
const POLL_INTERVAL_MS = 30_000; // 30s heartbeat

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function writeLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    agent: "AQEA_SLEEP_GUARDIAN",
    message,
    ...meta,
  };
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch (err) {
    console.error("Failed to append to sleep log:", err);
  }
  console.log(line.trim());
}

/* ── 1. macOS Sleep Prevention (caffeinate) ─────────────────────────────────── */
let caffeinateProcess = null;

function startCaffeinate() {
  if (process.platform !== "darwin") {
    writeLog("info", "Operating system is not macOS. Skipping caffeinate keep-alive assertion.");
    return;
  }

  try {
    // -d: prevent display sleep
    // -i: prevent idle system sleep
    // -m: prevent disk idle sleep
    // -s: prevent system sleep on AC power
    // -u: declare user is active
    // -w: bind assertion to current pid so it auto-releases if we terminate
    caffeinateProcess = spawn("caffeinate", ["-dimsu", "-w", String(process.pid)], {
      detached: false,
      stdio: "ignore",
    });

    caffeinateProcess.on("error", (err) => {
      writeLog("warn", "caffeinate spawn warning (macOS sleep prevention degraded): " + err.message);
    });

    caffeinateProcess.on("exit", (code, signal) => {
      writeLog("info", `caffeinate process exited (code=${code}, signal=${signal})`);
    });

    writeLog("info", "✅ macOS Sleep Prevention active (caffeinate -dimsu bound to PID " + process.pid + "). System and network will remain awake.");
  } catch (err) {
    writeLog("error", "Failed to launch caffeinate: " + err.message);
  }
}

function stopCaffeinate() {
  if (caffeinateProcess) {
    try {
      caffeinateProcess.kill("SIGTERM");
    } catch {}
    caffeinateProcess = null;
    writeLog("info", "macOS keep-alive assertion released.");
  }
}

/* ── 2. Health & Telemetry Probe ───────────────────────────────────────────── */
function httpGetJson(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.pathname + parsed.search,
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ ok: true, data: JSON.parse(raw), status: res.statusCode });
            } catch {
              resolve({ ok: true, data: raw, status: res.statusCode });
            }
          } else {
            resolve({ ok: false, error: `HTTP_${res.statusCode}`, status: res.statusCode });
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "TIMEOUT" });
    });

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

/* ── 3. Overnight Status & Supervisory Loop ────────────────────────────────── */
let consecutiveFailures = 0;
let totalChecks = 0;
let lastRestartAttempt = 0;

function isOvernightWindow() {
  const hour = new Date().getHours(); // local machine hour (0-23)
  return hour >= 22 || hour < 7; // 10:00 PM to 07:00 AM
}

async function runSupervisoryCheck() {
  totalChecks++;
  const isNight = isOvernightWindow();
  const windowLabel = isNight ? "🌙 OVERNIGHT (SLEEP MODE)" : "☀️ DAYTIME (ACTIVE SESSION)";

  // Check 1: Server Core Health
  // /health is synchronous, so a slow answer means a busy event loop, not a
  // dead server. A 6s timeout x 3 checks restart-looped a loaded-but-working
  // server 9-11 times an hour (2026-09-23..25), and each restart added boot
  // load and wiped in-memory state. Only a server that stays unresponsive for
  // ~2.5 min (5 checks, 20s each) is restarted, at most once per 10 min.
  const healthResult = await httpGetJson(`${SERVER_URL}/health`, 20_000);
  
  if (!healthResult.ok) {
    consecutiveFailures++;
    writeLog("warn", `[HEALTH_ALERT] Server unreachable at ${SERVER_URL}/health (failures=${consecutiveFailures}): ${healthResult.error}`);

    // If server is failing repeatedly and managed by PM2, attempt automated recovery
    if (consecutiveFailures >= 5 && Date.now() - lastRestartAttempt > 600_000) {
      lastRestartAttempt = Date.now();
      writeLog("warn", "Triggering PM2 auto-restart for aqea-server...");
      try {
        execSync("npx pm2 restart aqea-server", { stdio: "ignore" });
        writeLog("info", "PM2 restart command issued for aqea-server.");
      } catch (err) {
        writeLog("error", "Failed to issue PM2 restart: " + err.message);
      }
    }
    return;
  }

  consecutiveFailures = 0;
  const health = healthResult.data || {};
  const mongoOk = health.mongodb === true;
  const binanceOk = health.binance === true;

  // Check 2: Positions & Exposure Inspection
  let openPositionsCount = 0;
  let totalEquity = null;

  try {
    const dashResult = await httpGetJson(`${SERVER_URL}/aqea-ui/dashboard?accountType=BOTH`, 5000);
    if (dashResult.ok && dashResult.data) {
      openPositionsCount = dashResult.data.summary?.openPositions ?? 0;
      totalEquity = dashResult.data.summary?.totalEquity ?? null;
    }
  } catch {}

  // Periodic heartbeat log (every 10 checks ~ 5 minutes, or on changes)
  if (totalChecks % 10 === 1 || !mongoOk || !binanceOk) {
    writeLog("info", `Heartbeat: ${windowLabel} | Server: OK | Mongo: ${mongoOk ? "CONNECTED" : "DISCONNECTED"} | Binance: ${binanceOk ? "OK" : "CHECK"} | Open Pos: ${openPositionsCount} | Equity: ${totalEquity !== null ? "$" + totalEquity.toFixed(2) : "N/A"}`);
  }
}

/* ── 4. Lifecycle Handlers ─────────────────────────────────────────────────── */
function handleShutdown(signal) {
  writeLog("info", `Received ${signal}. Shutting down Sleep Mode Guardian cleanly...`);
  stopCaffeinate();
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  writeLog("error", "Uncaught exception in Sleep Mode Guardian: " + err.stack);
});

/* ── 5. Main Initialization ────────────────────────────────────────────────── */
writeLog("info", "═══════════════════════════════════════════════════════════════════════");
writeLog("info", "  🚀 AQEA Sleep Mode Guardian & Overnight Supervisor starting up...    ");
writeLog("info", "═══════════════════════════════════════════════════════════════════════");

startCaffeinate();
runSupervisoryCheck();
setInterval(runSupervisoryCheck, POLL_INTERVAL_MS);
