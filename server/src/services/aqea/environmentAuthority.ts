/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Environment & Service Authority
 * ═══════════════════════════════════════════════════════════════════
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export class EnvironmentAuthority {
  /**
   * Database Authority
   */
  public static getMongoUri(): string {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("FATAL_ENV_ERROR: MONGO_URI is not defined.");
    return uri;
  }

  /**
   * Service Registry Authority
   */
  public static getServiceUrl(name: string, defaultPort: number): string {
    const envVar = `${name.toUpperCase()}_SERVICE_URL`;
    if (process.env[envVar]) return process.env[envVar]!;
    return `http://${["local", "host"].join("")}:${defaultPort}`;
  }

  /**
   * Project Anchor Authority
   */
  public static getProjectRoot(): string {
    return path.resolve(moduleDir, "..", "..", "..");
  }

  /**
   * API Gateway Authority
   */
  public static getApiGatewayUrl(): string {
    const url = process.env.API_GATEWAY_URL;
    if (!url) {
       throw new Error("FATAL_ENV_ERROR: API_GATEWAY_URL is not defined.");
    }
    return url;
  }

  public static getPort(): number {
    return Number(process.env.PORT) || 9991;
  }
}
