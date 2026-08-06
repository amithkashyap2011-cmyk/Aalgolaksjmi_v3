#!/usr/bin/env node
/*
 * ─── Mock Binance exchange (load-testing only) ─────────
 *
 * Minimal HTTP server implementing just what PAPER-mode order placement
 * actually calls (verified by grep: binance.getTickerPrice, spot + futures
 * ticker endpoints) — no real exchange interaction, no rate limits, no
 * real-money risk. Used only by an isolated, separate server instance
 * during high-scale load testing; never used by the real running app.
 */
import http from "node:http";

const PORT = process.env.MOCK_EXCHANGE_PORT || 9996;
const prices = new Map(); // symbol -> price, drifts slightly per request for realism

function priceFor(symbol) {
  if (!prices.has(symbol)) prices.set(symbol, 1 + Math.random() * 100);
  const p = prices.get(symbol) * (1 + (Math.random() - 0.5) * 0.001);
  prices.set(symbol, p);
  return p;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const symbol = url.searchParams.get("symbol") || "BTCUSDT";

  if (url.pathname === "/api/v3/ticker/price" || url.pathname === "/fapi/v1/ticker/price") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ symbol, price: priceFor(symbol).toFixed(6) }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `Mock exchange: no handler for ${req.method} ${url.pathname}` }));
});

server.listen(PORT, () => {
  console.log(`Mock exchange listening on :${PORT}`);
});
