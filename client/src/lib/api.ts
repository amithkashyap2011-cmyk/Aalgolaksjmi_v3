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
    "Accept": "application/json",
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
    }
    const message = body?.error || body?.message || `HTTP ${res.status}`;
    const error = new Error(message) as Error & { status?: number; body?: any };
    error.status = res.status;
    error.body = body;
    throw error;
  }
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

export async function testApiKeysRaw(apiKey: string, apiSecret: string) {
  return request<{ ok: boolean; balances: any[] }>("/apikeys/test-raw", {
    method: "POST",
    body: JSON.stringify({ apiKey, apiSecret }),
  });
}

export async function deleteApiKeys() {
  return request<{ ok: boolean }>("/apikeys/delete", {
    method: "DELETE",
  });
}

/* ── Trading ────────────────────────────────────────── */
export async function placeOrder(params: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  mode: "PAPER" | "LIVE";
  sl?: number;
  tp?: number;
  leverage?: number;
  accountType?: string;
}) {
  return request("/trading/place-order", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getOpenPositions(mode = "PAPER", accountType = "FUTURES") {
  return request<any[]>(`/trading/open-positions?mode=${mode}&accountType=${accountType}`);
}

export async function getKlines(symbol: string, interval = "1h", limit = 100) {
  return request<any[]>(`/trading/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
}

export async function getEnsembleReport(symbol: string, interval = "5m", limit = 200) {
  return request<any>(`/trading/ensemble-report?symbol=${symbol}&interval=${interval}&limit=${limit}`);
}

export async function getTradeHistory(mode: string, limit = 50, skip = 0, status?: "OPEN" | "CLOSED") {
  return request<{ trades: any[]; total: number }>(
    `/trading/history?mode=${mode}&limit=${limit}&skip=${skip}${status ? `&status=${status}` : ""}`,
  );
}

export async function getWallet(mode: string) {
  return request<Record<string, number>>(`/trading/wallet?mode=${mode}`);
}

export async function resetWalletAmount(amount: number, mode: string) {
  return request("/trading/wallet/reset", {
    method: "POST",
    body: JSON.stringify({ amount, mode }),
  });
}

export async function updateSlTp(params: { tradeId: string; sl?: number; tp?: number }) {
  return request("/trading/update-sl-tp", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/* ── Agent ──────────────────────────────────────────── */
export async function getRecommendation(symbol: string, mode: string) {
  return request(`/agent/recommendation?symbol=${symbol}&mode=${mode}`);
}

export async function getQuantumRecommendation(symbol: string, mode: string, exchange = "binance") {
  return request(`/agent/quantum/recommendation?symbol=${symbol}&mode=${mode}&exchange=${exchange}`);
}

/* ── Trading Alerts ── */
export async function getAlerts() {
  return request<{ alerts: any[] }>("/trading/alerts");
}

export async function enableAutoTrade(symbols: string[], primarySymbol?: string, accountType: "SPOT" | "FUTURES" = "FUTURES") {
  return request("/agent/auto/enable", {
    method: "POST",
    body: JSON.stringify({ symbols, primarySymbol, accountType }),
  });
}

export async function disableAutoTrade(accountType: "SPOT" | "FUTURES" = "FUTURES") {
  return request("/agent/auto/disable", {
    method: "POST",
    body: JSON.stringify({ accountType }),
  });
}

export async function getAutoStatus() {
  return request<{ autoTrade: boolean; spot: boolean; futures: boolean }>("/agent/auto/status");
}

export async function closePosition(tradeId: string, mode = "PAPER") {
  return request("/trading/close-position", {
    method: "POST",
    body: JSON.stringify({ tradeId, mode }),
  });
}

export async function modifyPosition(tradeId: string, sl?: number, tp?: number) {
  return request("/trading/modify-position", {
    method: "PATCH",
    body: JSON.stringify({ tradeId, sl, tp }),
  });
}

/* ── Api Keys Retrieval ── */
export async function getApiKeysStatus() {
  return request<{ saved: boolean; apiKey?: string; apiSecret?: string }>("/apikeys");
}

/* ── Health ─────────────────────────────────────────── */
export async function healthCheck() {
  return request("/health");
}

/* ── Wallet ────────────────────────────────────────────── */

export async function initWallet(mode: string = "PAPER", balance: number = 0) {
  return request<{
    message: string;
    newBalance: number;
    mode: string;
    initialized: boolean;
  }>(`/wallet/init`, {
    method: "POST",
    body: JSON.stringify({ mode, balance }),
  });
}

export async function getWalletBalance(mode: string, accountType: string = "FUTURES") {
  return request<{
    usdt: number;
    inrEquivalent: number;
    inrRate: number;
    totalBalance: number;
    lockedMargin: number;
    totalDeposited: number;
    totalWithdrawn: number;
    realizedBalance: number;
    bookedProfit: number;
    savingsUsdt: number;
    isUnactivated: boolean;
  }>(`/wallet/balance?mode=${mode}&accountType=${accountType}&sid=${(window as any)._aalgo_session || "unknown"}`);
}

export interface WalletSummaryResponse {
  spot: any;
  futures: any;
  nse: any;
  bse: any;
  nifty50: any;
  inrRate: number;
  timestamp: number;
}

export async function getWalletSummary(mode: string) {
  return request<WalletSummaryResponse>(`/wallet/summary?mode=${mode}&sid=${(window as any)._aalgo_session || "unknown"}`);
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

export async function withdrawUpi(usdtAmount: number, upiId: string, accountType = "FUTURES") {
  return request<any>("/wallet/withdraw/upi", {
    method: "POST",
    body: JSON.stringify({ usdtAmount, upiId, accountType }),
  });
}

export async function withdrawCrypto(symbol: string, amount: number, address: string, network: string, accountType = "FUTURES") {
  return request<any>("/wallet/withdraw/crypto", {
    method: "POST",
    body: JSON.stringify({ symbol, amount, address, network, accountType }),
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

export async function resetWallet(mode = "PAPER") {
  return request<any>("/trading/hard-reset", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export async function depositPaper(
  amount: number,
  accountType: string = "FUTURES",
  currency: string = "USDT",
  confirmConversion: boolean = false
) {
  return request<{ message: string; newBalance: number; currency?: string; accountType?: string; mode: string }>("/wallet/deposit/paper", {
    method: "POST",
    body: JSON.stringify({ amount, accountType, currency, confirmConversion }),
  });
}

export async function transferWallet(kind: "internal" | "external", amount: number, opts: { from?: "SPOT" | "FUTURES"; accountType?: string; mode?: string } = {}) {
  return request<{ message: string; from?: string; to?: string; amount?: number; newBalance?: number }>("/wallet/transfer", {
    method: "POST",
    body: JSON.stringify({ kind, amount, ...opts }),
  });
}

export async function allocateCapital(spotAmount: number, futuresAmount: number, mode: string = "PAPER") {
  return request<{ message: string; spot: number; futures: number }>("/api/wallet/allocate", {
    method: "POST",
    body: JSON.stringify({ spotAmount, futuresAmount, mode }),
  });
}

/* ── Control Center ── */
export async function updateStrategyWeights(weights: Record<string, number>) {
  return request("/trading/weights-update", {
    method: "POST",
    body: JSON.stringify({ weights }),
  });
}

export async function getCurrentWeights() {
  return request<Record<string, number>>("/trading/current-weights");
}

export async function getCurrentAnimalWeights() {
  return request<Record<string, number>>("/trading/current-animal-weights");
}

export async function getMarketCheck(symbol = "BTCUSDT", interval = "5m", limit = 200) {
  return request<any>(`/trading/market-check?symbol=${symbol}&interval=${interval}&limit=${limit}`);
}

export async function pauseTrading() {
  return request("/trading/control/pause", { method: "POST" });
}

export async function resumeTrading() {
  return request("/trading/control/resume", { method: "POST" });
}

export async function killSwitch() {
  return request("/trading/control/kill", { method: "POST" });
}

export async function getTradingStatus() {
  return request<{ status: string }>("/trading/control/status");
}

export async function getCurrentTickerPrices(symbols: string[] = []) {
  const query = symbols.length > 0 ? `?symbols=${symbols.join(",")}` : "";
  return request<Record<string, number>>(`/trading/ticker-prices${query}`);
}

export async function getCurrentTickerData(symbols: string[] = []) {
  const query = symbols.length > 0 ? `?symbols=${symbols.join(",")}` : "";
  return request<Record<string, any>>(`/trading/ticker-24hr${query}`);
}

/* ── Hard Reset ── */
export async function hardReset() {
  return request<{
    success: boolean;
    message: string;
    deletedTrades: number;
    deletedAlerts: number;
    newBalance: number;
  }>("/trading/hard-reset", { method: "POST" });
}

export async function getSpectralRegime() {
  return request<any>("/trading/spectral-regime");
}

/* ── AI Model Registry ─────────────────────────────────── */
export async function getModels() {
  return request<{ models: any[]; normalizedWeights: Record<string, number> }>("/models");
}

export async function toggleModel(id: string, enabled: boolean) {
  return request<{ model: any; normalizedWeights: Record<string, number> }>(`/models/${id}/toggle`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function getModelsToggles() {
  return request<{ success: boolean; toggles: Record<string, boolean> }>("/aqea-ui/models/toggles");
}

export async function toggleAqeaModel(modelKey: string, enabled: boolean) {
  return request<{ success: boolean; message: string; settings: any }>("/aqea-ui/models/toggles", {
    method: "POST",
    body: JSON.stringify({ modelKey, enabled }),
  });
}

export async function getWeatherEffect() {
  return request<{ enabled: boolean; influence: number }>("/models/weather-effect");
}

export async function getTrainingStatus() {
  return request<{
    enabled: boolean;
    interval_seconds: number;
    last_cycle: {
      cnn: { promoted: boolean; f1?: number; accuracy?: number; rows_trained?: number; rows_validated?: number; reason?: string; error?: string } | null;
      ppo: { promoted: boolean; avg_reward_per_step?: number; total_reward?: number; steps_trained?: number; reason?: string; error?: string } | null;
      started_at: number | null;
      finished_at: number | null;
    };
    cnn_train_state: Record<string, any>;
    ppo_train_state: Record<string, any>;
  }>("/models/training-status");
}

export async function setWeatherEffect(patch: { enabled?: boolean; influence?: number }) {
  return request<{ enabled: boolean; influence: number }>("/models/weather-effect", {
    method: "POST",
    body: JSON.stringify(patch),
  });
}

export async function updateModelWeight(id: string, weight: number) {
  return request<{ model: any; normalizedWeights: Record<string, number> }>(`/models/${id}/weight`, {
    method: "POST",
    body: JSON.stringify({ weight }),
  });
}

export async function updateBulkWeights(weights: Record<string, number>) {
  return request<{ models: any[]; normalizedWeights: Record<string, number> }>("/models/weights", {
    method: "POST",
    body: JSON.stringify({ weights }),
  });
}

export async function runModelHealthCheck() {
  return request<{ models: any[] }>("/models/health-check", {
    method: "POST",
  });
}

export async function resetModels() {
  return request<{ models: any[]; normalizedWeights: Record<string, number> }>("/models/reset", {
    method: "POST",
  });
}

/* ── V8.0 Institutional API ─────────────────────────── */
export async function getAITimeline(symbol?: string, limit = 50) {
  const query = symbol ? `?symbol=${symbol}&limit=${limit}` : `?limit=${limit}`;
  return request<any[]>(`/ai-timeline/timeline${query}`);
}

export async function getRiskOrchestration() {
  return request<any>("/platform/risk-orchestration");
}

export async function getSentimentMatrix() {
  return request<any>("/platform/sentiment-matrix");
}

export async function getSystemTelemetry() {
  return request<any>("/platform/telemetry");
}

/* ── Service Control ─────────────────────────────────── */
export async function getServicesStatus() {
  return request<any>("/system/services/status");
}
export async function startQuant() {
  return request<any>("/system/quant/start", { method: "POST" });
}
export async function stopQuant() {
  return request<any>("/system/quant/stop", { method: "POST" });
}
export async function restartQuant() {
  return request<any>("/system/quant/restart", { method: "POST" });
}
export async function restartServer() {
  return request<any>("/system/server/restart", { method: "POST" });
}

/* ── External sync (Settings → EXTERNAL_SYNC) ───────── */
export async function getExternalSyncStatus() {
  return request<any>("/system/external-sync/status");
}
export async function syncBinanceTime() {
  return request<any>("/system/external-sync/time", { method: "POST" });
}
export async function refreshExchangeInfo() {
  return request<any>("/system/external-sync/exchange-info", { method: "POST" });
}
export async function syncLiveAccount() {
  return request<any>("/system/external-sync/account", { method: "POST" });
}

/* ── Trade archive / clear ──────────────────────────── */
export async function archiveTrade(tradeId: string, archive = true) {
  return request<any>(`/aqea-ui/trades/${tradeId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archive }),
  });
}
export async function archiveAllTrades(userId: string) {
  return request<any>(`/aqea-ui/trades/archive-all`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}
export async function clearArchivedTrades(userId: string) {
  return request<any>(`/aqea-ui/trades/clear-archived?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}
export async function getTradesWithArchived(userId: string, limit = 100) {
  return request<any[]>(`/aqea-ui/trades?userId=${encodeURIComponent(userId)}&limit=${limit}&archived=true`);
}
