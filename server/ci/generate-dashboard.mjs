#!/usr/bin/env node
/*
 * Aggregates coverage, mutation, and test-run results into one
 * machine-readable snapshot (ci/dashboard.json) and appends it to a
 * trend-history file (ci/dashboard-history.jsonl) so score movement over
 * time is visible, not just the latest run. Run this after `npm test
 * -- --coverage --coverageReporters=json-summary` and (optionally) `npx
 * stryker run` have already produced their raw output files — this script
 * only reads and reshapes what's already on disk, it doesn't run anything
 * itself.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const now = new Date().toISOString();

function readJsonIfExists(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const coverageSummary = readJsonIfExists(path.join(root, "coverage", "coverage-summary.json"));
const mutationReport = readJsonIfExists(path.join(root, "reports", "mutation", "mutation.json"));
const coverageBaseline = readJsonIfExists(path.join(root, "ci", "coverage-baseline.json"));
const mutationBaseline = readJsonIfExists(path.join(root, "ci", "mutation-baseline.json"));

const snapshot = {
  timestamp: now,
  coverage: coverageSummary
    ? {
        lines: coverageSummary.total.lines.pct,
        statements: coverageSummary.total.statements.pct,
        functions: coverageSummary.total.functions.pct,
        branches: coverageSummary.total.branches.pct,
        baseline: coverageBaseline
          ? { lines: coverageBaseline.lines, statements: coverageBaseline.statements, functions: coverageBaseline.functions, branches: coverageBaseline.branches }
          : null,
      }
    : null,
  mutation: mutationReport
    ? (() => {
        const files = Object.values(mutationReport.files);
        const killed = files.reduce((s, f) => s + f.mutants.filter(m => m.status === "Killed" || m.status === "Timeout").length, 0);
        const covered = files.reduce((s, f) => s + f.mutants.filter(m => m.status !== "Ignored" && m.status !== "NoCoverage").length, 0);
        const survived = files.reduce((s, f) => s + f.mutants.filter(m => m.status === "Survived").length, 0);
        return {
          score: covered > 0 ? +(killed / covered * 100).toFixed(2) : null,
          killed, covered, survived,
          scopedFiles: Object.keys(mutationReport.files),
          baseline: mutationBaseline ? mutationBaseline.mutationScore : null,
        };
      })()
    : { note: "No mutation report found — run `npx stryker run` first (scoped to files in stryker.conf.json)." },
  notes: [
    "Mutation testing is scoped to a small file set (see stryker.conf.json) — its score is not representative of the whole codebase, only of the files it covers.",
    "No deterministic historical-session replay harness exists yet — determinism.test.ts verifies pure-function repeatability only, not full-session replay.",
    "Coverage now uses an explicit collectCoverageFrom (jest.config.ts) covering all of src/**/*.ts on every run — before this fix, the denominator silently varied based on which files the current test set happened to import, making run-to-run comparisons unreliable.",
  ],
};

fs.writeFileSync(path.join(root, "ci", "dashboard.json"), JSON.stringify(snapshot, null, 2));

const historyPath = path.join(root, "ci", "dashboard-history.jsonl");
fs.appendFileSync(historyPath, JSON.stringify(snapshot) + "\n");

console.log("Wrote ci/dashboard.json and appended to ci/dashboard-history.jsonl");
console.log(JSON.stringify(snapshot, null, 2));
