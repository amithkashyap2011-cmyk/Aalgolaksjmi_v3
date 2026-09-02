/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — REST & REALTIME TELEMETRY ROUTES
 * ═══════════════════════════════════════════════════════════════════
 * Endpoints for Agent Kernel status, control mode transitions, emergency stop,
 * symbol evaluations, memory inspection, and real-time telemetry.
 */

import { Router } from "express";
import { AgentKernel } from "../kernel/AgentKernel.js";
import { AgentStateManager } from "../kernel/AgentStateManager.js";
import { AgentEventBus } from "../kernel/AgentEventBus.js";
import { AgentMemory } from "../kernel/AgentMemory.js";
import { AgentGoalManager } from "../kernel/AgentGoalManager.js";
import { ControlMode } from "../kernel/types.js";

const router = Router();

/**
 * GET /api/kernel/status
 * Complete health, agent matrix, active goals, and control mode.
 */
router.get("/status", async (_req, res) => {
  try {
    const kernel = AgentKernel.getInstance();
    const status = await kernel.getKernelStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/kernel/control-mode
 * Sets AI_AUTONOMOUS, MANUAL, or SAFE mode.
 */
router.post("/control-mode", (req, res) => {
  try {
    const mode = req.body?.mode as ControlMode;
    const reason = req.body?.reason || "API request";
    if (!["AI_AUTONOMOUS", "MANUAL", "SAFE"].includes(mode)) {
      return res.status(400).json({ success: false, error: `Invalid control mode: ${mode}` });
    }

    AgentKernel.getInstance().setControlMode(mode, reason);
    res.json({
      success: true,
      controlMode: AgentKernel.getInstance().getControlMode(),
      message: `Control mode successfully updated to ${mode}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/kernel/emergency-stop
 * Deterministic emergency stop immediately preventing autonomous actions.
 */
router.post("/emergency-stop", (req, res) => {
  try {
    const reason = req.body?.reason || "Emergency stop triggered via API";
    AgentKernel.getInstance().emergencyStop(reason);
    res.json({
      success: true,
      controlMode: "SAFE",
      isEmergencyStopped: true,
      message: "Emergency stop active. Autonomous execution halted.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/kernel/clear-emergency-stop
 * Clears emergency stop and returns control mode to MANUAL for safe verification.
 */
router.post("/clear-emergency-stop", (req, res) => {
  try {
    const operator = req.body?.operator || "admin";
    AgentKernel.getInstance().clearEmergencyStop(operator);
    res.json({
      success: true,
      controlMode: AgentKernel.getInstance().getControlMode(),
      isEmergencyStopped: false,
      message: "Emergency stop cleared. Control mode set to MANUAL.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/kernel/evaluate
 * Triggers symbol evaluation through the Agent Kernel.
 */
router.post("/evaluate", async (req, res) => {
  try {
    const symbol = (req.body?.symbol as string) || "BTCUSDT";
    const mode = (req.body?.mode as "PAPER" | "LIVE") || "PAPER";
    const marketDomain = req.body?.marketDomain || (symbol.endsWith("USDT") ? "CRYPTO" : "INDIAN");
    const accountType = req.body?.accountType;

    const kernel = AgentKernel.getInstance();
    const decision = await kernel.evaluateSymbol(symbol, {
      userId: req.body?.userId || "guest-user",
      mode,
      marketDomain,
      accountType,
      currentPrice: req.body?.currentPrice,
      bars: req.body?.bars,
    });

    res.json({
      success: true,
      decision,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/kernel/events
 * Streams recent typed events from the Agent Event Bus.
 */
router.get("/events", (req, res) => {
  try {
    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const events = AgentEventBus.getInstance().getRecentEvents({ limit });
    res.json({ success: true, count: events.length, events });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/kernel/memory
 * Inspects episodic memory and model performance telemetry.
 */
router.get("/memory", (_req, res) => {
  try {
    const memory = AgentMemory.getInstance();
    res.json({
      success: true,
      recentEpisodes: memory.getRecentEpisodes(),
      modelPerformances: memory.getAllModelPerformance(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
