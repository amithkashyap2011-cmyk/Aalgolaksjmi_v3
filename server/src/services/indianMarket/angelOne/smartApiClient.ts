/**
 * Angel One SmartAPI client — READ-ONLY.
 *
 * Routes and headers follow Angel's official SDK (angel-one/smartapi-javascript
 * config/api.js + lib/smartapi-connect.js). Deliberately contains no order
 * routes: this client can log in, read the profile / funds / holdings /
 * positions, and fetch quotes — nothing that moves money.
 *
 * Login safety: Angel locks an account after repeated bad PIN/TOTP attempts,
 * so a failed login is never retried in a loop — it enters a 15 minute
 * cooldown and reports the broker's own error message.
 */
import os from "node:os";
import mongoose from "mongoose";
import { generateTotp } from "./totp.js";
import { readAngelOneCredentials } from "../angelOneCredentials.js";

const ROOT = "https://apiconnect.angelone.in";
const ROUTES = {
  login: "/rest/auth/angelbroking/user/v1/loginByPassword",
  profile: "/rest/secure/angelbroking/user/v1/getProfile",
  rms: "/rest/secure/angelbroking/user/v1/getRMS",
  holdings: "/rest/secure/angelbroking/portfolio/v1/getHolding",
  positions: "/rest/secure/angelbroking/order/v1/getPosition",
  quote: "/rest/secure/angelbroking/market/v1/quote",
} as const;

const LOGIN_COOLDOWN_MS = 15 * 60_000;
const DEFAULT_USER_ID = "6a39c0e7a5e2995ed257ca68";

interface Session {
  jwt: string;
  feedToken?: string;
  clientCode: string;
  apiKey: string;
  createdAt: number;
}

export interface AngelStatus {
  configured: boolean;
  connected: boolean;
  clientCode?: string;
  name?: string;
  lastLoginAt?: string;
  lastError?: string;
  cooldownUntil?: string;
}

function localNet(): { ip: string; mac: string } {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return { ip: a.address, mac: a.mac };
    }
  }
  return { ip: "127.0.0.1", mac: "00:00:00:00:00:00" };
}

let publicIpCache: { ip: string; at: number } | null = null;
async function publicIp(): Promise<string> {
  if (publicIpCache && Date.now() - publicIpCache.at < 10 * 60_000) return publicIpCache.ip;
  try {
    const ip = (await (await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(4000) })).text()).trim();
    publicIpCache = { ip, at: Date.now() };
    return ip;
  } catch {
    return publicIpCache?.ip ?? "127.0.0.1";
  }
}

class SmartApiClient {
  private session: Session | null = null;
  private loginInFlight: Promise<Session> | null = null;
  private cooldownUntil = 0;
  private lastError: string | undefined;
  private profileName: string | undefined;

  private async headers(apiKey: string, jwt?: string): Promise<Record<string, string>> {
    const { ip, mac } = localNet();
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": ip,
      "X-ClientPublicIP": await publicIp(),
      "X-MACAddress": mac,
      "X-PrivateKey": apiKey,
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    };
  }

  private async loadCredentials() {
    if (mongoose.connection.readyState !== 1) throw new Error("Database not connected");
    const s = await mongoose.connection.db!.collection("settings").findOne({ userId: new mongoose.Types.ObjectId(DEFAULT_USER_ID) });
    const creds = readAngelOneCredentials(s as any);
    if (creds.disabled) throw new Error("Angel One is disabled in Settings");
    if (!creds.apiKey || !creds.clientCode || !creds.pin || !creds.totpSecret) {
      throw new Error("Angel One credentials incomplete — API key, client code, PIN and TOTP secret are all required");
    }
    return creds;
  }

  async isConfigured(): Promise<boolean> {
    try { await this.loadCredentials(); return true; } catch { return false; }
  }

  private async login(): Promise<Session> {
    if (Date.now() < this.cooldownUntil) {
      throw new Error(`Angel One login paused after a failure (until ${new Date(this.cooldownUntil).toLocaleTimeString("en-IN")}): ${this.lastError}`);
    }
    const creds = await this.loadCredentials();
    const res = await fetch(ROOT + ROUTES.login, {
      method: "POST",
      headers: await this.headers(creds.apiKey),
      body: JSON.stringify({ clientcode: creds.clientCode, password: creds.pin, totp: generateTotp(creds.totpSecret) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body?.status || !body?.data?.jwtToken) {
      this.lastError = `${body?.errorcode || `HTTP ${res.status}`}: ${body?.message || "login failed"}`;
      this.cooldownUntil = Date.now() + LOGIN_COOLDOWN_MS;
      this.session = null;
      throw new Error(`Angel One login failed — ${this.lastError}`);
    }
    this.lastError = undefined;
    this.session = { jwt: body.data.jwtToken, feedToken: body.data.feedToken, clientCode: creds.clientCode, apiKey: creds.apiKey, createdAt: Date.now() };
    return this.session;
  }

  private async getSession(): Promise<Session> {
    // Angel sessions last until end of day; renew after 6h to be safe.
    if (this.session && Date.now() - this.session.createdAt < 6 * 3600_000) return this.session;
    if (!this.loginInFlight) this.loginInFlight = this.login().finally(() => { this.loginInFlight = null; });
    return this.loginInFlight;
  }

  private async call<T = any>(method: "GET" | "POST", route: keyof typeof ROUTES, body?: unknown, retried = false): Promise<T> {
    const s = await this.getSession();
    const res = await fetch(ROOT + ROUTES[route], {
      method,
      headers: await this.headers(s.apiKey, s.jwt),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json().catch(() => null);
    const expired = res.status === 401 || json?.errorcode === "AG8001" || json?.errorcode === "AG8002";
    if (expired && !retried) {
      this.session = null; // token expired/invalid → one fresh login, then give up
      return this.call<T>(method, route, body, true);
    }
    if (!res.ok || json?.status === false) {
      throw new Error(`Angel One ${route} failed — ${json?.errorcode || `HTTP ${res.status}`}: ${json?.message || "request failed"}`);
    }
    return json?.data as T;
  }

  async getProfile() {
    const p = await this.call<any>("GET", "profile");
    this.profileName = p?.name;
    return p;
  }
  getRms() { return this.call<any>("GET", "rms"); }
  getHoldings() { return this.call<any[]>("GET", "holdings"); }
  getPositions() { return this.call<any[]>("GET", "positions"); }

  /** mode: "LTP" | "OHLC" | "FULL"; exchangeTokens: { NSE: ["2885"], BSE: [...] } (≤50 tokens). */
  getQuotes(mode: "LTP" | "OHLC" | "FULL", exchangeTokens: Record<string, string[]>) {
    return this.call<{ fetched: any[]; unfetched: any[] }>("POST", "quote", { mode, exchangeTokens });
  }

  async status(): Promise<AngelStatus> {
    return {
      configured: await this.isConfigured(),
      connected: !!this.session,
      clientCode: this.session?.clientCode,
      name: this.profileName,
      lastLoginAt: this.session ? new Date(this.session.createdAt).toISOString() : undefined,
      lastError: this.lastError,
      cooldownUntil: Date.now() < this.cooldownUntil ? new Date(this.cooldownUntil).toISOString() : undefined,
    };
  }
}

export const smartApi = new SmartApiClient();
