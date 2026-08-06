#!/usr/bin/env node
/*
 * ─── High-scale load test — isolated instance ──────────
 *
 * Targets the isolated load-test server (port 9997, separate MongoDB
 * database `aalgolakshmi_loadtest`, pointed at the local mock exchange —
 * see scripts/mock_exchange.mjs) so this can safely run at real scale
 * (thousands of orders) without touching production data or the real
 * Binance account/rate limits.
 */
const SERVER_URL = "http://127.0.0.1:9997";
const TOKEN = process.argv[2];
if (!TOKEN) { console.error("Usage: node load_test_isolated.mjs <jwt>"); process.exit(1); }

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT", "XRPUSDT"];

async function placeOrder(symbol) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${SERVER_URL}/trading/place-order`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, side: Math.random() > 0.5 ? "BUY" : "SELL", quantity: 0.001, mode: "PAPER", accountType: "FUTURES", leverage: 1 }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, error: body?.error };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: err.message };
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

async function runStage(concurrency) {
  const promises = [];
  for (let i = 0; i < concurrency; i++) promises.push(placeOrder(SYMBOLS[i % SYMBOLS.length]));
  const t0 = Date.now();
  const results = await Promise.all(promises);
  const wallMs = Date.now() - t0;
  const latencies = results.map(r => r.ms).sort((a, b) => a - b);
  const successes = results.filter(r => r.ok).length;
  const failures = results.filter(r => !r.ok);
  const statusCounts = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  return {
    concurrency, wallMs,
    throughputPerSec: +(concurrency / (wallMs / 1000)).toFixed(2),
    successes, failures: failures.length,
    successRatePct: +((100 * successes) / concurrency).toFixed(2),
    statusCounts,
    latencyMs: { min: latencies[0], p50: percentile(latencies, 0.5), p90: percentile(latencies, 0.9), p99: percentile(latencies, 0.99), max: latencies[latencies.length - 1] },
    sampleErrors: [...new Set(failures.map(f => f.error || `status ${f.status}`))].slice(0, 5),
  };
}

// Ramp to real institutional-scale numbers — safe here since the mock
// exchange has no rate limit and no real money.
const stages = [100, 500, 1000, 2000];
const report = [];
for (const c of stages) {
  console.log(`\n=== Stage: ${c} concurrent orders (isolated mock-exchange instance) ===`);
  const result = await runStage(c);
  console.log(JSON.stringify(result, null, 2));
  report.push(result);
  await new Promise(r => setTimeout(r, 1000));
}

// Then a genuine 10,000-total-order run, batched (not all at once — no real
// production system takes 10,000 truly simultaneous connections either;
// this measures sustained throughput across many orders, which is the
// meaningful "10,000 total orders" metric, not a single 10,000-way fan-out).
console.log(`\n=== Sustained run: 10,000 total orders in batches of 500 ===`);
const batchSize = 500;
const totalOrders = 10000;
let totalSuccesses = 0, totalFailures = 0;
const allLatencies = [];
const t0 = Date.now();
for (let done = 0; done < totalOrders; done += batchSize) {
  const n = Math.min(batchSize, totalOrders - done);
  const promises = [];
  for (let i = 0; i < n; i++) promises.push(placeOrder(SYMBOLS[i % SYMBOLS.length]));
  const results = await Promise.all(promises);
  totalSuccesses += results.filter(r => r.ok).length;
  totalFailures += results.filter(r => !r.ok).length;
  allLatencies.push(...results.map(r => r.ms));
}
const totalWallMs = Date.now() - t0;
allLatencies.sort((a, b) => a - b);
const sustainedResult = {
  totalOrders, totalWallMs,
  throughputPerSec: +(totalOrders / (totalWallMs / 1000)).toFixed(2),
  totalSuccesses, totalFailures,
  successRatePct: +((100 * totalSuccesses) / totalOrders).toFixed(2),
  latencyMs: { min: allLatencies[0], p50: percentile(allLatencies, 0.5), p90: percentile(allLatencies, 0.9), p99: percentile(allLatencies, 0.99), max: allLatencies[allLatencies.length - 1] },
};
console.log(JSON.stringify(sustainedResult, null, 2));

console.log("\n\n=== FULL REPORT ===");
console.log(JSON.stringify({ rampStages: report, sustained10k: sustainedResult }, null, 2));
