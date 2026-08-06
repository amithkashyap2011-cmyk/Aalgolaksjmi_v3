#!/usr/bin/env node
/*
 * ─── Soak-test monitor ──────────────────────────────────
 *
 * External, standalone monitor — deliberately NOT part of the main server
 * process, so it keeps recording even if the server itself restarts or
 * crashes (a restart is exactly one of the things this is supposed to
 * detect and count). Polls /health and /metrics (already-instrumented
 * Prometheus data: event-loop lag, GC duration, active handles, CPU,
 * memory) plus PM2's own process stats, appends one JSON line per poll,
 * writes hourly AND daily rollups, and — only once real data spans at
 * least 7 days — writes a final certification verdict. It never
 * estimates or extrapolates a trend from a short window; a trend/leak
 * verdict is only computed from real elapsed samples, and is explicitly
 * marked "insufficient data" before 24h of samples exist.
 *
 * Usage: node scripts/soak_test.mjs
 * Intended to run under PM2 as its own process (see ecosystem.config.js)
 * so it survives independently of the server it's watching.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const SERVER_URL = process.env.SOAK_TARGET_URL || "http://127.0.0.1:9991";
const POLL_INTERVAL_MS = 30_000;
const LOG_DIR = path.join(process.cwd(), "soak_logs");
const RAW_LOG = path.join(LOG_DIR, "soak_raw.jsonl");
const HOURLY_LOG = path.join(LOG_DIR, "soak_hourly_summary.jsonl");
const DAILY_LOG = path.join(LOG_DIR, "soak_daily_summary.jsonl");
const CERT_REPORT = path.join(LOG_DIR, "soak_7day_certification.json");
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_TREND_WINDOW_MS = 24 * 60 * 60 * 1000; // don't attempt a trend verdict on less than a day of data

fs.mkdirSync(LOG_DIR, { recursive: true });

let lastPm2RestartCount = null;
let lastMongoConnected = null;
let processRestartEvents = 0;
let mongoReconnectEvents = 0;
let wsReconnectTriggerCount = 0; // parsed from auto_trade.log, see below
let exceptionCount = 0;
let samplesThisHour = [];
let hourStart = Date.now();
let hourlySummariesThisDay = [];
let dayStart = Date.now();
const runStart = Date.now();
let certReportWritten = false;

function parsePromMetric(text, name, labelMatch = null) {
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.startsWith(name)) continue;
    if (labelMatch && !line.includes(labelMatch)) continue;
    const parts = line.trim().split(" ");
    const val = parseFloat(parts[parts.length - 1]);
    if (Number.isFinite(val)) return val;
  }
  return null;
}

function getPm2Stats() {
  try {
    const out = execSync("pm2 jlist", { encoding: "utf8", timeout: 5000 });
    const list = JSON.parse(out);
    const proc = list.find(p => p.name === "aqea-server");
    if (!proc) return null;
    return {
      status: proc.pm2_env.status,
      restarts: proc.pm2_env.restart_time,
      memory_mb: Math.round((proc.monit?.memory || 0) / 1024 / 1024 * 10) / 10,
      cpu_pct: proc.monit?.cpu ?? null,
      uptime_ms: Date.now() - proc.pm2_env.pm_uptime,
    };
  } catch {
    return null;
  }
}

// Counts "Dynamically triggering background WebSocket reconnect" lines
// written since the last poll — a real, already-existing signal
// (sentinelAuditor's Frozen-Ticker Guard) rather than new instrumentation.
let lastLogSize = 0;
function countNewWsReconnectTriggers() {
  const logPath = path.join(process.cwd(), "server", "auto_trade.log");
  try {
    const stat = fs.statSync(logPath);
    if (stat.size < lastLogSize) lastLogSize = 0; // log rotated
    const stream = fs.readFileSync(logPath, "utf8");
    const newContent = stream.slice(lastLogSize);
    lastLogSize = stat.size;
    const matches = newContent.match(/Dynamically triggering background WebSocket reconnect/g);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

async function poll() {
  const sample = { ts: new Date().toISOString() };

  try {
    const t0 = Date.now();
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(8000) });
    sample.health_latency_ms = Date.now() - t0;
    sample.health = await res.json();
  } catch (err) {
    sample.health_error = err.message;
    exceptionCount++;
  }

  try {
    const res = await fetch(`${SERVER_URL}/metrics`, { signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    sample.metrics = {
      cpu_seconds_total: parsePromMetric(text, "process_cpu_seconds_total"),
      resident_memory_mb: (parsePromMetric(text, "process_resident_memory_bytes") || 0) / 1024 / 1024,
      heap_used_mb: (parsePromMetric(text, "nodejs_heap_size_used_bytes") || 0) / 1024 / 1024,
      eventloop_lag_mean_ms: (parsePromMetric(text, "nodejs_eventloop_lag_mean_seconds") || 0) * 1000,
      eventloop_lag_p99_ms: (parsePromMetric(text, "nodejs_eventloop_lag_p99_seconds") || 0) * 1000,
      active_handles_total: parsePromMetric(text, "nodejs_active_handles_total"),
      gc_major_count: parsePromMetric(text, 'nodejs_gc_duration_seconds_count{kind="major"'),
      gc_minor_count: parsePromMetric(text, 'nodejs_gc_duration_seconds_count{kind="minor"'),
      mongodb_connected: parsePromMetric(text, "mongodb_connected"),
      open_trades_paper: parsePromMetric(text, 'open_trades_total{mode="PAPER"'),
      open_trades_live: parsePromMetric(text, 'open_trades_total{mode="LIVE"'),
    };
    if (lastMongoConnected === 0 && sample.metrics.mongodb_connected === 1) {
      mongoReconnectEvents++;
      sample.mongo_reconnect_detected = true;
    }
    if (sample.metrics.mongodb_connected != null) lastMongoConnected = sample.metrics.mongodb_connected;
  } catch (err) {
    sample.metrics_error = err.message;
    exceptionCount++;
  }

  const pm2 = getPm2Stats();
  sample.pm2 = pm2;
  if (pm2 && lastPm2RestartCount !== null && pm2.restarts > lastPm2RestartCount) {
    processRestartEvents++;
    sample.restart_detected = true;
  }
  if (pm2) lastPm2RestartCount = pm2.restarts;

  const wsReconnects = countNewWsReconnectTriggers();
  if (wsReconnects > 0) {
    wsReconnectTriggerCount += wsReconnects;
    sample.ws_reconnect_triggers_since_last_poll = wsReconnects;
  }

  fs.appendFileSync(RAW_LOG, JSON.stringify(sample) + "\n");
  samplesThisHour.push(sample);

  if (Date.now() - hourStart >= 60 * 60 * 1000) writeHourlySummary();
  if (Date.now() - dayStart >= 24 * 60 * 60 * 1000) writeDailySummary();
  if (!certReportWritten && Date.now() - runStart >= SEVEN_DAYS_MS) writeCertificationReport();
}

function stats(values) {
  const v = values.filter(x => typeof x === "number" && Number.isFinite(x));
  if (v.length === 0) return null;
  const sum = v.reduce((a, b) => a + b, 0);
  return { min: Math.min(...v), max: Math.max(...v), mean: +(sum / v.length).toFixed(2), count: v.length };
}

function buildSummary(samples, windowStart) {
  return {
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date().toISOString(),
    samples: samples.length,
    processRestartEvents,
    mongoReconnectEvents,
    wsReconnectTriggerCount,
    exceptionCount,
    cpu_seconds_total_delta: (() => {
      const first = samples.find(s => s.metrics?.cpu_seconds_total != null)?.metrics.cpu_seconds_total;
      const last = [...samples].reverse().find(s => s.metrics?.cpu_seconds_total != null)?.metrics.cpu_seconds_total;
      return (first != null && last != null) ? +(last - first).toFixed(2) : null;
    })(),
    resident_memory_mb: stats(samples.map(s => s.metrics?.resident_memory_mb)),
    heap_used_mb: stats(samples.map(s => s.metrics?.heap_used_mb)),
    eventloop_lag_mean_ms: stats(samples.map(s => s.metrics?.eventloop_lag_mean_ms)),
    eventloop_lag_p99_ms: stats(samples.map(s => s.metrics?.eventloop_lag_p99_ms)),
    active_handles_total: stats(samples.map(s => s.metrics?.active_handles_total)),
    health_latency_ms: stats(samples.map(s => s.health_latency_ms)),
    mongodb_uptime_pct: (() => {
      const vals = samples.map(s => s.metrics?.mongodb_connected).filter(v => v != null);
      return vals.length ? +((100 * vals.filter(v => v === 1).length / vals.length).toFixed(2)) : null;
    })(),
  };
}

function writeHourlySummary() {
  const summary = buildSummary(samplesThisHour, hourStart);
  fs.appendFileSync(HOURLY_LOG, JSON.stringify(summary) + "\n");
  hourlySummariesThisDay.push(summary);
  samplesThisHour = [];
  hourStart = Date.now();
}

function writeDailySummary() {
  if (samplesThisHour.length > 0) writeHourlySummary();
  const daySamples = hourlySummariesThisDay;
  const summary = {
    windowStart: new Date(dayStart).toISOString(),
    windowEnd: new Date().toISOString(),
    hourlyWindows: daySamples.length,
    processRestartEvents,
    mongoReconnectEvents,
    wsReconnectTriggerCount,
    exceptionCount,
    resident_memory_mb_trend: daySamples.map(h => h.resident_memory_mb?.mean).filter(v => v != null),
    active_handles_trend: daySamples.map(h => h.active_handles_total?.mean).filter(v => v != null),
    eventloop_lag_p99_trend_ms: daySamples.map(h => h.eventloop_lag_p99_ms?.mean).filter(v => v != null),
  };
  fs.appendFileSync(DAILY_LOG, JSON.stringify(summary) + "\n");
  hourlySummariesThisDay = [];
  dayStart = Date.now();
}

// Simple linear regression slope — used only to describe direction/magnitude
// over real recorded windows, never to extrapolate beyond them.
function slope(values) {
  const n = values.length;
  if (n < 3) return null;
  const xs = values.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function writeCertificationReport() {
  certReportWritten = true;
  const dailyLines = fs.existsSync(DAILY_LOG)
    ? fs.readFileSync(DAILY_LOG, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
    : [];
  const memoryMeans = dailyLines.flatMap(d => d.resident_memory_mb_trend || []);
  const handleMeans = dailyLines.flatMap(d => d.active_handles_trend || []);
  const memSlope = slope(memoryMeans);
  const handleSlope = slope(handleMeans);

  const elapsedMs = Date.now() - runStart;
  const verdict = {
    generatedAt: new Date().toISOString(),
    elapsedDays: +(elapsedMs / (24 * 60 * 60 * 1000)).toFixed(2),
    sufficientDataForTrend: elapsedMs >= MIN_TREND_WINDOW_MS,
    totalProcessRestarts: processRestartEvents,
    totalMongoReconnects: mongoReconnectEvents,
    totalWsReconnectTriggers: wsReconnectTriggerCount,
    totalExceptions: exceptionCount,
    memoryTrendMbPerHourlyWindow: memSlope != null ? +memSlope.toFixed(4) : "insufficient data",
    handleCountTrendPerHourlyWindow: handleSlope != null ? +handleSlope.toFixed(4) : "insufficient data",
    leakVerdict: memSlope == null
      ? "INSUFFICIENT DATA"
      : memSlope > 1
        ? "SUSTAINED MEMORY GROWTH DETECTED — investigate before certifying"
        : "NO SUSTAINED GROWTH DETECTED over the recorded window",
  };
  fs.writeFileSync(CERT_REPORT, JSON.stringify(verdict, null, 2));
  console.log("7-day window reached — certification report written:", CERT_REPORT);
}

console.log(`Soak test monitor started. Polling ${SERVER_URL} every ${POLL_INTERVAL_MS / 1000}s. Logs: ${LOG_DIR}`);
poll();
setInterval(poll, POLL_INTERVAL_MS);

process.on("SIGTERM", () => { if (samplesThisHour.length) writeHourlySummary(); process.exit(0); });
process.on("SIGINT", () => { if (samplesThisHour.length) writeHourlySummary(); process.exit(0); });
