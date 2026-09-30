#!/usr/bin/env node
/**
 * Public-IP stability monitor.
 *
 * Binance API keys are IP-whitelisted, so the deciding question for any network is
 * "how often does its public IP change?". This logs every CHANGE (not every check)
 * with a timestamp, then summarises it.
 *
 *   node scripts/ip_watch.mjs             check every 60s, forever (Ctrl-C to stop)
 *   node scripts/ip_watch.mjs --once      one check, log if changed, exit
 *   node scripts/ip_watch.mjs --summary   report from the log
 *
 * Log: logs/ip-watch.log — one line per change:  <ISO time>\t<ip>
 * Env (optional): IP_WATCH_LOG, IP_WATCH_URLS (comma list), IP_WATCH_INTERVAL_S
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG = process.env.IP_WATCH_LOG || path.join(ROOT, "logs", "ip-watch.log");
const URLS = (process.env.IP_WATCH_URLS || "https://api.ipify.org,https://ipv4.icanhazip.com").split(",").map((s) => s.trim()).filter(Boolean);
const INTERVAL_MS = Math.max(1, Number(process.env.IP_WATCH_INTERVAL_S || 60)) * 1000;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export async function currentIp() {
  for (const url of URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const text = (await res.text()).trim();
      if (res.ok && IPV4.test(text)) return text;
    } catch { /* try the next service */ }
  }
  return null; // offline / all services unreachable: not a change
}

export function readEntries(file = LOG) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => {
    const [at, ip] = l.split("\t");
    return { at: new Date(at), ip };
  }).filter((e) => !Number.isNaN(e.at.getTime()) && IPV4.test(e.ip || ""));
}

/** Logs `ip` if it differs from the last logged one. Returns true when a line was written. */
export function recordIfChanged(ip, now = new Date(), file = LOG) {
  const entries = readEntries(file);
  if (entries.length && entries[entries.length - 1].ip === ip) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${now.toISOString()}\t${ip}\n`);
  return true;
}

const hours = (ms) => ms / 3_600_000;
const fmt = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : h >= 1 ? `${h.toFixed(1)} h` : `${Math.round(h * 60)} min`);

export function summarize(entries, now = new Date()) {
  if (entries.length === 0) return "No data yet — run:  node scripts/ip_watch.mjs";
  const spanH = hours(now - entries[0].at);
  const stretches = entries.map((e, i) => hours((entries[i + 1]?.at ?? now) - e.at));
  const longest = Math.max(...stretches);
  const changes = entries.length - 1;
  const distinct = new Set(entries.map((e) => e.ip)).size;
  const currentH = stretches[stretches.length - 1];
  const perDay = spanH >= 1 ? (changes / spanH) * 24 : null;
  let verdict;
  if (spanH < 6) verdict = "Too early to judge — let it run at least 24 hours.";
  else if (perDay <= 0.5) verdict = "STABLE: the IP rarely changes — whitelist it and re-check occasionally.";
  else if (perDay <= 3) verdict = "SEMI-STABLE: changes a few times a day — a whitelist will need frequent edits; a fixed-IP proxy is safer.";
  else verdict = "UNSTABLE: changes constantly (carrier-style NAT) — a whitelist cannot keep up; use a fixed-IP proxy.";
  return [
    `Observed for   : ${fmt(spanH)} (since ${entries[0].at.toISOString()})`,
    `IP changes     : ${changes}${perDay === null ? "" : `  (~${perDay.toFixed(1)} per day)`}`,
    `Distinct IPs   : ${distinct}`,
    `Longest stable : ${fmt(longest)}`,
    `Current IP     : ${entries[entries.length - 1].ip}  (unchanged for ${fmt(currentH)})`,
    `Verdict        : ${verdict}`,
  ].join("\n");
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--summary") { console.log(summarize(readEntries())); return; }
  const check = async () => {
    const ip = await currentIp();
    if (!ip) return console.log(`${new Date().toISOString()}  (no internet / IP services unreachable)`);
    const changed = recordIfChanged(ip);
    console.log(`${new Date().toISOString()}  ${ip}${changed ? "   <-- CHANGED, logged" : ""}`);
  };
  await check();
  if (arg === "--once") return;
  console.log(`watching every ${INTERVAL_MS / 1000}s; changes are logged to ${LOG}`);
  setInterval(check, INTERVAL_MS);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
