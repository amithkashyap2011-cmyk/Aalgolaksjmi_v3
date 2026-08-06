import { jest } from '@jest/globals';

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

jest.unstable_mockModule("mongoose", () => {
  class MockSchema {
    static Types: any = { ObjectId: "ObjectId" };
    index() {}
  }
  return {
    default: {
      connection: { readyState: 1 },
      Types: { ObjectId: class { id: any; constructor(id: any) { this.id = id; } toString() { return this.id; } static isValid() { return true; } } },
      model: jest.fn().mockReturnValue({ index: jest.fn() }),
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue({ index: jest.fn() })
  };
});

jest.unstable_mockModule("../../src/models/Trade.js", () => ({
  Trade: { find: jest.fn().mockReturnValue(chainMock) }
}));

jest.unstable_mockModule("../../src/models/AqeaTradeAnalytics.js", () => ({
  AqeaTradeAnalytics: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) }
}));

jest.unstable_mockModule("../../src/models/AqeaPerformance.js", () => ({
  AqeaPerformance: { find: jest.fn().mockReturnValue(chainMock) }
}));

jest.unstable_mockModule("../../src/services/binanceService.js", () => ({
  getExchangeInfo: jest.fn()
}));

jest.unstable_mockModule("../../src/services/aqea/ai/PredictorRegistry.js", () => ({
  PredictorRegistry: { getRegistryHealth: jest.fn().mockReturnValue([]) }
}));

jest.unstable_mockModule("../../src/models/AqeaProductionAudit.js", () => ({
  AqeaProductionAudit: { create: (jest.fn() as any).mockResolvedValue({}) }
}));

let binance: any, DeploymentManager: any, HealthMonitor: any, CircuitBreaker: any;
beforeAll(async () => {
  (binance = await import("../../src/services/binanceService.js") as any);
  ({ DeploymentManager } = await import("../../src/services/production/deploymentManager.js"));
  ({ HealthMonitor } = await import("../../src/services/production/healthMonitor.js"));
  ({ CircuitBreaker } = await import("../../src/services/production/circuitBreaker.js"));
});

jest.setTimeout(30000);

describe("AQEA Phase 6A: Production Framework Integration", () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    process.env.JWT_SECRET = "test-secret";
    binance.getExchangeInfo.mockResolvedValue([{ some: "info" }]);
  });

  test("Deployment Manager identifies missing environment variables", async () => {
    delete process.env.JWT_SECRET;
    const res = await DeploymentManager.verifyProductionReadiness();
    expect(res.ready).toBe(false);
    expect(res.errors).toContain("CRITICAL: JWT_SECRET not configured.");
  });

  test("Health Monitor returns WARNING on high latency", async () => {
    const health = await HealthMonitor.getSystemHealth();
    expect(health.status).toBeDefined();
    expect(health.components.resources).toBeDefined();
  });

  test("Circuit Breaker status and reset", () => {
    expect(CircuitBreaker.getStatus().suspended).toBe(false);
    (CircuitBreaker as any).isSuspended = true;
    expect(CircuitBreaker.getStatus().suspended).toBe(true);
    CircuitBreaker.reset();
    expect(CircuitBreaker.getStatus().suspended).toBe(false);
  });
});
