/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — GOVERNANCE & SAFETY ENGINE
 * ═══════════════════════════════════════════════════════════════════
 * Enforces rate limiting, proposal cooldown deduplication, recursive
 * loop protection, and prompt injection defenses.
 */

import { IActionProposal } from "../types.js";

export class AgentGovernance {
  private static instance: AgentGovernance;

  // Rate Limiting Maps
  private agentCallCounts: Map<string, { count: number; windowStart: number }> = new Map();
  private readonly MAX_CALLS_PER_MINUTE = 60;

  // Action Cooldown Deduplication Map
  private recentProposals: Map<string, number> = new Map();
  private readonly PROPOSAL_COOLDOWN_MS = 30000; // 30 seconds

  // Active Recursion Chains
  private activeCorrelationDepths: Map<string, number> = new Map();
  private readonly MAX_CALL_DEPTH = 3;

  private constructor() {}

  public static getInstance(): AgentGovernance {
    if (!AgentGovernance.instance) {
      AgentGovernance.instance = new AgentGovernance();
    }
    return AgentGovernance.instance;
  }

  /**
   * Rate limiting: Verifies an agent has not exceeded its calls/minute quota.
   */
  public checkRateLimit(agentId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const current = this.agentCallCounts.get(agentId) || { count: 0, windowStart: now };

    if (now - current.windowStart > 60000) {
      this.agentCallCounts.set(agentId, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (current.count >= this.MAX_CALLS_PER_MINUTE) {
      return { 
        allowed: false, 
        reason: `Rate limit exceeded: Agent ${agentId} made ${current.count} calls in the last 60s (max ${this.MAX_CALLS_PER_MINUTE}).` 
      };
    }

    current.count++;
    this.agentCallCounts.set(agentId, current);
    return { allowed: true };
  }

  /**
   * Cooldown Deduplication: Prevents repeating identical action proposals within cooldown window.
   */
  public checkCooldown(proposal: IActionProposal): { allowed: boolean; reason?: string } {
    const dedupeKey = `${proposal.instrument}:${proposal.action}:${proposal.side || "NONE"}:${proposal.quantity}`;
    const now = Date.now();
    const lastTime = this.recentProposals.get(dedupeKey);

    if (lastTime && (now - lastTime < this.PROPOSAL_COOLDOWN_MS)) {
      const remainingSeconds = Math.ceil((this.PROPOSAL_COOLDOWN_MS - (now - lastTime)) / 1000);
      return { 
        allowed: false, 
        reason: `Proposal cooldown active: Identical proposal for ${dedupeKey} was submitted ${((now - lastTime)/1000).toFixed(1)}s ago. Must wait ${remainingSeconds}s.` 
      };
    }

    this.recentProposals.set(dedupeKey, now);
    return { allowed: true };
  }

  /**
   * Loop Protection: Tracks call depth per correlation chain to prevent infinite loops.
   */
  public enterCallChain(correlationId: string): { allowed: boolean; currentDepth: number; reason?: string } {
    const currentDepth = (this.activeCorrelationDepths.get(correlationId) || 0) + 1;
    this.activeCorrelationDepths.set(correlationId, currentDepth);

    if (currentDepth > this.MAX_CALL_DEPTH) {
      return {
        allowed: false,
        currentDepth,
        reason: `Agent loop detected: Call depth ${currentDepth} exceeds max permitted depth ${this.MAX_CALL_DEPTH} for correlation ${correlationId}.`
      };
    }

    return { allowed: true, currentDepth };
  }

  public exitCallChain(correlationId: string): void {
    const current = this.activeCorrelationDepths.get(correlationId);
    if (current && current > 1) {
      this.activeCorrelationDepths.set(correlationId, current - 1);
    } else {
      this.activeCorrelationDepths.delete(correlationId);
    }
  }

  /**
   * Prompt Injection & Adversarial Text Sanitization (Requirement 37 & 45):
   * Strips malicious directive phrases that attempt to override deterministic policies.
   */
  public sanitizeExternalText(text: string): { sanitized: string; injectionDetected: boolean; threat?: string } {
    if (!text || typeof text !== "string") return { sanitized: "", injectionDetected: false };

    const injectionPatterns = [
      /ignore\s+(all\s+)?(risk|limits|rules|policy)/gi,
      /disable\s+(stop\s*loss|sl|target|kill\s*switch)/gi,
      /bypass\s+(reconciliation|validation|policy)/gi,
      /buy\s+(unlimited|maximum|infinite)/gi,
      /override\s+(risk|guardrails|safety)/gi,
      /execute\s+immediately\s+without\s+checks/gi,
      /system\s*:\s*you\s+are\s+now/gi
    ];

    let sanitized = text;
    let injectionDetected = false;
    let threat: string | undefined;

    for (const pattern of injectionPatterns) {
      if (pattern.test(sanitized)) {
        injectionDetected = true;
        threat = `PROMPT_INJECTION_PATTERN_MATCH: ${pattern.toString()}`;
        sanitized = sanitized.replace(pattern, "[MALICIOUS_DIRECTIVE_BLOCKED]");
      }
    }

    return { sanitized, injectionDetected, threat };
  }

  public clear(): void {
    this.recentProposals.clear();
    this.agentCallCounts.clear();
    this.activeCorrelationDepths.clear();
  }
}
