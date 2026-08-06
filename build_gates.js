/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Build Gates & Architectural Guardrails
 * ═══════════════════════════════════════════════════════════════════
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const errors = [];

function check(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

console.log("🚀 Running AQEA Build Gates...");

// 1. Hidden Voter & Governance Check
const enginePath = "server/src/services/aqea/engine.ts";
if (fs.existsSync(enginePath)) {
  const engineContent = fs.readFileSync(enginePath, "utf8");
  check(
    !engineContent.includes("aiPredictions.every"),
    "GATE_FAILURE: Hidden voter detected. Consensus must use authorizedPredictions.every."
  );
  check(
    engineContent.includes("authorizedPredictions.every"),
    "GATE_FAILURE: Missing authorized consensus check."
  );
  check(
    engineContent.includes("VotingRegistry.assertGovernance"),
    "GATE_FAILURE: Missing mandatory governance assertions."
  );
}

// 2. Predictor Authority Check
const registryPath = "server/src/services/aqea/votingRegistry.ts";
if (fs.existsSync(registryPath)) {
  const registryContent = fs.readFileSync(registryPath, "utf8");
  check(
    !registryContent.includes('["MAMBA", { type: "MAMBA", role: PredictorRole.AUTHORIZED'),
    "GATE_FAILURE: Mamba is unauthorized for consensus voting."
  );
}

// 3. Telemetry Parity & Explainability Check
const autoTradePath = "server/src/services/autoTradeEngine.ts";
if (fs.existsSync(autoTradePath)) {
  const autoTradeContent = fs.readFileSync(autoTradePath, "utf8");
  check(
    autoTradeContent.includes("decisionPath"),
    "GATE_FAILURE: Telemetry parity violation. Missing mandatory decisionPath."
  );
  check(
    autoTradeContent.includes("Number.isFinite"),
    "GATE_FAILURE: Missing financial safety guards (Number.isFinite) in autoTradeEngine."
  );
}

const tradeModelPath = "server/src/models/Trade.ts";
if (fs.existsSync(tradeModelPath)) {
  const tradeModelContent = fs.readFileSync(tradeModelPath, "utf8");
  check(
    tradeModelContent.includes("decisionPath: { type: Schema.Types.Mixed, required: true }"),
    "GATE_FAILURE: Trade model must require mandatory decisionPath."
  );
}

// 4. Network Authority Contamination
const forbiddenPatterns = [
  { pattern: /127\.0\.0\.1/, name: "127.0.0.1" },
  { pattern: /localhost/, name: "localhost" }
];

const sourceDirs = ["server/src", "client/src"];
const excludeDirs = ["node_modules", "venv", ".git", "target", "build", "dist", "scripts", "test", "__tests__"];

sourceDirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;

  const files = execSync(`find ${dir} -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx"`).toString().split("\n").filter(Boolean);

  files.forEach(file => {
    // Skip excluded directories in the path
    if (excludeDirs.some(ex => file.includes(`/${ex}/`) || file.startsWith(`${ex}/`))) return;

    const content = fs.readFileSync(file, "utf8");
    forbiddenPatterns.forEach(({ pattern, name }) => {
      if (pattern.test(content)) {
        // Special exception for EnvironmentAuthority.ts itself if it contains the pattern, 
        // but we already refactored it to use env vars.
        check(false, `GATE_FAILURE: Forbidden hardcoded authority '${name}' in ${file}`);
      }
    });
  });
});
if (errors.length > 0) {
  console.error("\n❌ BUILD FAILED:");
  errors.forEach(err => console.error(`  - ${err}`));
  process.exit(1);
} else {
  console.log("\n✅ ALL GATES PASS. Architectural Integrity Verified.");
  process.exit(0);
}
