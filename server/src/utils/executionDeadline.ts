import { AsyncLocalStorage } from "node:async_hooks";

export class ExecutionDeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionDeadlineError";
  }
}

type Deadline = { expiresAt: number; error: ExecutionDeadlineError };
const deadlines = new AsyncLocalStorage<Deadline>();

/** Stop scheduling work and submitting orders after the inherited deadline. */
export function checkExecutionDeadline(): void {
  const deadline = deadlines.getStore();
  if (deadline && Date.now() >= deadline.expiresAt) throw deadline.error;
}

/**
 * Keep ownership until work settles. Racing a timer releases locks while the
 * losing promise is still running. Already submitted orders must finish their
 * accounting; callers check the deadline before submitting new side effects.
 */
export async function withExecutionDeadline<T>(
  timeoutMs: number,
  message: string,
  work: () => Promise<T>,
): Promise<T> {
  const parent = deadlines.getStore();
  const own = { expiresAt: Date.now() + timeoutMs, error: new ExecutionDeadlineError(message) };
  const deadline = parent && parent.expiresAt <= own.expiresAt ? parent : own;
  return deadlines.run(deadline, async () => {
    checkExecutionDeadline();
    try {
      const result = await work();
      checkExecutionDeadline();
      return result;
    } catch (error) {
      checkExecutionDeadline();
      throw error;
    }
  });
}
