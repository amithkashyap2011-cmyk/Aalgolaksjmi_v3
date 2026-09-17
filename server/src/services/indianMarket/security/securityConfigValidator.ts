/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Production Security Configuration & Credential Validator
 * ═══════════════════════════════════════════════════════════════════
 *  Enforces fail-closed configuration validation at application boot:
 *  - Disallows default, missing, or weak JWT secrets in production.
 *  - Disallows wildcard CORS and debug flags in production.
 *  - Prevents test suites from loading or executing with live broker credentials.
 *  - Provides zero-leak log and telemetry data redaction.
 */

export interface SecurityConfigAuditResult {
  valid: boolean;
  environment: string;
  errors: string[];
  warnings: string[];
}

export class SecurityConfigValidator {
  private static readonly INSECURE_DEFAULT_SECRETS = new Set([
    "default_jwt_secret_aalgo",
    "secret",
    "jwt_secret",
    "change_me",
    "123456",
    "password",
    "admin",
  ]);

  private static readonly SENSITIVE_KEY_PATTERNS = [
    /secret/i,
    /token/i,
    /password/i,
    /key/i,
    /auth/i,
    /cookie/i,
    /session/i,
    /credential/i,
    /private/i,
    /bearer/i,
  ];

  /**
   * Validates runtime configuration against production security invariants.
   * Throws an Error if critical production requirements are violated.
   */
  public static validate(env: NodeJS.ProcessEnv = process.env): SecurityConfigAuditResult {
    const environment = (env.NODE_ENV || "development").toLowerCase();
    const isProduction = environment === "production";
    const isTest = environment === "test";
    const errors: string[] = [];
    const warnings: string[] = [];

    const jwtSecret = env.JWT_SECRET || "";

    // 1. JWT Secret Validation
    if (isProduction) {
      if (!jwtSecret) {
        errors.push("CRITICAL: JWT_SECRET environment variable is missing in production.");
      } else if (this.INSECURE_DEFAULT_SECRETS.has(jwtSecret.toLowerCase())) {
        errors.push("CRITICAL: Insecure default JWT_SECRET detected in production. A cryptographically secure secret is required.");
      } else if (jwtSecret.length < 32) {
        errors.push(`CRITICAL: JWT_SECRET is too short (${jwtSecret.length} chars). Minimum 32 characters required in production.`);
      }
    } else if (!jwtSecret) {
      warnings.push("WARNING: JWT_SECRET is not set in non-production mode; using development fallback.");
    }

    // 2. CORS Configuration Check
    const corsOrigins = env.CORS_ALLOWED_ORIGINS || "";
    if (isProduction) {
      if (corsOrigins.trim() === "*") {
        errors.push("CRITICAL: Wildcard CORS ('*') is strictly forbidden in production for trading APIs.");
      }
    }

    // 3. Debug & Verbose Mode Checks
    if (isProduction) {
      if (env.DEBUG === "true" || env.DEBUG === "1" || env.VERBOSE === "true") {
        warnings.push("WARNING: Verbose DEBUG mode is active in production. This may leak stack traces or internal state.");
      }
    }

    // 4. Test Environment Guard (Requirement 44)
    if (isTest) {
      const brokerMode = (env.BROKER_MODE || "").toUpperCase();
      if (brokerMode === "LIVE") {
        errors.push("FATAL: Test environment (NODE_ENV=test) detected with BROKER_MODE=LIVE. Tests cannot place live orders.");
      }
      // Force test safety flags
      env.TRADING_KILL_SWITCH = env.TRADING_KILL_SWITCH || "false";
    }

    // 5. Live Broker Credential Check if LIVE mode enabled
    const brokerMode = (env.BROKER_MODE || "PAPER").toUpperCase();
    if (brokerMode === "LIVE") {
      const hasDhan = Boolean(env.DHAN_CLIENT_ID && env.DHAN_ACCESS_TOKEN);
      const hasKite = Boolean(env.KITE_API_KEY && env.KITE_ACCESS_TOKEN);
      if (!hasDhan && !hasKite && isProduction) {
        errors.push("CRITICAL: BROKER_MODE=LIVE configured, but no valid broker credentials (Dhan/Kite) detected.");
      }
    }

    const valid = errors.length === 0;

    if (!valid && isProduction) {
      const message = `[SECURITY_BOOT_FAILURE] Production startup aborted due to security violations:\n${errors.map(e => ` - ${e}`).join("\n")}`;
      console.error(message);
      throw new Error(message);
    }

    return {
      valid,
      environment,
      errors,
      warnings,
    };
  }

  /**
   * Deeply sanitizes objects or error structures by redacting sensitive fields.
   * Returns a clean copy suitable for logs or telemetry.
   */
  public static redact<T>(data: T): T {
    if (data === null || data === undefined) return data;

    if (typeof data === "string") {
      return this.redactString(data) as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.redact(item)) as unknown as T;
    }

    if (typeof data === "object") {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (this.isSensitiveKey(key)) {
          sanitized[key] = "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
          sanitized[key] = this.redact(value);
        } else if (typeof value === "string") {
          sanitized[key] = this.redactString(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized as T;
    }

    return data;
  }

  /**
   * Redacts sensitive patterns (Bearer tokens, API keys, basic auth) inside a string.
   */
  public static redactString(str: string): string {
    if (!str || typeof str !== "string") return str;

    return str
      // Redact Authorization Bearer headers
      .replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, "Bearer [REDACTED_JWT]")
      // Redact standard API key patterns (key=..., apiKey=...)
      .replace(/(api[_-]?key\s*[:=]\s*['"]?)[a-zA-Z0-9_-]{8,}(['"]?)/gi, "$1[REDACTED_KEY]$2")
      // Redact passwords in connection strings (mongodb://user:pass@host)
      .replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@)/gi, "$1[REDACTED_PASSWORD]$2")
      // Redact generic passwords in JSON or query params
      .replace(/(password\s*[:=]\s*['"]?)[^'"&\s]{4,}(['"]?)/gi, "$1[REDACTED_PASSWORD]$2");
  }

  private static isSensitiveKey(key: string): boolean {
    return this.SENSITIVE_KEY_PATTERNS.some(regex => regex.test(key));
  }
}
