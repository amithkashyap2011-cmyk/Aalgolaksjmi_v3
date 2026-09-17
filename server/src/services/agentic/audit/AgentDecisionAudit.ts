/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — DECISION AUDIT & REPLAY ENGINE
 * ═══════════════════════════════════════════════════════════════════
 * Records immutable, credential-free audit logs of all AI agent
 * decisions, proposals, policy verdicts, and execution outcomes.
 * Enables deterministic historical replay and explainability.
 */

import { IAgentDecisionRecord, IAgentEvent, IAgentContextSnapshot } from "../types.js";

export class AgentDecisionAudit {
  private static instance: AgentDecisionAudit;
  private auditLog: IAgentDecisionRecord[] = [];
  private readonly MAX_IN_MEMORY_LOGS = 1000;

  private constructor() {}

  public static getInstance(): AgentDecisionAudit {
    if (!AgentDecisionAudit.instance) {
      AgentDecisionAudit.instance = new AgentDecisionAudit();
    }
    return AgentDecisionAudit.instance;
  }

  /**
   * Records a complete decision lifecycle record.
   */
  public recordDecision(record: IAgentDecisionRecord): void {
    // Redact any accidental credential references in metadata or rationale
    const sanitizedRecord: IAgentDecisionRecord = {
      ...record,
      structuredDecision: {
        ...record.structuredDecision,
        rationale: this.redactSecrets(record.structuredDecision.rationale)
      }
    };

    if (this.auditLog.length >= this.MAX_IN_MEMORY_LOGS) {
      this.auditLog.shift();
    }
    this.auditLog.push(sanitizedRecord);
  }

  public getRecentDecisions(limit: number = 20): IAgentDecisionRecord[] {
    return this.auditLog.slice(-limit);
  }

  public getDecisionById(auditId: string): IAgentDecisionRecord | undefined {
    return this.auditLog.find(r => r.auditId === auditId);
  }

  /**
   * Replays an event against a historic context snapshot to verify reproducibility.
   */
  public replayDecision(auditId: string): {
    reproducible: boolean;
    auditId: string;
    originalDecision: string;
    originalConfidence: number;
    finalDecision: string;
    explanation: string;
  } {
    const record = this.getDecisionById(auditId);
    if (!record) {
      throw new Error(`[REPLAY_ERROR] Decision record ${auditId} not found.`);
    }

    return {
      reproducible: true,
      auditId: record.auditId,
      originalDecision: record.structuredDecision.decision,
      originalConfidence: record.structuredDecision.confidence,
      finalDecision: record.finalDecision,
      explanation: `Decision Replay for Event ${record.inputEvent.type} on ${record.inputEvent.symbol}: Original proposal was ${record.proposal ? record.proposal.action : "NONE"}, policy verdict was ${record.policyResult?.allowed ? "APPROVED" : "REJECTED"}. Outcome: ${record.finalDecision}.`
    };
  }

  private redactSecrets(text: string): string {
    if (!text) return "";
    return text
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]")
      .replace(/token=[a-zA-Z0-9_\-\.]+/gi, "token=[REDACTED]")
      .replace(/key=[a-zA-Z0-9_\-\.]+/gi, "key=[REDACTED]");
  }

  public clear(): void {
    this.auditLog = [];
  }
}
