import { jest } from '@jest/globals';
import { BasePredictor } from '../src/services/aqea/ai/BasePredictor.js';
import { withExecutionDeadline } from '../src/utils/executionDeadline.js';
class BrokenPredictor extends BasePredictor {
  protected modelName = 'CNN_TEST';
  calls = 0;
  constructor(private error: Error) { super(); }
  protected async runInference(): Promise<any> { this.calls++; throw this.error; }
}
const bullishFeatures: any = {market: {rsi: 70, adx: 40, close: 110, ema20: 100, ema50: 95}};
test.each(['MODEL_SERVICE_TIMEOUT: Request timed out after 2500ms', 'fetch failed', 'getaddrinfo ENOTFOUND api.binance.com', 'This operation was aborted'])(
  'does not turn unavailable inference into a confident model vote: %s', async message => {
    const prediction = await new BrokenPredictor(new Error(message)).predict(bullishFeatures);
    expect(prediction).toMatchObject({direction: 'HOLD', confidence: 0, probability: 0, meta: {recommendedAction: 'UNAVAILABLE'}});
  },
);
test('does not submit inference for an expired scheduler task', async () => {
  jest.useFakeTimers();
  const predictor = new BrokenPredictor(new Error('should not run'));
  try {
    await expect(withExecutionDeadline(10, 'tick expired', async () => {
      await jest.advanceTimersByTimeAsync(11);
      await predictor.predict(bullishFeatures);
    })).rejects.toThrow('tick expired');
    expect(predictor.calls).toBe(0);
  } finally { jest.useRealTimers(); }
});
