/*
 * ─── Authoritative Transport Security & Fail-Closed Policy ────
 *
 * Enforces production transport security:
 * - Development: Plain HTTP allowed on local interfaces.
 * - Production: HTTPS required; fails closed if insecure transport is detected
 *   without an explicitly configured trusted TLS-terminating reverse proxy.
 *
 * Eliminates Warning #3.
 */
import type { Request, Response, NextFunction } from "express";

export interface TransportSecurityConfig {
  nodeEnv: string;
  trustProxy: boolean;
  allowInsecureHttpInDev: boolean;
  enforceHsts: boolean;
  hstsMaxAgeSeconds: number;
}

export function getTransportConfig(): TransportSecurityConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const trustProxy = process.env.TRUST_PROXY === "true" || process.env.BEHIND_TRUSTED_PROXY === "true";
  return {
    nodeEnv,
    trustProxy,
    allowInsecureHttpInDev: nodeEnv !== "production",
    enforceHsts: true,
    hstsMaxAgeSeconds: 31536000, // 1 year
  };
}

/**
 * Validates transport security posture on server boot.
 * FAILS CLOSED on production startup if insecure transport configuration is detected.
 */
export function validateTransportSecurityOnStartup(): void {
  const config = getTransportConfig();
  if (config.nodeEnv === "production") {
    // In production, must either be behind a verified reverse proxy OR have TLS certificates configured
    const hasTlsCerts = Boolean(process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH);
    const hasTrustedProxy = config.trustProxy;

    if (!hasTlsCerts && !hasTrustedProxy) {
      const errorMsg =
        "[FATAL_TRANSPORT_SECURITY] Production environment detected with insecure transport configuration. " +
        "You must configure TLS/SSL certificates or set TRUST_PROXY=true behind a trusted TLS-terminating reverse proxy. " +
        "Failing closed to protect broker credentials and financial truth.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log(
      `[TRANSPORT_SECURITY] Production mode validated: ${
        hasTlsCerts ? "Native TLS" : "Trusted Reverse Proxy (X-Forwarded-Proto)"
      } with Strict HSTS.`
    );
  } else {
    console.log("[TRANSPORT_SECURITY] Development mode: Local loopback HTTP permitted.");
  }
}

/**
 * Express middleware enforcing HTTPS, HSTS, and secure header policies.
 */
export function transportSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getTransportConfig();

  // 1. In development, permit loopback/local HTTP
  if (config.allowInsecureHttpInDev) {
    return next();
  }

  // 2. Determine if request is secure
  const forwardedProto = req.headers["x-forwarded-proto"];
  const isSecure = req.secure || forwardedProto === "https";

  // Check if loopback testing inside production container
  const remote = req.socket.remoteAddress || req.ip || "";
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";

  if (!isSecure && !isLoopback) {
    if (req.method === "GET" || req.method === "HEAD") {
      const host = req.headers.host || "localhost";
      return res.redirect(301, `https://${host}${req.url}`);
    }

    res.status(403).json({
      success: false,
      error: "INSECURE_TRANSPORT_PROHIBITED",
      message: "HTTPS is strictly required for all production financial operations.",
    });
    return;
  }

  // 3. Set HSTS and Security Headers
  res.setHeader(
    "Strict-Transport-Security",
    `max-age=${config.hstsMaxAgeSeconds}; includeSubDomains; preload`
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  next();
}
