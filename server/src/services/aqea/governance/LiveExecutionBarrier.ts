/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Central Live Execution Hard Barrier (Phase 7.5)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Implements the mandatory fail-closed execution barrier:
 * IF LIVE_PROMOTION_BLOCKED === TRUE, THEN LIVE_ORDER_AUTHORIZATION = FALSE.
 *
 * Guarantees that no live capital order can execute regardless of upstream
 * model prediction, probability, NetEV, risk approval, position size,
 * UI setting, admin permission, API request, or direct service invocation.
 */

import { ForwardTelemetryStore } from "../ensemble/ForwardTelemetryStore.js";
import { AutonomousForwardEvidenceEngine } from "./AutonomousForwardEvidenceEngine.js";
import {
  AQEAAutonomousControlPlane,
  TradeExecutionAuthorization
} from "../autonomy/AQEAAutonomousControlPlane.js";

export interface ExecutionBarrierResult {
  permitted: boolean;
  reason?: string;
  mode: "PAPER" | "LIVE";
  timestamp: number;
}

export class LiveExecutionBarrier {
  /**
   * Returns true if live capital trading is currently authorized across all gates.
   */
  public static isLiveTradingPermitted(): boolean {
    return !ForwardTelemetryStore.isLivePromotionBlocked() && this.verifyExecutionPermitted("LIVE").permitted;
  }

  /**
   * Evaluates whether an order execution request is structurally permitted.
   * Enforces the immutable barrier for live capital trading.
   */
  public static verifyExecutionPermitted(
    mode: "PAPER" | "LIVE",
    auth?: TradeExecutionAuthorization | null
  ): ExecutionBarrierResult {
    const timestamp = Date.now();

    // 1. PAPER Execution Path
    if (mode === "PAPER") {
      const val = AQEAAutonomousControlPlane.validateExecutionAuthorization(auth);
      return {
        permitted: val.valid,
        reason: val.valid ? undefined : val.reason,
        mode: "PAPER",
        timestamp
      };
    }

    // 2. LIVE Execution Path — Hard Immutable Barrier
    if (ForwardTelemetryStore.isLivePromotionBlocked()) {
      return {
        permitted: false,
        reason: "LIVE_PROMOTION_BLOCKED_BARRIER: Live capital execution is permanently locked until all 13 forward OOS criteria pass.",
        mode: "LIVE",
        timestamp
      };
    }

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    if (!report.isLiveApproved) {
      return {
        permitted: false,
        reason: `LIVE_GOVERNANCE_BLOCKED: Current state is ${report.currentState} with active blockers: ${report.blockers.join("; ")}`,
        mode: "LIVE",
        timestamp
      };
    }

    const val = AQEAAutonomousControlPlane.validateExecutionAuthorization(auth);
    if (!val.valid) {
      return {
        permitted: false,
        reason: val.reason,
        mode: "LIVE",
        timestamp
      };
    }

    return {
      permitted: true,
      mode: "LIVE",
      timestamp
    };
  }
}
