#!/usr/bin/env node
/*
 * Fails the build if measured coverage has dropped below the checked-in
 * baseline by more than TOLERANCE_PCT (a small allowance for run-to-run
 * floating point/enumeration-order noise in the reporter itself, not a
 * license to regress coverage).
 */
import fs from "node:fs";
import path from "node:path";

const TOLERANCE_PCT = 0.5;
const baselinePath = path.join(process.cwd(), "ci", "coverage-baseline.json");
const summaryPath = path.join(process.cwd(), "coverage", "coverage-summary.json");

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const current = summary.total;

const metrics = ["lines", "statements", "functions", "branches"];
let failed = false;

for (const metric of metrics) {
  const baselineValue = baseline[metric];
  const currentValue = current[metric].pct;
  const delta = currentValue - baselineValue;
  const status = delta >= -TOLERANCE_PCT ? "OK" : "REGRESSION";
  console.log(`${metric}: baseline=${baselineValue}% current=${currentValue}% delta=${delta.toFixed(2)}% [${status}]`);
  if (status === "REGRESSION") failed = true;
}

if (failed) {
  console.error("\nCoverage regression detected — build failed. If this drop is expected and justified, update ci/coverage-baseline.json in the same PR with an explanation, don't just lower it to silence this check.");
  process.exit(1);
}
console.log("\nNo coverage regression detected.");
