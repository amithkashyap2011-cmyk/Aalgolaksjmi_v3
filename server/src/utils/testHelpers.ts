import type { IRiskConfig } from "../models/Settings";

export function createMockRiskConfig(overrides: Partial<IRiskConfig> = {}): IRiskConfig {
  return {
    maxDailyLoss: 100,
    maxWeeklyLoss: 300,
    maxMonthlyLoss: 800,
    maxPositionSizePct: 21,
    defaultSL: 2,
    defaultTP: 4,
    trailingSL: 1,
    defaultLeverage: 1,
    maxConcurrentPositions: 5,
    maxPortfolioHeat: 50,
    capitalPreservationMode: false,
    riskEngineEnabled: true,
    autoCloseEnabled: false,
    dynamicSLTP: false,
    multiStageTP: false,
    ...overrides
  };
}
