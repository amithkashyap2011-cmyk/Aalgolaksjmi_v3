#!/usr/bin/env node
/*
 * ─── Load test ──────────────────────────────────────────
 *
 * Ramps concurrency against the running server's PAPER-mode trading
 * routes and measures latency/success rate at each stage. Deliberately
 * capped well below "thousands of orders" — every PAPER order placement
 * still calls Binance's real public ticker REST endpoint (verified: no
 * pre-fetch cache check in binanceService.getTickerPrice), so pushing
 * this into the thousands risks a real rate-limit response on the
 * account's IP, not just a local resource question. The cap here is a
 * safety decision, not evidence of a lower system limit.
 */
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

const SERVER_URL = "http://127.0.0.1:9991";
const USER_ID = process.argv[2] || "6a39c0e7a5e2995ed257ca68";
const TOKEN = jwt.sign({ sub: USER_ID }, process.env.JWT_SECRET, { expiresIn: "30m" });
// Deliberately only these two: they're confirmed-valid Binance tickers AND
// currently flat with no real auto-engine-managed position — every other
// allowed symbol for this user either has a real, AI-managed open position
// right now (BTCUSDT/ETHUSDT/BNBUSDT/ADAUSDT/XRPUSDT — averaging test
// orders into those would corrupt real position state) or isn't a real
// Binance ticker at all (MEMECOIN/TETHER/SOLONA/TRON/MONERO/PI/ETC are
// placeholder symbols in this test user's settings, not real listings).
const SYMBOLS = ["DOGEUSDT", "SHIBUSDT"];

async function timedFetch(url, opts) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, body };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: err.message };
  }
}

function placeOrder(symbol) {
  return timedFetch(`${SERVER_URL}/trading/place-order`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, side: "BUY", quantity: 1, mode: "PAPER", accountType: "FUTURES", leverage: 1 }),
    signal: AbortSignal.timeout(15000),
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

async function runStage(concurrency) {
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    const symbol = SYMBOLS[i % SYMBOLS.length];
    promises.push(placeOrder(symbol));
  }
  const t0 = Date.now();
  const results = await Promise.all(promises);
  const wallMs = Date.now() - t0;

  const latencies = results.map(r => r.ms).sort((a, b) => a - b);
  const successes = results.filter(r => r.ok).length;
  const failures = results.filter(r => !r.ok);
  const statusCounts = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

  return {
    concurrency,
    wallMs,
    throughputPerSec: +(concurrency / (wallMs / 1000)).toFixed(2),
    successes,
    failures: failures.length,
    successRatePct: +((100 * successes) / concurrency).toFixed(1),
    statusCounts,
    latencyMs: {
      min: latencies[0],
      p50: percentile(latencies, 0.5),
      p90: percentile(latencies, 0.9),
      p99: percentile(latencies, 0.99),
      max: latencies[latencies.length - 1],
    },
    sampleErrors: failures.slice(0, 3).map(f => f.error || f.body?.error || `status ${f.status}`),
  };
}

const stages = [10, 25, 50, 100];
const report = [];
for (const c of stages) {
  console.log(`\n=== Stage: ${c} concurrent orders ===`);
  const result = await runStage(c);
  console.log(JSON.stringify(result, null, 2));
  report.push(result);
  await new Promise(r => setTimeout(r, 2000)); // brief cooldown between stages
}

console.log("\n\n=== FULL REPORT ===");
console.log(JSON.stringify(report, null, 2));
