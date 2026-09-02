/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — TOOL REGISTRY
 * ═══════════════════════════════════════════════════════════════════
 * Controlled, schema-validated tool catalog with capability permissions.
 */

import { IToolDefinition, ToolCapability, IAgentExecutionContext } from "./types.js";

export class AgentToolRegistry {
  private static instance: AgentToolRegistry;
  private tools = new Map<string, IToolDefinition>();

  private constructor() {}

  public static getInstance(): AgentToolRegistry {
    if (!AgentToolRegistry.instance) {
      AgentToolRegistry.instance = new AgentToolRegistry();
    }
    return AgentToolRegistry.instance;
  }

  public registerTool<TInput = any, TOutput = any>(tool: IToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(tool.toolId)) {
      console.warn(`[AgentToolRegistry] Overwriting tool registration: ${tool.toolId}`);
    }
    this.tools.set(tool.toolId, tool);
  }

  public getTool(toolId: string): IToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  public getAllTools(): IToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public async executeTool<TInput = any, TOutput = any>(
    toolId: string,
    input: TInput,
    context: IAgentExecutionContext,
    agentCapabilities: ToolCapability[]
  ): Promise<TOutput> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`TOOL_NOT_FOUND: Tool "${toolId}" is not registered.`);
    }

    // 1. Check capability permission
    if (!agentCapabilities.includes(tool.requiredCapability)) {
      throw new Error(
        `PERMISSION_DENIED: Agent "${context.step.agentId}" lacks required capability "${tool.requiredCapability}" for tool "${toolId}".`
      );
    }

    // 2. Enforce Control Mode policy for side-effects
    if (tool.hasSideEffects && context.context.controlMode === "SAFE") {
      throw new Error(`SAFE_MODE_VIOLATION: Side-effect tool "${toolId}" is forbidden in SAFE mode.`);
    }

    if (tool.hasSideEffects && context.context.controlMode === "MANUAL" && tool.requiredCapability === "LIVE_EXECUTION") {
      throw new Error(`MANUAL_MODE_VIOLATION: Live execution tool "${toolId}" requires explicit manual approval.`);
    }

    // 3. Schema validation if provided
    if (tool.validateInput && !tool.validateInput(input)) {
      throw new Error(`INVALID_TOOL_INPUT: Input validation failed for tool "${toolId}".`);
    }

    // 4. Bounded execution with timeout & retries
    const timeoutMs = Math.min(tool.timeoutMs || 2000, 5000);
    let attempts = 0;
    const maxAttempts = tool.retryPolicy?.maxRetries ? tool.retryPolicy.maxRetries + 1 : 1;
    let lastError: any;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`TOOL_TIMEOUT: Tool "${toolId}" exceeded ${timeoutMs}ms limit.`)), timeoutMs)
        );

        return await Promise.race([
          tool.execute(input, context),
          timeoutPromise,
        ]);
      } catch (err: any) {
        lastError = err;
        if (attempts < maxAttempts && tool.retryPolicy?.backoffMs) {
          await new Promise((r) => setTimeout(r, tool.retryPolicy.backoffMs * attempts));
        }
      }
    }

    throw lastError || new Error(`TOOL_EXECUTION_FAILED: Tool "${toolId}" failed after ${maxAttempts} attempts.`);
  }
}
