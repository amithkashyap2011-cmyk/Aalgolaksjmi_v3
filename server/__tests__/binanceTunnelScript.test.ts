/*
 * scripts/binance_tunnel.sh — the ssh tunnel that gives Binance API-key requests a
 * fixed IP. Runs the REAL script in dry-run mode (it prints the ssh command instead
 * of connecting), so nothing here touches the network.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../scripts/binance_tunnel.sh", import.meta.url));
let dir: string;

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "tunnel-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function run(envFileBody: string | null, extra: Record<string, string> = {}) {
  const envFile = path.join(dir, "server.env");
  if (envFileBody !== null) fs.writeFileSync(envFile, envFileBody);
  // A clean environment so a developer's real BINANCE_TUNNEL_* variables can't leak in.
  const env: Record<string, string> = { PATH: process.env.PATH!, HOME: dir, BINANCE_TUNNEL_DRYRUN: "1", BINANCE_TUNNEL_ENV_FILE: envFile, ...extra };
  const r = spawnSync("bash", [SCRIPT], { env, encoding: "utf8", timeout: 10_000 });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function keyFile(mode = 0o600): string {
  const k = path.join(dir, "vm.key");
  fs.writeFileSync(k, "not a real key");
  fs.chmodSync(k, mode);
  return k;
}

test("the script is valid bash and executable", () => {
  expect(spawnSync("bash", ["-n", SCRIPT]).status).toBe(0);
  expect(fs.statSync(SCRIPT).mode & 0o111).not.toBe(0);
});

test("without BINANCE_TUNNEL_HOST it reports NOT_CONFIGURED and does nothing", () => {
  expect(run("PORT=9991\n")).toMatchObject({ code: 0, out: "NOT_CONFIGURED" });
  expect(run(null)).toMatchObject({ code: 0, out: "NOT_CONFIGURED" });   // no env file at all
});

test("builds a loopback-only, self-healing tunnel to the VM's proxy", () => {
  const key = keyFile();
  const { code, out } = run(`BINANCE_TUNNEL_HOST=203.0.113.10\nBINANCE_TUNNEL_USER=ubuntu\nBINANCE_TUNNEL_KEY=${key}\n`);
  expect(code).toBe(0);
  expect(out).toContain("-L 127.0.0.1:18888:127.0.0.1:8888");          // local :18888 -> VM's tinyproxy :8888
  expect(out).toContain("ubuntu@203.0.113.10");
  expect(out).toContain(`-i ${key}`);
  expect(out).toContain("-o ExitOnForwardFailure=yes");                // dead forward => ssh exits => PM2 restarts it
  expect(out).toContain("-o ServerAliveInterval=15");
  expect(out).toContain("-o BatchMode=yes");                           // never blocks on a password prompt
  expect(out).not.toMatch(/0\.0\.0\.0|GatewayPorts|-D |-R /);          // never exposed to the network
});

test("defaults and overrides: ports and user are configurable", () => {
  const { out } = run("BINANCE_TUNNEL_HOST=vm.example.com\n", { BINANCE_TUNNEL_LOCAL_PORT: "19999", BINANCE_TUNNEL_SSH_PORT: "2222", BINANCE_TUNNEL_USER: "admin" });
  expect(out).toContain("-L 127.0.0.1:19999:127.0.0.1:8888");
  expect(out).toContain("-p 2222");
  expect(out).toContain("admin@vm.example.com");
});

test("the environment wins over the file; quotes and CRLF in the file are tolerated", () => {
  const a = run('BINANCE_TUNNEL_HOST="198.51.100.7"\r\n', {});
  expect(a.out).toContain("ubuntu@198.51.100.7");
  const b = run("BINANCE_TUNNEL_HOST=198.51.100.7\n", { BINANCE_TUNNEL_HOST: "203.0.113.99" });
  expect(b.out).toContain("203.0.113.99");
});

describe("rejects unsafe or broken configuration (exit 2, nothing runs)", () => {
  test.each([
    ["shell injection in the host", "BINANCE_TUNNEL_HOST=1.2.3.4;touch /tmp/pwned\n"],
    ["command substitution in the host", "BINANCE_TUNNEL_HOST=$(id)\n"],
    ["option-looking host", "BINANCE_TUNNEL_HOST=-oProxyCommand=evil\n"],
    ["bad user", "BINANCE_TUNNEL_HOST=1.2.3.4\nBINANCE_TUNNEL_USER=root;id\n"],
    ["non-numeric port", "BINANCE_TUNNEL_HOST=1.2.3.4\nBINANCE_TUNNEL_LOCAL_PORT=abc\n"],
    ["out-of-range port", "BINANCE_TUNNEL_HOST=1.2.3.4\nBINANCE_TUNNEL_SSH_PORT=70000\n"],
  ])("%s", (_name, body) => {
    const r = run(body);
    expect(r.code).toBe(2);
    expect(r.err).toContain("ERROR");
    expect(r.out).not.toContain("ssh ");
  });

  test("a key file that does not exist", () => {
    const r = run(`BINANCE_TUNNEL_HOST=1.2.3.4\nBINANCE_TUNNEL_KEY=${path.join(dir, "missing.key")}\n`);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/does not exist/);
  });

  test("a key file readable by other users", () => {
    const r = run(`BINANCE_TUNNEL_HOST=1.2.3.4\nBINANCE_TUNNEL_KEY=${keyFile(0o644)}\n`);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/chmod 600/);
  });
});

test("the PM2 ecosystem registers the tunnel app with restart-on-exit", async () => {
  const eco = (await import("node:module")).createRequire(import.meta.url)(path.resolve(path.dirname(SCRIPT), "../ecosystem.config.js"));
  const app = eco.apps.find((a: any) => a.name === "binance-tunnel");
  expect(app).toBeDefined();
  expect(app.script).toBe("scripts/binance_tunnel.sh");
  expect(app.autorestart).toBe(true);
  expect(app.exp_backoff_restart_delay).toBeGreaterThan(0);
});
