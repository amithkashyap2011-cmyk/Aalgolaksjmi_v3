import { jest, describe, test, expect, afterEach } from '@jest/globals';
import { checkExecutionDeadline, withExecutionDeadline, ExecutionDeadlineError } from '../src/utils/executionDeadline.js';

afterEach(() => jest.useRealTimers());

describe('scheduler execution deadlines', () => {
  test('keeps ownership while a timed-out request drains and prevents its late order', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const request = new Promise<void>(resolve => { release = resolve; });
    const submitOrder = jest.fn();
    let locked = true;
    const task = withExecutionDeadline(35_000, 'symbol timeout', async () => {
      await request;
      checkExecutionDeadline();
      submitOrder();
    }).finally(() => { locked = false; });
    const rejection = expect(task).rejects.toThrow('symbol timeout');
    await jest.advanceTimersByTimeAsync(36_000);
    expect(locked).toBe(true);
    release();
    await rejection;
    expect(locked).toBe(false);
    expect(submitOrder).not.toHaveBeenCalled();
  });

  test('a child cannot extend the tick deadline or start another batch after it', async () => {
    jest.useFakeTimers();
    const nextBatch = jest.fn();
    await expect(withExecutionDeadline(55_000, 'tick timeout', async () => {
      await jest.advanceTimersByTimeAsync(40_000);
      await expect(withExecutionDeadline(35_000, 'symbol timeout', async () => {
        await jest.advanceTimersByTimeAsync(16_000);
        checkExecutionDeadline();
      })).rejects.toThrow('tick timeout');
      checkExecutionDeadline();
      nextBatch();
    })).rejects.toBeInstanceOf(ExecutionDeadlineError);
    expect(nextBatch).not.toHaveBeenCalled();
  });

  test('finishes reconciliation for an order submitted before expiry', async () => {
    jest.useFakeTimers();
    const reconcile = jest.fn();
    await expect(withExecutionDeadline(35_000, 'symbol timeout', async () => {
      checkExecutionDeadline();
      await jest.advanceTimersByTimeAsync(36_000); // exchange response
      reconcile();
    })).rejects.toThrow('symbol timeout');
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  test('successful and failed calls preserve their result and leave no deadline behind', async () => {
    expect(await withExecutionDeadline(1000, 'timeout', async () => 42)).toBe(42);
    await expect(withExecutionDeadline(1000, 'timeout', async () => { throw new Error('network'); })).rejects.toThrow('network');
    expect(() => checkExecutionDeadline()).not.toThrow();
  });
});
