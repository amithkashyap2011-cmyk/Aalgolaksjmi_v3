import type { Config } from "jest";

// Transform uses @swc/jest (pure per-file transpilation, no type-checking)
// instead of ts-jest. ts-jest's language-service diagnostics repeatedly
// misjudged the module/target for files using import.meta or top-level
// await (both valid, standard ESM — confirmed independently with `tsc
// --noEmit` and a bare ts.transpileModule() call), rejecting them with
// TS1343/TS1378 or silently downgrading them to broken CommonJS output.
// Type safety is unaffected — `npm run typecheck` (plain tsc) already
// covers it; this transform's only job is stripping TS syntax for the
// test runner.
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
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverage: false,
  // Without an explicit collectCoverageFrom, Jest's coverage denominator
  // is unstable: it only counts files actually imported by whichever
  // tests happen to run, so adding one new integration test that imports
  // more of the codebase (e.g. the full trading router) silently pulls in
  // previously-uncounted, low-coverage files and can make the aggregate
  // percentage swing several points in either direction with no real
  // change in how well-tested anything is. This makes coverage a stable,
  // comprehensive measurement of the same file set on every run instead —
  // required for ci/check-coverage-regression.mjs's baseline comparison
  // to mean what it claims to mean.
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  verbose: true,
  testTimeout: 30000,
  maxWorkers: 2,
};

export default config;
