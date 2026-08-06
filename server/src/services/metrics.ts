/*
 * ─── Prometheus metrics ─────────────────────────────────
 *
 * There was no operational instrumentation at all — no way to see memory/
 * CPU/event-loop trends, request latency, or trade-engine state without
 * SSHing in and reading logs. This adds a standard /metrics endpoint
 * (prom-client's default Node.js process metrics, plus a handful of
 * app-specific gauges) that a real Prometheus server can scrape.
 *
 * Scope: this is instrumentation only. Standing up an actual Prometheus
 * server, Grafana dashboards, and AlertManager routing is an infrastructure
 * deployment decision (where to run them, retention, who gets paged) that
 * belongs to the operator, not something to embed in the app.
 */
import client from "prom-client";
import mongoose from "mongoose";
import { Trade } from "../models/Trade.js";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const mongoConnected = new client.Gauge({
  name: "mongodb_connected",
  help: "1 if the primary MongoDB connection is ready, 0 otherwise",
  registers: [register],
});

const openTradesGauge = new client.Gauge({
  name: "open_trades_total",
  help: "Currently open trades",
  labelNames: ["mode"],
  registers: [register],
});

export const reconciliationMismatches = new client.Counter({
  name: "reconciliation_mismatches_total",
  help: "Exchange-vs-local mismatches found by the reconciliation engine",
  labelNames: ["type"],
  registers: [register],
});

export const orderPlacementErrors = new client.Counter({
  name: "order_placement_errors_total",
  help: "Failed Binance order placement attempts",
  labelNames: ["mode", "accountType"],
  registers: [register],
});

async function refreshAppMetrics() {
  mongoConnected.set(mongoose.connection.readyState === 1 ? 1 : 0);
  if (mongoose.connection.readyState === 1) {
    try {
      const [paperOpen, liveOpen] = await Promise.all([
        Trade.countDocuments({ mode: "PAPER", status: "OPEN" }),
        Trade.countDocuments({ mode: "LIVE", status: "OPEN" }),
      ]);
      openTradesGauge.set({ mode: "PAPER" }, paperOpen);
      openTradesGauge.set({ mode: "LIVE" }, liveOpen);
    } catch { /* best-effort — a failed refresh just leaves the prior value */ }
  }
}

let refreshTimer: NodeJS.Timeout | null = null;
export function startMetricsRefresh(intervalMs: number = 15_000): void {
  if (refreshTimer) return;
  refreshAppMetrics();
  refreshTimer = setInterval(refreshAppMetrics, intervalMs);
  if (typeof refreshTimer.unref === "function") refreshTimer.unref();
}

export async function metricsHandler(_req: any, res: any) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}
