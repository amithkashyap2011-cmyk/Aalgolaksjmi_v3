/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — AUTONOMOUS CONTROL PLANE REST API
 * ═══════════════════════════════════════════════════════════════════
 * Endpoints for Agent Control Center:
 *  - Operating Mode selection (MANUAL, ASSISTED, AUTO, EMERGENCY_STOP)
 *  - Specialist Agent telemetry, health, enable/disable toggles
 *  - Pending proposal approvals/rejections (ASSISTED mode)
 *  - Decision audit querying and exact decision replay
 *  - Shadow mode simulated P&L analytics
 */

import express from "express";
import { AgentKernel } from "../services/agentic/AgentKernel.js";
import { HumanOverrideMode } from "../services/agentic/types.js";
import { optionalAuth, authGuard, type AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

const router = express.Router();
router.use(optionalAuth);

/**
 * GET /api/agent-control/status
 * Returns high-level system mode, 8-agent health matrix, telemetry, and pending proposals.
 */
router.get("/status", (req, res) => {
  try {
    const kernel = AgentKernel.getInstance();
    const summary = kernel.getAgentStatusSummary();
    res.json({ success: true, ...summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent-control/mode
 * Sets operating mode: MANUAL | ASSISTED | AUTO | EMERGENCY_STOP
 */
router.post("/mode", requirePermission("ENABLE_AUTONOMOUS"), (req: AuthRequest, res) => {
  try {
    const mode = req.body?.mode as HumanOverrideMode;
    const authorizedBy = req.userId || req.body?.authorizedBy || "ADMIN_OPERATOR";

    if (!["MANUAL", "ASSISTED", "AUTO", "EMERGENCY_STOP"].includes(mode)) {
      return res.status(400).json({ success: false, error: `Invalid mode: ${mode}` });
    }

    const kernel = AgentKernel.getInstance();
    kernel.setHumanOverrideMode(mode, authorizedBy);

    res.json({
      success: true,
      mode: kernel.getHumanOverrideMode(),
      message: `System operating mode updated to ${mode} by ${authorizedBy}`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent-control/emergency-stop
 * Deterministic emergency stop immediately halting all autonomous actions.
 */
router.post("/emergency-stop", requirePermission("EMERGENCY_STOP"), (req: AuthRequest, res) => {
  try {
    const authorizedBy = req.userId || req.body?.authorizedBy || "EMERGENCY_UI";
    const kernel = AgentKernel.getInstance();
    kernel.emergencyStop(authorizedBy);

    res.json({
      success: true,
      mode: "EMERGENCY_STOP",
      message: "Emergency stop engaged. All autonomous execution halted immediately."
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent-control/agent/:agentId/toggle
 * Enables or disables an individual specialist agent.
 */
router.post("/agent/:agentId/toggle", requirePermission("CHANGE_STRATEGY"), (req: AuthRequest, res) => {
  try {
    const { agentId } = req.params;
    const { enabled } = req.body;
    const authorizedBy = req.userId || "ADMIN_USER";

    const kernel = AgentKernel.getInstance();
    const result = kernel.toggleAgent(agentId, Boolean(enabled), authorizedBy);

    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent-control/agent/:agentId/reset
 * Resets an agent from degraded/error state.
 */
router.post("/agent/:agentId/reset", requirePermission("RESET_SYSTEM"), (req: AuthRequest, res) => {
  try {
    const { agentId } = req.params;
    const authorizedBy = req.userId || "ADMIN_USER";

    const kernel = AgentKernel.getInstance();
    const success = kernel.resetAgent(agentId, authorizedBy);

    if (!success) {
      return res.status(404).json({ success: false, message: `Agent ${agentId} not found` });
    }
    res.json({ success: true, message: `Agent ${agentId} reset to READY` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent-control/proposals
 * Returns all pending action proposals requiring human review (ASSISTED mode).
 */
router.get("/proposals", (_req, res) => {
  try {
    const kernel = AgentKernel.getInstance();
    const proposals = kernel.getPendingProposals();
    res.json({ success: true, proposals });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent-control/proposal/:proposalId/approve
 * Approves a pending proposal in ASSISTED mode.
 */
router.post("/proposal/:proposalId/approve", requirePermission("APPROVE_AI_PROPOSAL"), (req: AuthRequest, res) => {
  try {
    const { proposalId } = req.params;
    const authorizedBy = req.userId || "OPERATOR";

    const kernel = AgentKernel.getInstance();
    const result = kernel.approveProposal(proposalId, authorizedBy);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent-control/proposal/:proposalId/reject
 * Rejects a pending proposal in ASSISTED mode.
 */
router.post("/proposal/:proposalId/reject", requirePermission("APPROVE_AI_PROPOSAL"), (req: AuthRequest, res) => {
  try {
    const { proposalId } = req.params;
    const reason = req.body?.reason || "Rejected by operator";
    const authorizedBy = req.userId || "OPERATOR";

    const kernel = AgentKernel.getInstance();
    const result = kernel.rejectProposal(proposalId, reason, authorizedBy);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent-control/audit
 * Returns historical AI decision traces.
 */
router.get("/audit", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const kernel = AgentKernel.getInstance();
    const decisions = kernel.getDecisionAudit().getRecentDecisions(limit);
    res.json({ success: true, decisions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent-control/replay
 * Reconstructs the exact decision process for an audit record.
 */
router.post("/replay", (req, res) => {
  try {
    const { auditId } = req.body;
    if (!auditId) {
      return res.status(400).json({ success: false, error: "auditId is required for replay" });
    }

    const kernel = AgentKernel.getInstance();
    const replayResult = kernel.getDecisionAudit().replayDecision(auditId);
    if (!replayResult) {
      return res.status(404).json({ success: false, error: `Audit record ${auditId} not found` });
    }

    res.json({ success: true, replay: replayResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent-control/shadow
 * Returns shadow mode comparison metrics and hypothetical P&L.
 */
router.get("/shadow", (_req, res) => {
  try {
    const kernel = AgentKernel.getInstance();
    const summary = kernel.getShadowSandbox().getShadowPerformanceSummary();
    const records = kernel.getShadowSandbox().getRecentShadowRecords(20);
    res.json({ success: true, summary, records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
