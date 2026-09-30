/*
 * scripts/ip_watch.mjs — logs public-IP CHANGES so a network's stability can be
 * measured before trusting it with an IP-whitelisted Binance key.
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../scripts/ip_watch.mjs", import.meta.url));
let dir: string;
let server: http.Server;
let answers: string[];   // what the fake "what's my IP" service returns next
let port: number;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ipwatch-"));
  answers = [];
  server = http.createServer((_req, res) => {
    const next = answers.length > 1 ? answers.shift()! : answers[0];
    if (next === "FAIL") { res.statusCode = 500; res.end("nope"); } else res.end(next + "\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as net.AddressInfo).port;
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const logFile = () => path.join(dir, "ip.log");
// Async on purpose: the fake IP service runs in THIS process, so a blocking spawnSync
// would freeze it and the script's request would never be answered.
function run(...args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile("node", [SCRIPT, ...args], {
      env: { ...process.env, IP_WATCH_LOG: logFile(), IP_WATCH_URLS: `http://127.0.0.1:${port}/` },
      encoding: "utf8", timeout: 20_000,
    }, (error: any, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, out: String(stdout).trim(), err: String(stderr).trim() }));
  });
}
const lines = () => (fs.existsSync(logFile()) ? fs.readFileSync(logFile(), "utf8").split("\n").filter(Boolean) : []);

test("logs the first IP, then only CHANGES", async () => {
  answers = ["203.0.113.5"];
  expect((await run("--once")).out).toContain("203.0.113.5");
  await run("--once"); await run("--once");                        // same IP again: nothing new logged
  expect(lines()).toHaveLength(1);
  answers = ["198.51.100.9"];
  expect((await run("--once")).out).toContain("CHANGED");
  expect(lines()).toHaveLength(2);
  expect(lines().map((l) => l.split("\t")[1])).toEqual(["203.0.113.5", "198.51.100.9"]);
});

test("an unreachable service or a non-IP answer is not treated as a change", async () => {
  answers = ["203.0.113.5"]; await run("--once");
  answers = ["FAIL"];
  expect((await run("--once")).out).toContain("no internet");
  answers = ["<html>captive portal</html>"];
  expect((await run("--once")).out).toContain("no internet");
  expect(lines()).toHaveLength(1);
});

test("the summary judges stability from the log", async () => {
  const { summarize } = await import(SCRIPT);
  const t0 = new Date("2026-09-30T00:00:00Z");
  const at = (h: number) => new Date(t0.getTime() + h * 3_600_000);

  expect(summarize([])).toMatch(/No data yet/);
  expect(summarize([{ at: t0, ip: "1.1.1.1" }], at(2))).toMatch(/Too early/);

  // Mobile-carrier style: 8 changes in ~6.5 hours
  const jumpy = Array.from({ length: 9 }, (_, i) => ({ at: at(i * 0.8), ip: `10.0.0.${i}` }));
  const bad = summarize(jumpy, at(7));
  expect(bad).toMatch(/UNSTABLE/);
  expect(bad).toMatch(/IP changes\s+: 8/);

  // Home-broadband style: one change in 3 days
  const calm = [{ at: t0, ip: "49.1.1.1" }, { at: at(60), ip: "49.1.1.2" }];
  const good = summarize(calm, at(72));
  expect(good).toMatch(/STABLE/);
  expect(good).toMatch(/Longest stable : 2\.5 days/);
});

test("--summary reads the log file", async () => {
  fs.writeFileSync(logFile(), "2026-09-30T00:00:00.000Z\t203.0.113.5\n");
  const r = await run("--summary");
  expect(r.code).toBe(0);
  expect(r.out).toContain("203.0.113.5");
});

test("the PM2 ecosystem registers the monitor", async () => {
  const { createRequire } = await import("node:module");
  const eco = createRequire(import.meta.url)(path.resolve(path.dirname(SCRIPT), "../ecosystem.config.js"));
  const app = eco.apps.find((a: any) => a.name === "ip-watch");
  expect(app?.script).toBe("scripts/ip_watch.mjs");
  expect(app?.autorestart).toBe(true);
});
