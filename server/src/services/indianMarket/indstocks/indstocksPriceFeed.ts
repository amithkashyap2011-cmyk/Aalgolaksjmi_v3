/**
 * INDstocks (INDmoney) as a SECOND real-price source for the Indian market.
 *
 * Angel One stays primary. This feed polls INDstocks' LTP endpoint and
 *   1. applies its price only for symbols with no fresh real quote (Angel down /
 *      rate-limited), so the simulator is the last resort, not the first;
 *   2. always records how far its price is from Angel's, as a cross-check.
 *
 * Read-only: quotes only, no orders. Needs the token saved in Settings and the
 * "INDmoney" credential switch enabled (services/credentialGate).
 *
 * Scrip codes are "<SEGMENT>_<SECURITY_ID>". For NSE cash equities SECURITY_ID
 * equals Angel's token (NSE_3045 = SBIN), so those come straight from
 * ANGEL_INSTRUMENTS. Indices use different IDs and are looked up in the
 * instruments master — but as of 2026-09-30 the REST quote endpoints answer
 * {} for every index code (checked mid-session), so indices stay unresolved
 * (Angel only) until INDstocks serves them; nothing is guessed.
 */
import { Settings } from "../../../models/Settings.js";
import { ANGEL_INSTRUMENTS } from "../angelOne/instrumentTokens.js";
import { applyRealQuote, hasFreshRealQuote, MOCK_LIVE_INDIAN_TIKERS } from "../indianPricing.js";
import { IndianMarketHours } from "../../indianMarketHours.js";
import { isDisabled } from "../../credentialGate.js";
import { readIndmoneyToken } from "../indmoneyCredentials.js";

const BASE = "https://api.indstocks.com";
const OPEN_POLL_MS = 5_000;
const CLOSED_POLL_MS = 120_000;
const MAX_PER_CALL = 200; // API allows 1000; stay far below it

/** App symbol → INDstocks index name in the instruments master. */
const INDEX_NAMES: Record<string, { exch: string; name: RegExp }> = {
  NIFTY50: { exch: "NSE", name: /^nifty 50$/i },
  BANKNIFTY: { exch: "NSE", name: /^(bank nifty|nifty bank)$/i },
  FINNIFTY: { exch: "NSE", name: /^nifty fin(ancial|ancial services| service)$/i },
  SENSEX: { exch: "BSE", name: /^sensex$/i },
};

interface Status {
  running: boolean;
  lastQuoteAt?: string;
  symbolsLive: number;
  appliedAsFallback: number;
  maxDivergencePct?: number;
  divergence: Record<string, number>;
  unresolved: string[];
  lastError?: string;
}
const status: Status = { running: false, symbolsLive: 0, appliedAsFallback: 0, divergence: {}, unresolved: [] };
export const getIndstocksFeedStatus = (): Status => ({ ...status, divergence: { ...status.divergence } });

let scripBySymbol: Record<string, string> | null = null;
let timer: NodeJS.Timeout | null = null;

async function loadToken(): Promise<string> {
  // The token belongs to whichever account saved it; the feed is server-wide.
  const doc = await Settings.findOne({ indmoneyAccessToken: { $ne: "" } }).lean();
  return readIndmoneyToken(doc as any);
}

const get = async (path: string, token: string) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: token }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "INDmoney token rejected or expired" : `INDmoney HTTP ${res.status}`);
  return res;
};

/** Symbol → scrip code. Equities derive from Angel tokens; indices are looked up and verified. */
export async function resolveScrips(token: string, fetchGet = get): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const unresolved: string[] = [];
  for (const [sym, inst] of Object.entries(ANGEL_INSTRUMENTS)) {
    if (!INDEX_NAMES[sym]) out[sym] = `${inst.exchange}_${inst.token}`;
  }
  try {
    const csv = await (await fetchGet("/market/instruments?source=index", token)).text();
    const rows = csv.split("\n").slice(1).map((l) => l.trim().split(","));
    for (const [sym, want] of Object.entries(INDEX_NAMES)) {
      const row = rows.find((r) => r[0] === want.exch && want.name.test((r[1] ?? "").trim()));
      if (!row?.[2]) { unresolved.push(sym); continue; }
      // The segment prefix for indices is not documented; accept the first that returns a price.
      let found = "";
      for (const seg of [row[0], "IDX", "INDEX"]) {
        const code = `${seg}_${row[2]}`;
        try {
          const j: any = await (await fetchGet(`/market/quotes/ltp?scrip-codes=${code}`, token)).json();
          if (Number(j?.data?.[code]?.live_price) > 0) { found = code; break; }
        } catch { /* try next prefix */ }
      }
      if (found) out[sym] = found; else unresolved.push(sym);
    }
  } catch (e: any) {
    unresolved.push(...Object.keys(INDEX_NAMES));
    status.lastError = `index lookup: ${e?.message || e}`;
  }
  status.unresolved = unresolved;
  return out;
}

export async function pollOnce(token: string, fetchGet = get): Promise<void> {
  if (!scripBySymbol) scripBySymbol = await resolveScrips(token, fetchGet);
  const symbols = Object.keys(scripBySymbol);
  const bySymbolCode = new Map(symbols.map((s) => [scripBySymbol![s], s]));
  let live = 0;
  let applied = 0;
  const divergence: Record<string, number> = {};
  for (let i = 0; i < symbols.length; i += MAX_PER_CALL) {
    const codes = symbols.slice(i, i + MAX_PER_CALL).map((s) => scripBySymbol![s]);
    const j: any = await (await fetchGet(`/market/quotes/full?scrip-codes=${codes.join(",")}`, token)).json();
    for (const [code, q] of Object.entries<any>(j?.data ?? {})) {
      const sym = bySymbolCode.get(code);
      const ltp = Number(q?.live_price);
      if (!sym || !(ltp > 0)) continue;
      live++;
      if (hasFreshRealQuote(sym)) {
        // Angel is live for this symbol: only compare.
        const angel = MOCK_LIVE_INDIAN_TIKERS[sym]?.ltp;
        if (angel > 0) divergence[sym] = Math.round(((ltp - angel) / angel) * 10_000) / 100;
      } else {
        applyRealQuote(sym, {
          ltp,
          open: Number(q.day_open) || ltp,
          high: Number(q.day_high) || ltp,
          low: Number(q.day_low) || ltp,
          prevClose: Number(q.prev_close) || undefined,
          volume: Number(q.volume) || undefined,
        });
        applied++;
      }
    }
  }
  status.symbolsLive = live;
  status.appliedAsFallback = applied;
  status.divergence = divergence;
  const vals = Object.values(divergence).map(Math.abs);
  status.maxDivergencePct = vals.length ? Math.max(...vals) : undefined;
  status.lastQuoteAt = new Date().toISOString();
  status.lastError = undefined;
}

async function tick(): Promise<void> {
  try {
    if (isDisabled("indmoney")) {
      status.lastError = "INDmoney disabled in Settings";
    } else {
      const token = await loadToken();
      if (!token) status.lastError = "No INDmoney token saved";
      else await pollOnce(token);
    }
  } catch (e: any) {
    status.lastError = e?.message || String(e);
    scripBySymbol = null; // re-resolve next time (token may have been replaced)
  } finally {
    if (status.running) {
      timer = setTimeout(tick, IndianMarketHours.getSessionStatus().isOpen ? OPEN_POLL_MS : CLOSED_POLL_MS);
      timer.unref?.();
    }
  }
}

export function startIndstocksPriceFeed(): void {
  if (status.running || process.env.NODE_ENV === "test") return;
  status.running = true;
  void tick();
}

export function stopIndstocksPriceFeed(): void {
  status.running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Test helper. */
export function resetIndstocksFeedForTesting(): void {
  scripBySymbol = null;
  Object.assign(status, { running: false, symbolsLive: 0, appliedAsFallback: 0, divergence: {}, unresolved: [], lastError: undefined, maxDivergencePct: undefined });
}
