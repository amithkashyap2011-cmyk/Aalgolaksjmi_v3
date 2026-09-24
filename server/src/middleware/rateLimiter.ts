/*
 * ─── Authoritative Tiered Rate Limiting Architecture ───────────
 *
 * Implements 4 distinct, isolated rate tiers:
 * 1. USER_REQUEST_LIMIT: Endpoint-specific limits for user APIs (Auth, Orders, Cancels, Read-Only)
 * 2. BROKER_EVENT_LIMIT: Zero-drop bypass queue for broker callbacks & market webhooks
 * 3. INTERNAL_EVENT_LIMIT: Zero-drop bypass for internal loopback / quant IPC / agent kernel
 * 4. MARKET_DATA_LIMIT: Controlled emission rate for WebSocket client pushes
 *
 * Eliminates Warning #2 with burst, abuse, and connection flooding defenses.
 */
import rateLimit, { type Options } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

/**
 * Detects if the request is an internal loopback or quant engine IPC call.
 */
export function isInternalRequest(req: Request): boolean {
  const remote = req.socket.remoteAddress || req.ip || "";
  const isLoopback = LOOPBACK_IPS.has(remote);
  const hasInternalHeader = req.headers["x-internal-system"] === "true" ||
    req.headers["x-broker-event"] === "true";
  return isLoopback && (hasInternalHeader || req.path.startsWith("/internal") || req.path.startsWith("/system"));
}

/**
 * A browser on this machine: loopback peer and, via the dev proxy, a loopback
 * X-Forwarded-For (same test the auth dev fallback uses).
 */
export function isLocalClient(req: Request): boolean {
  if (!LOOPBACK_IPS.has(req.socket.remoteAddress || "")) return false;
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean);
  return fwd.every((a) => LOOPBACK_IPS.has(a));
}

/**
 * Detects if the request originates from a trusted broker webhook or exchange event.
 */
export function isBrokerEventRequest(req: Request): boolean {
  return Boolean(
    req.headers["x-broker-event"] === "true" ||
    req.headers["x-broker-signature"] ||
    req.path.startsWith("/api/broker/webhook") ||
    req.path.startsWith("/broker/webhook")
  );
}

// ─── TIER 1: USER REQUEST LIMITS (Endpoint Specific) ─────────────────

/**
 * Auth rate limiter: Protects login/registration from brute force (10 req/min).
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    tier: "USER_REQUEST_LIMIT",
    category: "AUTH",
    message: "Too many authentication attempts. Please retry after 1 minute.",
  },
});

/**
 * Order placement rate limiter: Prevents rapid double-clicks, UI spam, and algorithmic runaway (20 req/min).
 */
export const orderPlacementLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isInternalRequest(req) || isBrokerEventRequest(req),
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    tier: "USER_REQUEST_LIMIT",
    category: "ORDER_CREATION",
    message: "Order submission rate limit exceeded (maximum 20 orders/minute).",
  },
});

/**
 * Order cancellation rate limiter: Protects exchange API buffers from cancel hammering (30 req/min).
 */
export const orderCancellationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isInternalRequest(req) || isBrokerEventRequest(req),
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    tier: "USER_REQUEST_LIMIT",
    category: "ORDER_CANCELLATION",
    message: "Order cancellation rate limit exceeded (maximum 30 cancels/minute).",
  },
});

/**
 * Sensitive state / AI Proposal / Risk modifier limiter (40 req/min).
 */
export const administrativeMutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isInternalRequest(req),
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    tier: "USER_REQUEST_LIMIT",
    category: "ADMIN_MUTATION",
    message: "Configuration update limit exceeded. Please retry shortly.",
  },
});

/**
 * General user API limiter: Allows normal polling without starvation (300 req/min).
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX_OVERRIDE) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Requests from this machine (every local tab + the Vite proxy share one
  // key) are the operator's own UI: two open tabs polling pushed past 300/min
  // and got 429s on real actions like Pause. LAN/remote clients (which must
  // authenticate) stay limited.
  skip: (req) => isInternalRequest(req) || isBrokerEventRequest(req) || isLocalClient(req),
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    tier: "USER_REQUEST_LIMIT",
    category: "GENERAL_API",
    message: "Too many requests. Please throttle your client query rate.",
  },
});

// ─── TIER 2 & 3: BROKER & INTERNAL EVENT BYPASS GUARDS ───────────────

/**
 * Middleware ensuring broker events and internal events are never dropped or throttled.
 */
export function brokerAndInternalEventGuard(req: Request, _res: Response, next: NextFunction): void {
  if (isBrokerEventRequest(req)) {
    // Tag request for high-priority unthrottled downstream handling
    (req as any).eventPriority = "BROKER_PRIORITY";
  } else if (isInternalRequest(req)) {
    (req as any).eventPriority = "INTERNAL_PRIORITY";
  }
  next();
}

// ─── TIER 4: MARKET DATA BROADCAST COALESCER ─────────────────────────

export class MarketDataBroadcastCoalescer {
  private static lastPushTimestamps = new Map<string, number>();
  private static readonly MIN_INTERVAL_MS = 50; // Max 20 pushes/sec per symbol to client sockets

  public static shouldEmit(symbol: string): boolean {
    const now = Date.now();
    const last = this.lastPushTimestamps.get(symbol) || 0;
    if (now - last >= this.MIN_INTERVAL_MS) {
      this.lastPushTimestamps.set(symbol, now);
      return true;
    }
    return false;
  }

  public static reset(): void {
    this.lastPushTimestamps.clear();
  }
}
