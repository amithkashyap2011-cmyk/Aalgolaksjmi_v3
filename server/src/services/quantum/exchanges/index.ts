/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Exchange Adapters Barrel Export
 * ═══════════════════════════════════════════════════════════════════
 */

export { ExchangeManager, exchangeManager } from "./exchangeManager.js";
export { BinanceAdapter } from "./binanceAdapter.js";
export { BybitAdapter } from "./bybitAdapter.js";
export { OKXAdapter } from "./okxAdapter.js";
export { HyperliquidAdapter } from "./hyperliquidAdapter.js";
export { CoinbaseAdapter } from "./coinbaseAdapter.js";

/**
 * Initialize all exchange adapters and register them with the manager.
 * Call this once at server startup.
 */
import { exchangeManager } from "./exchangeManager.js";
import { BinanceAdapter } from "./binanceAdapter.js";
import { BybitAdapter } from "./bybitAdapter.js";
import { OKXAdapter } from "./okxAdapter.js";
import { HyperliquidAdapter } from "./hyperliquidAdapter.js";
import { CoinbaseAdapter } from "./coinbaseAdapter.js";

export function initializeExchanges(): void {
  exchangeManager.registerAdapter(new BinanceAdapter());
  exchangeManager.registerAdapter(new BybitAdapter());
  exchangeManager.registerAdapter(new OKXAdapter());
  exchangeManager.registerAdapter(new HyperliquidAdapter());
  exchangeManager.registerAdapter(new CoinbaseAdapter());
  exchangeManager.setPrimaryExchange("binance");
  exchangeManager.startHealthChecks(60_000);
  console.log("[QuantumEngine] All exchange adapters initialized");
}
