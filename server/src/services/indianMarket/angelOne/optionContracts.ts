/**
 * Real Indian option contracts from Angel One's public scrip master.
 *
 * The app generated contracts itself — Thursday weekly expiries for every
 * underlying and stale lot sizes (NIFTY 75 vs a real 65, BANKNIFTY 15 vs 30,
 * RELIANCE 250 vs 500). The exchange's own list shows NIFTY weeklies on
 * Tuesdays, BANKNIFTY/FINNIFTY/stocks monthly only, SENSEX weekly Thursdays.
 * This registry loads the real contracts once a day (cached under
 * server/runtime/) and answers expiry / strike / lot / token lookups
 * synchronously so the existing strategy code can use it directly.
 *
 * Scrip master conventions: strike and tick_size are stored ×100.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIP_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
const CACHE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../runtime/angel_option_contracts.json");

/** App underlying → scrip-master name + exchange segment. */
const UNDERLYINGS: Record<string, { name: string; seg: "NFO" | "BFO"; type: "OPTIDX" | "OPTSTK" }> = {
  NIFTY:      { name: "NIFTY",      seg: "NFO", type: "OPTIDX" },
  BANKNIFTY:  { name: "BANKNIFTY",  seg: "NFO", type: "OPTIDX" },
  FINNIFTY:   { name: "FINNIFTY",   seg: "NFO", type: "OPTIDX" },
  SENSEX:     { name: "SENSEX",     seg: "BFO", type: "OPTIDX" },
  RELIANCE:   { name: "RELIANCE",   seg: "NFO", type: "OPTSTK" },
  TCS:        { name: "TCS",        seg: "NFO", type: "OPTSTK" },
  HDFCBANK:   { name: "HDFCBANK",   seg: "NFO", type: "OPTSTK" },
  INFY:       { name: "INFY",       seg: "NFO", type: "OPTSTK" },
  ICICIBANK:  { name: "ICICIBANK",  seg: "NFO", type: "OPTSTK" },
  TATASTEEL:  { name: "TATASTEEL",  seg: "NFO", type: "OPTSTK" },
  SBIN:       { name: "SBIN",       seg: "NFO", type: "OPTSTK" },
  AXISBANK:   { name: "AXISBANK",   seg: "NFO", type: "OPTSTK" },
  KOTAKBANK:  { name: "KOTAKBANK",  seg: "NFO", type: "OPTSTK" },
  BHARTIARTL: { name: "BHARTIARTL", seg: "NFO", type: "OPTSTK" },
  TATAMOTORS: { name: "TMPV",       seg: "NFO", type: "OPTSTK" }, // demerged: options trade as TMPV
};

export interface OptionContract {
  token: string;
  exchange: "NFO" | "BFO";
  tradingSymbol: string;
  strike: number;
  type: "CE" | "PE";
  expiry: string; // YYYY-MM-DD
  lotSize: number;
  tickSize: number;
}

interface CacheShape {
  date: string; // IST date the master was fetched
  contracts: Record<string, OptionContract[]>; // underlying → contracts
}

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

function istDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** "29SEP2026" → "2026-09-29" */
function toIsoDate(masterExpiry: string): string {
  return `${masterExpiry.slice(5, 9)}-${MONTHS[masterExpiry.slice(2, 5)]}-${masterExpiry.slice(0, 2)}`;
}

/** Expiry settles 15:30 IST on the expiry date. */
export function expiryCloseTime(isoDate: string): Date {
  return new Date(`${isoDate}T15:30:00+05:30`);
}

class OptionContractRegistry {
  private byUnderlying = new Map<string, OptionContract[]>();
  private index = new Map<string, OptionContract>(); // `${und}|${expiry}|${strike}|${type}`
  private byToken = new Map<string, OptionContract>();
  private loadedDate: string | null = null;
  lastError: string | undefined;

  isLoaded(underlying?: string): boolean {
    return underlying ? (this.byUnderlying.get(underlying)?.length ?? 0) > 0 : this.byUnderlying.size > 0;
  }

  private ingest(contracts: Record<string, OptionContract[]>, date: string): void {
    this.byUnderlying.clear();
    this.index.clear();
    this.byToken.clear();
    for (const [und, list] of Object.entries(contracts)) {
      this.byUnderlying.set(und, list);
      for (const c of list) {
        this.index.set(`${und}|${c.expiry}|${c.strike}|${c.type}`, c);
        this.byToken.set(c.token, c);
      }
    }
    this.loadedDate = date;
  }

  /** Replace the registry with the given contracts (tests / fixtures). */
  loadContracts(contracts: Record<string, OptionContract[]>, date: string = istDateKey()): void {
    this.ingest(contracts, date);
  }

  /** Loads today's contracts from cache, else downloads the master (~35MB). */
  async load(): Promise<void> {
    const today = istDateKey();
    try {
      const cached: CacheShape = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      if (cached.date === today) {
        this.ingest(cached.contracts, cached.date);
        return;
      }
    } catch { /* no cache yet */ }

    const res = await fetch(SCRIP_MASTER_URL, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`scrip master HTTP ${res.status}`);
    const rows = (await res.json()) as any[];
    const wanted = new Map(Object.entries(UNDERLYINGS).map(([und, u]) => [`${u.seg}|${u.name}|${u.type}`, und]));
    const contracts: Record<string, OptionContract[]> = {};
    for (const r of rows) {
      const und = wanted.get(`${r.exch_seg}|${r.name}|${r.instrumenttype}`);
      if (!und) continue;
      const sym = String(r.symbol);
      const type = sym.endsWith("CE") ? "CE" : sym.endsWith("PE") ? "PE" : null;
      if (!type || !r.expiry) continue;
      (contracts[und] ??= []).push({
        token: String(r.token),
        exchange: r.exch_seg,
        tradingSymbol: sym,
        strike: Number(r.strike) / 100,
        type,
        expiry: toIsoDate(String(r.expiry)),
        lotSize: Number(r.lotsize) || 1,
        tickSize: (Number(r.tick_size) || 5) / 100,
      });
    }
    this.ingest(contracts, today);
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ date: today, contracts } satisfies CacheShape));
    } catch { /* cache is best-effort */ }
  }

  /** Reloads when the IST date has changed (new contracts listed / expired). */
  async refreshIfStale(): Promise<void> {
    if (this.loadedDate !== istDateKey()) await this.load();
  }

  /** Live (not yet settled) expiries, nearest first. */
  getExpiries(underlying: string, now: Date = new Date()): string[] {
    const list = this.byUnderlying.get(underlying) ?? [];
    return [...new Set(list.map((c) => c.expiry))]
      .filter((e) => expiryCloseTime(e).getTime() > now.getTime())
      .sort();
  }

  /** True when `expiry` is the last listed expiry of its calendar month. */
  isMonthlyExpiry(underlying: string, expiry: string): boolean {
    const month = expiry.slice(0, 7);
    const sameMonth = this.getExpiries(underlying).filter((e) => e.startsWith(month));
    return sameMonth[sameMonth.length - 1] === expiry;
  }

  getStrikes(underlying: string, expiry: string): number[] {
    return [...new Set((this.byUnderlying.get(underlying) ?? []).filter((c) => c.expiry === expiry).map((c) => c.strike))].sort((a, b) => a - b);
  }

  /** Typical strike spacing near `spot` for the nearest expiry. */
  getStrikeStep(underlying: string, spot: number): number | undefined {
    const exp = this.getExpiries(underlying)[0];
    if (!exp) return undefined;
    const strikes = this.getStrikes(underlying, exp);
    const near = strikes.filter((k) => Math.abs(k - spot) / spot < 0.05);
    const pool = near.length >= 3 ? near : strikes;
    let best = Infinity;
    for (let i = 1; i < pool.length; i++) best = Math.min(best, pool[i] - pool[i - 1]);
    return Number.isFinite(best) && best > 0 ? best : undefined;
  }

  getContract(underlying: string, expiry: string, strike: number, type: "CE" | "PE"): OptionContract | undefined {
    return this.index.get(`${underlying}|${expiry}|${strike}|${type}`);
  }

  getByToken(token: string): OptionContract | undefined {
    return this.byToken.get(token);
  }

  /** Current lot size (from the nearest expiry's contracts). */
  getLotSize(underlying: string): number | undefined {
    const exp = this.getExpiries(underlying)[0];
    return exp ? (this.byUnderlying.get(underlying) ?? []).find((c) => c.expiry === exp)?.lotSize : undefined;
  }

  /** Nearest-expiry contracts within ±`width` strikes of spot (both CE and PE). */
  getAtmWindow(underlying: string, spot: number, width: number): OptionContract[] {
    const exp = this.getExpiries(underlying)[0];
    if (!exp) return [];
    const strikes = this.getStrikes(underlying, exp);
    if (strikes.length === 0) return [];
    let atmIdx = 0;
    for (let i = 1; i < strikes.length; i++) if (Math.abs(strikes[i] - spot) < Math.abs(strikes[atmIdx] - spot)) atmIdx = i;
    const picked = strikes.slice(Math.max(0, atmIdx - width), atmIdx + width + 1);
    const out: OptionContract[] = [];
    for (const k of picked) for (const t of ["CE", "PE"] as const) {
      const c = this.getContract(underlying, exp, k, t);
      if (c) out.push(c);
    }
    return out;
  }
}

export const optionContracts = new OptionContractRegistry();
export const OPTION_UNDERLYINGS = Object.keys(UNDERLYINGS);
