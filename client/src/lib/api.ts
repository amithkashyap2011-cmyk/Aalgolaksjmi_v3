/*
 * ─── API Client ────────────────────────────────────────
 *
 * Centralised fetch wrapper that:
 *   - prepends the base URL (empty string when using Vite proxy)
 *   - attaches the JWT token from localStorage
 *   - parses JSON and throws on non-2xx
 */

const BASE = "";   // Vite proxy handles /auth, /trading, etc.
const TOKEN_KEY = "aalgo_jwt";

/* ── token helpers ──────────────────────────────────── */
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string): void {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* noop */ }
}
export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

/* ── generic fetch ──────────────────────────────────── */
async function request<T = any>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as T;
}

/* ── Auth ───────────────────────────────────────────── */
export async function register(email: string, password: string) {
  const data = await request<{ token: string; user: any }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function login(email: string, password: string) {
  const data = await request<{ token: string; user: any }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe() {
  return request("/auth/me");
}

/* ── Settings ───────────────────────────────────────── */
export async function getSettings() {
  return request("/settings/get");
}

export async function updateSettings(patch: Record<string, any>) {
  return request("/settings/update", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/* ── API Keys ───────────────────────────────────────── */
export async function saveApiKeys(apiKey: string, apiSecret: string) {
  return request("/apikeys/save", {
    method: "POST",
    body: JSON.stringify({ apiKey, apiSecret }),
  });
}

export async function testApiKeys() {
  return request<{ ok: boolean; balances: any[] }>("/apikeys/test", {
    method: "POST",
  });
}

/* ── Trading ────────────────────────────────────────── */
export async function placeOrder(params: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  mode: "PAPER" | "LIVE";
}) {
  return request("/trading/place-order", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getOpenPositions(mode: string) {
  return request(`/trading/open-positions?mode=${mode}`);
}

export async function getTradeHistory(mode: string, limit = 50, skip = 0) {
  return request<{ trades: any[]; total: number }>(
    `/trading/history?mode=${mode}&limit=${limit}&skip=${skip}`,
  );
}

export async function getWallet(mode: string) {
  return request<Record<string, number>>(`/trading/wallet?mode=${mode}`);
}

/* ── Agent ──────────────────────────────────────────── */
export async function getRecommendation(symbol: string, mode: string) {
  return request(`/agent/recommendation?symbol=${symbol}&mode=${mode}`);
}

export async function enableAutoTrade(symbols: string[]) {
  return request("/agent/auto/enable", {
    method: "POST",
    body: JSON.stringify({ symbols }),
  });
}

export async function disableAutoTrade() {
  return request("/agent/auto/disable", { method: "POST" });
}

export async function getAutoStatus() {
  return request("/agent/auto/status");
}

/* ── Health ─────────────────────────────────────────── */
export async function healthCheck() {
  return request("/health");
}

/* ── Wallet ────────────────────────────────────────────── */

export async function getWalletBalance(mode: string) {
  return request<{
    usdt: number;
    inrEquivalent: number;
    inrRate: number;
    totalDeposited: number;
    totalWithdrawn: number;
  }>(`/wallet/balance?mode=${mode}`);
}

export async function getWalletTransactions(limit = 50, skip = 0) {
  return request<{ transactions: any[]; total: number }>(
    `/wallet/transactions?limit=${limit}&skip=${skip}`,
  );
}

export async function depositUpi(amount: number, upiId: string) {
  return request<any>("/wallet/deposit/upi", {
    method: "POST",
    body: JSON.stringify({ amount, upiId }),
  });
}

export async function withdrawUpi(usdtAmount: number, upiId: string) {
  return request<any>("/wallet/withdraw/upi", {
    method: "POST",
    body: JSON.stringify({ usdtAmount, upiId }),
  });
}

export async function getP2pOffers() {
  return request<any[]>("/wallet/p2p/offers");
}

export async function createP2pOffer(usdtAmount: number, pricePerUsdt: number) {
  return request<any>("/wallet/p2p/create", {
    method: "POST",
    body: JSON.stringify({ usdtAmount, pricePerUsdt }),
  });
}

export async function buyP2pOffer(offerId: string) {
  return request<any>("/wallet/p2p/buy", {
    method: "POST",
    body: JSON.stringify({ offerId }),
  });
}
