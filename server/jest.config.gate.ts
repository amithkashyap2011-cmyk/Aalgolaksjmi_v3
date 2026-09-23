import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  setupFiles: ["<rootDir>/__tests__/setup.ts"],
  moduleNameMapper: {
    "^\\.\\./models/(.*?)(\\.js)?$": "<rootDir>/src/models/$1",
    "^\\.\\./\\.\\./models/(.*?)(\\.js)?$": "<rootDir>/src/models/$1",
    "^(\\.\\./)+(src/)?models/(.*?)(\\.js)?$": "<rootDir>/src/models/$3",
    "^(\\.\\./)+(src/)?services/(.*?)(\\.js)?$": "<rootDir>/src/services/$3",
    "^\\./(binanceService|paperState|mlModelService|dlModelService|modelRegistry|indicatorService|behaviourModel|agentService)(\\.js)?$": "<rootDir>/src/services/$1",
    "^(\\..*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript" },
          target: "es2022",
        },
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
  testMatch: [
    "<rootDir>/__tests__/finalFinancialTruthLock.test.ts",
    "<rootDir>/__tests__/financialTruthBoundary.test.ts",
    "<rootDir>/__tests__/independentAccountingOracle.test.ts",
    "<rootDir>/__tests__/indianMarketAccountingAndAutoPilot.test.ts",
    "<rootDir>/__tests__/finalProductionHardSafetyInvariants.test.ts",
    "<rootDir>/__tests__/liquidationMargin.property.test.ts",
    "<rootDir>/__tests__/productionHardeningFinalAcceptance.test.ts",
    "<rootDir>/__tests__/trading.placeOrder.concurrency.test.ts",
    "<rootDir>/__tests__/dualMarketIsolation.test.ts",
    "<rootDir>/__tests__/threeViewDashboardIsolation.regression.test.ts",
    "<rootDir>/__tests__/finalEndToEndTradingSession.test.ts",
    "<rootDir>/__tests__/agentKernel.test.ts",
    "<rootDir>/__tests__/phase9AgentKernelControlPlane.test.ts",
    "<rootDir>/__tests__/agenticTradingOperations.test.ts",
    "<rootDir>/__tests__/productionSecurityAudit.test.ts",
    "<rootDir>/__tests__/auth.test.ts",
    "<rootDir>/__tests__/productionHardeningChaos.test.ts",
    "<rootDir>/__tests__/phase6FullSystemChaos.test.ts",
  ],
  collectCoverage: false,
  verbose: true,
  // Keep the production gate independent of host Watchman permissions.
  watchman: false,
  testTimeout: 30000,
};

export default config;
