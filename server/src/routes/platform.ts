/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.1A — Platform Observability API
 * ═══════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { PlatformTelemetry } from "../services/platformTelemetry.js";
import { DependencyAudit } from "../services/dependencyAudit.js";
import { SecurityAudit } from "../services/securityAuditReport.js";

const router = Router();

/**
 * GET /platform/health
 * Returns full platform telemetry and status.
 */
router.get("/health", async (_req, res) => {
  const telemetry = await PlatformTelemetry.getSnapshot();
  const status = PlatformTelemetry.getSystemStatus();
  
  res.json({
    status,
    telemetry,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /platform/audits
 * Returns dependency and security audit reports.
 */
router.get("/audits", async (_req, res) => {
  const depAudit = await DependencyAudit.runAudit();
  const secAudit = await SecurityAudit.generateReport();
  
  res.json({
    dependencyAudit: depAudit,
    securityFindings: secAudit
  });
});

export default router;
