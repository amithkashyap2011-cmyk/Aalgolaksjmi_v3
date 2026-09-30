/**
 * Optional fixed-IP egress for Binance API-key requests.
 *
 * Binance API keys are restricted to a whitelist of single IPs. On a mobile
 * connection the outbound IP changes on every reconnect (13 distinct IPs in one
 * day, none whitelisted), so signed calls fail with -2015 and the whitelist can
 * never keep up. Setting BINANCE_HTTP_PROXY routes every request that carries the
 * API key through one HTTP(S) proxy with a stable public IP (a small VPS running
 * tinyproxy/squid, or an SSH-forwarded local port); whitelist that IP once.
 *
 *   BINANCE_HTTP_PROXY=http://user:pass@203.0.113.10:8888
 *
 * Only key-carrying requests use it. Public market data, websockets and every
 * non-Binance call stay direct. Unset (default) = behaviour unchanged.
 *
 * Failure policy:
 *  - a malformed value warns once and falls back to direct (the system keeps
 *    running exactly as before);
 *  - an unreachable proxy is NOT silently bypassed — the request fails like any
 *    network error, because falling back would send the key from a
 *    non-whitelisted IP and hide the outage.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { assertEnabled } from "./credentialGate.js";

let cached: { url: string; agent: ProxyAgent } | undefined;
let warnedInvalid: string | undefined;

/** The configured proxy URL, or undefined when unset / not a valid http(s) URL. */
export function getBinanceProxyUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = (env.BINANCE_HTTP_PROXY ?? "").trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`unsupported protocol ${u.protocol}`);
    if (!u.hostname) throw new Error("missing host");
    return raw;
  } catch (e: any) {
    if (warnedInvalid !== raw) {
      warnedInvalid = raw;
      console.warn(
        `[binanceProxy] BINANCE_HTTP_PROXY is invalid (${e?.message ?? e}); expected http(s)://[user:pass@]host:port. ` +
          `Signed Binance requests will go out DIRECT from this machine's IP.`
      );
    }
    return undefined;
  }
}

/** Proxy URL safe for logs: credentials replaced. */
export function redactProxyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "";
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return "<invalid>";
  }
}

/** Status for logs / diagnostics. */
export function getBinanceProxyStatus(env: NodeJS.ProcessEnv = process.env): { enabled: boolean; proxy?: string } {
  const url = getBinanceProxyUrl(env);
  return url ? { enabled: true, proxy: redactProxyUrl(url) } : { enabled: false };
}

function getDispatcher(env: NodeJS.ProcessEnv): ProxyAgent | undefined {
  const url = getBinanceProxyUrl(env);
  if (!url) return undefined;
  if (!cached || cached.url !== url) {
    cached = { url, agent: new ProxyAgent(url) };
    console.log(`[binanceProxy] Signed Binance requests are routed through ${redactProxyUrl(url)}`);
  }
  return cached.agent;
}

/**
 * fetch() for any request that carries the Binance API key (signed REST calls,
 * key-authenticated endpoints). Identical to fetch() unless BINANCE_HTTP_PROXY
 * is set.
 */
export async function binanceSignedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  assertEnabled("binance"); // kill switch: no key-carrying request leaves while Binance keys are disabled
  const agent = getDispatcher(process.env);
  if (!agent) return fetch(input, init);
  // undici's own fetch is used with its own ProxyAgent so the dispatcher and the
  // client always come from the same undici version.
  return (await undiciFetch(input, { ...(init as any), dispatcher: agent })) as unknown as Response;
}

/** Test helper: forget the cached agent and the one-shot warning. */
export function resetBinanceProxyForTesting(): void {
  cached?.agent.close().catch(() => undefined);
  cached = undefined;
  warnedInvalid = undefined;
}
