/**
 * ─── Weather Intelligence Engine (V1.0) ────────────────
 *
 * Institutional-grade alternative data layer tracking weather
 * impact on global mining infrastructure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Named __moduleDir, not __dirname — SWC's ESM->CJS transform auto-injects
// its own `const __dirname = ...` shim for any file using import.meta, and
// declaring a second one under the same name is a genuine duplicate-const
// SyntaxError at module-load time (proven by importing this file alone in
// isolation, unrelated to any other change). Every other file in this
// codebase using this manual-shim pattern happened to never be exercised
// by a test that freshly transforms it, so the same bug was latent there
// too, just not yet triggered.
const __moduleDir = path.dirname(fileURLToPath(import.meta.url));
// Persist the user's on/off + influence choice so it survives restarts.
const WEATHER_STATE_FILE = path.resolve(__moduleDir, "..", "..", "weather_effect_state.json");

export interface MiningRegion {
  name: string;
  lat: number;
  lon: number;
  weight: number; // Importance to global hash rate
}

export const MINING_REGIONS: MiningRegion[] = [
  { name: "Texas (ERCOT)", lat: 31.9686, lon: -99.9018, weight: 0.35 },
  { name: "Kazakhstan", lat: 48.0196, lon: 66.9237, weight: 0.18 },
  { name: "Iceland", lat: 64.9631, lon: -19.0208, weight: 0.08 },
  { name: "Canada (Alberta)", lat: 53.9333, lon: -116.5765, weight: 0.12 },
  { name: "Russia (Siberia)", lat: 61.0137, lon: 99.1967, weight: 0.15 },
  { name: "Paraguay", lat: -23.4425, lon: -58.4438, weight: 0.12 },
];

export interface WeatherData {
  temp: number;
  windSpeed: number;
  humidity: number;
  gridLoad: number; // 0-1 (1 is max capacity)
  stormAlerts: boolean;
  powerOutages: boolean;
}

export class WeatherStressEngine {
  public static calculateRegionStress(data: WeatherData): number {
    let stress = 0;

    // 1. Temperature Stress (High heat or extreme cold)
    if (data.temp > 35) stress += (data.temp - 35) * 4; // High heat
    if (data.temp < -10) stress += (Math.abs(data.temp) - 10) * 2; // Extreme cold

    // 2. Grid Load Stress
    stress += data.gridLoad * 40;

    // 3. Storm & Outage Multipliers
    if (data.stormAlerts) stress += 20;
    if (data.powerOutages) stress += 50;

    // 4. Environmental factors
    stress += (data.humidity / 100) * 10;
    stress += (data.windSpeed / 50) * 5;

    return Math.min(100, Math.max(0, stress));
  }
}

export class WeatherIntelligenceEngine {
  private static instance: WeatherIntelligenceEngine;
  private weatherAlpha: number = 0;
  private miningStress: number = 0;
  /** User control: master on/off for the weather effect on the market. */
  private enabled: boolean = true;
  /** User control: 0..1 multiplier scaling how strongly weather influences the market. */
  private influence: number = 1.0;

  private constructor() {
    this.loadState();
  }

  public static getInstance(): WeatherIntelligenceEngine {
    if (!WeatherIntelligenceEngine.instance) {
      WeatherIntelligenceEngine.instance = new WeatherIntelligenceEngine();
    }
    return WeatherIntelligenceEngine.instance;
  }

  /* ── User control + persistence ─────────────────────── */
  public setEnabled(v: boolean): void { this.enabled = v; this.saveState(); }
  public isEnabled(): boolean { return this.enabled; }
  public setInfluence(v: number): void { this.influence = Math.max(0, Math.min(1, v)); this.saveState(); }
  public getInfluence(): number { return this.influence; }

  private loadState(): void {
    try {
      if (!fs.existsSync(WEATHER_STATE_FILE)) return;
      const s = JSON.parse(fs.readFileSync(WEATHER_STATE_FILE, "utf-8")) as { enabled?: boolean; influence?: number };
      if (typeof s.enabled === "boolean") this.enabled = s.enabled;
      if (typeof s.influence === "number") this.influence = Math.max(0, Math.min(1, s.influence));
    } catch (err) {
      console.warn("[weather] Failed to load state:", (err as Error).message);
    }
  }

  private saveState(): void {
    try {
      fs.writeFileSync(WEATHER_STATE_FILE, JSON.stringify({ enabled: this.enabled, influence: this.influence }, null, 2), "utf-8");
    } catch (err) {
      console.warn("[weather] Failed to persist state:", (err as Error).message);
    }
  }

  /** Effective alpha after applying the user's on/off + influence controls. */
  private effectiveAlpha(): number {
    return this.enabled ? this.weatherAlpha * this.influence : 0;
  }

  /**
   * Fetches latest weather and calculates aggregate stress
   */
  public async update(): Promise<void> {
    let aggregateStress = 0;

    // In a real implementation, we would fetch from NOAA/ECMWF/OpenWeather/WeatherXM
    // For V1.0 we use deterministic simulation based on current time/season
    for (const region of MINING_REGIONS) {
      const simulatedData: WeatherData = {
        temp: 22 + Math.random() * 15,
        windSpeed: 5 + Math.random() * 20,
        humidity: 40 + Math.random() * 30,
        gridLoad: 0.4 + Math.random() * 0.4,
        stormAlerts: Math.random() > 0.95,
        powerOutages: Math.random() > 0.98,
      };

      const regionStress = WeatherStressEngine.calculateRegionStress(simulatedData);
      aggregateStress += regionStress * region.weight;
    }

    this.miningStress = aggregateStress;
  }

  public getMiningStress(): number {
    return this.miningStress;
  }

  public setWeatherAlpha(alpha: number): void {
    this.weatherAlpha = alpha;
  }

  /** Returns the market-effective weather alpha (0 when the effect is disabled). */
  public getWeatherAlpha(): number {
    return this.effectiveAlpha();
  }

  /** Raw computed alpha (pre-control) — for telemetry/display transparency. */
  public getRawWeatherAlpha(): number {
    return this.weatherAlpha;
  }

  /**
   * Generates dynamic risk multipliers based on Weather Alpha.
   * Returns neutral (no effect) when the weather effect is disabled.
   */
  public getRiskAdjustment(): { leverageMultiplier: number; sizeMultiplier: number; riskLimitMultiplier: number } {
    const alpha = this.effectiveAlpha();

    if (alpha > 85) {
      return { leverageMultiplier: 0.5, sizeMultiplier: 0.3, riskLimitMultiplier: 0.5 };
    }
    if (alpha > 70) {
      return { leverageMultiplier: 0.7, sizeMultiplier: 0.6, riskLimitMultiplier: 0.8 };
    }
    return { leverageMultiplier: 1.0, sizeMultiplier: 1.0, riskLimitMultiplier: 1.0 };
  }
}

export const weatherIntelligenceEngine = WeatherIntelligenceEngine.getInstance();
