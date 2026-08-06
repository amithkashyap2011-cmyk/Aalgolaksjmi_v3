#!/usr/bin/env node
/*
 * Fails the build if the measured Stryker mutation score has dropped
 * below the checked-in baseline by more than TOLERANCE_PCT.
 */
import fs from "node:fs";
import path from "node:path";

const TOLERANCE_PCT = 1.0;
const baselinePath = path.join(process.cwd(), "ci", "mutation-baseline.json");
const reportPath = path.join(process.cwd(), "reports", "mutation", "mutation.json");

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

const files = Object.values(report.files);
const killed = files.reduce((sum, f) => sum + f.mutants.filter(m => m.status === "Killed" || m.status === "Timeout").length, 0);
const covered = files.reduce((sum, f) => sum + f.mutants.filter(m => m.status !== "Ignored" && m.status !== "NoCoverage").length, 0);
const currentScore = covered > 0 ? (killed / covered) * 100 : 0;

const delta = currentScore - baseline.mutationScore;
const status = delta >= -TOLERANCE_PCT ? "OK" : "REGRESSION";
console.log(`mutationScore: baseline=${baseline.mutationScore}% current=${currentScore.toFixed(2)}% delta=${delta.toFixed(2)}% [${status}]`);

if (status === "REGRESSION") {
  console.error("\nMutation score regression detected — build failed. If this drop is expected (e.g. new untested code was added), add tests before merging rather than lowering the baseline.");
  process.exit(1);
}
console.log("\nNo mutation score regression detected.");
