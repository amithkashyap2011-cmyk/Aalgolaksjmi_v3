/*
 * Optional fixed-IP egress for Binance API-key requests (BINANCE_HTTP_PROXY).
 * Covers config parsing, credential redaction, a real request going through a
 * real local proxy, direct behaviour when unset, and a source guard so a new
 * key-carrying fetch() can't silently bypass the proxy.
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jest } from "@jest/globals";
import {
  binanceSignedFetch,
  getBinanceProxyStatus,
  getBinanceProxyUrl,
  redactProxyUrl,
  resetBinanceProxyForTesting,
} from "../src/services/binanceProxy.js";

const ORIGINAL = process.env.BINANCE_HTTP_PROXY;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BINANCE_HTTP_PROXY; else process.env.BINANCE_HTTP_PROXY = ORIGINAL;
  resetBinanceProxyForTesting();
});

describe("getBinanceProxyUrl", () => {
  test("unset or blank means no proxy", () => {
    expect(getBinanceProxyUrl({})).toBeUndefined();
    expect(getBinanceProxyUrl({ BINANCE_HTTP_PROXY: "   " } as any)).toBeUndefined();
  });

  test("accepts http and https proxies, trimmed", () => {
    expect(getBinanceProxyUrl({ BINANCE_HTTP_PROXY: " http://203.0.113.10:8888 " } as any)).toBe("http://203.0.113.10:8888");
    expect(getBinanceProxyUrl({ BINANCE_HTTP_PROXY: "https://u:p@proxy.example:443" } as any)).toBe("https://u:p@proxy.example:443");
  });

  test("a malformed or unsupported value warns once and falls back to direct", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(getBinanceProxyUrl({ BINANCE_HTTP_PROXY: "not a url" } as any)).toBeUndefined();
      expect(getBinanceProxyUrl({ BINANCE_HTTP_PROXY: "not a url" } as any)).toBeUndefined();   // second call: no repeat warning
      expect(getBinanceProxyUrl({ BINANCE_HTTP_PROXY: "socks5://1.2.3.4:1080" } as any)).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(2);                                                    // one per distinct bad value
      expect(String(warn.mock.calls[0][0])).toMatch(/DIRECT/);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("credential redaction", () => {
  test("logs never contain the proxy username or password", () => {
    const shown = redactProxyUrl("http://alice:s3cret@203.0.113.10:8888");
    expect(shown).not.toContain("alice");
    expect(shown).not.toContain("s3cret");
    expect(shown).toContain("203.0.113.10:8888");
    expect(JSON.stringify(getBinanceProxyStatus({ BINANCE_HTTP_PROXY: "http://alice:s3cret@203.0.113.10:8888" } as any)))
      .not.toMatch(/alice|s3cret/);
    expect(getBinanceProxyStatus({})).toEqual({ enabled: false });
  });
});

/** A tiny forward proxy: counts requests it relays (absolute-URI) and CONNECT tunnels. */
function startProxy(): Promise<{ port: number; seen: () => number; close: () => Promise<void> }> {
  let count = 0;
  const sockets = new Set<net.Socket>();
  const server = http.createServer((req, res) => {
    count++;
    const target = new URL(req.url!);
    const upstream = http.request(
      { host: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers: req.headers },
      (up) => { res.writeHead(up.statusCode!, up.headers); up.pipe(res); }
    );
    req.pipe(upstream);
  });
  server.on("connect", (req, clientSocket, head) => {
    count++;
    const [host, port] = req.url!.split(":");
    const upstream = net.connect(Number(port), host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(clientSocket); clientSocket.pipe(upstream);
    });
    sockets.add(clientSocket); sockets.add(upstream);
  });
  server.on("connection", (s) => sockets.add(s));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    port: (server.address() as net.AddressInfo).port,
    seen: () => count,
    close: () => new Promise((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()); }),
  })));
}

function startTarget(): Promise<{ port: number; requests: any[]; close: () => Promise<void> }> {
  const requests: any[] = [];
  const sockets = new Set<net.Socket>();
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, key: req.headers["x-mbx-apikey"] });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  server.on("connection", (s) => sockets.add(s));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    port: (server.address() as net.AddressInfo).port,
    requests,
    close: () => new Promise((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()); }),
  })));
}

describe("binanceSignedFetch", () => {
  test("with BINANCE_HTTP_PROXY set, the request (and its API key header) goes through the proxy", async () => {
    const target = await startTarget();
    const proxy = await startProxy();
    try {
      process.env.BINANCE_HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
      const res = await binanceSignedFetch(`http://127.0.0.1:${target.port}/fapi/v2/positionRisk?timestamp=1`, {
        headers: { "X-MBX-APIKEY": "test-key" },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(proxy.seen()).toBeGreaterThan(0);                                   // it really used the proxy
      expect(target.requests).toEqual([{ url: "/fapi/v2/positionRisk?timestamp=1", key: "test-key" }]);
    } finally {
      await proxy.close(); await target.close();
    }
  });

  test("with it unset, the request goes direct and never touches a proxy", async () => {
    const target = await startTarget();
    const proxy = await startProxy();
    try {
      delete process.env.BINANCE_HTTP_PROXY;
      const res = await binanceSignedFetch(`http://127.0.0.1:${target.port}/api/v3/account`, { headers: { "X-MBX-APIKEY": "k" } });
      expect(res.status).toBe(200);
      expect(proxy.seen()).toBe(0);
      expect(target.requests).toHaveLength(1);
    } finally {
      await proxy.close(); await target.close();
    }
  });

  test("an unreachable proxy fails loudly instead of silently going direct", async () => {
    const target = await startTarget();
    try {
      // A port nothing listens on: bind then release it.
      const dead = await new Promise<number>((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
      process.env.BINANCE_HTTP_PROXY = `http://127.0.0.1:${dead}`;
      await expect(binanceSignedFetch(`http://127.0.0.1:${target.port}/x`, { headers: { "X-MBX-APIKEY": "k" } })).rejects.toThrow();
      expect(target.requests).toHaveLength(0);                                    // the key never left via the direct path
    } finally {
      await target.close();
    }
  });
});

describe("no key-carrying fetch can bypass the proxy", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
      else if (p.endsWith(".ts")) out.push(p);
    }
    return out;
  }

  test("every X-MBX-APIKEY header is sent by binanceSignedFetch", () => {
    const root = fileURLToPath(new URL("../src", import.meta.url));
    const offenders: string[] = [];
    let sites = 0;
    for (const file of walk(root)) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/X-MBX-APIKEY/gi)) {
        sites++;
        const before = src.slice(Math.max(0, m.index! - 500), m.index!);
        const calls = [...before.matchAll(/(?<![A-Za-z_.])(binanceSignedFetch|fetch)\(/g)];
        const owner = calls.length ? calls[calls.length - 1][1] : "(none)";
        if (owner !== "binanceSignedFetch") offenders.push(`${path.relative(root, file)}: ${owner}`);
      }
    }
    expect(sites).toBeGreaterThanOrEqual(12);   // the 12 known sites are still being scanned
    expect(offenders).toEqual([]);
  });
});
