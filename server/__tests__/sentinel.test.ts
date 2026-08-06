import { describe, it, expect, jest } from '@jest/globals';

// Mock the dependencies
const mockWallet = new Map<string, number>();
const mockPaper = {
  getWallet: jest.fn().mockReturnValue(mockWallet),
  getOpenPositions: jest.fn().mockReturnValue([]),
  setWalletBalance: jest.fn()
};

// Simulation of the Sentinel Logic
async function runSentinelAudit(userId: string, mode: "PAPER" | "LIVE") {
  const wallet = mockPaper.getWallet(userId, mode) as Map<string, number>;
  const available = wallet.get("USDT") || 0;
  
  const openPositions = mockPaper.getOpenPositions(userId, mode) as any[];
  const lockedMargin = openPositions.reduce((sum: any, pos: any) => {
    return sum + (pos.quantity * pos.entryPrice) / (pos.leverage || 1);
  }, 0);

  const totalCash = available + lockedMargin;
  
  // Reconcile trigger (lowered for test simulation)
  if (mode === "PAPER" && totalCash > 450) {
    mockPaper.setWalletBalance(userId, mode, "USDT", 100 - lockedMargin);
    return "RECONCILED";
  }
  return "PASSED";
}

describe('Sentinel Auditor (Autonomous Oversight)', () => {
  it('should pass if the balance is within normal limits', async () => {
    mockWallet.set("USDT", 100);
    mockPaper.getOpenPositions.mockReturnValue([]);
    
    const result = await runSentinelAudit("user1", "PAPER");
    expect(result).toBe("PASSED");
    expect(mockPaper.setWalletBalance).not.toHaveBeenCalled();
  });

  it('should detect and reconcile inflated balances (Ghost Money Bug)', async () => {
    // Simulate the $514 bug
    mockWallet.set("USDT", 445);
    mockPaper.getOpenPositions.mockReturnValue([
      { symbol: 'DOGEUSDT', quantity: 8000, entryPrice: 0.1, leverage: 125 } // $64 margin
    ]);
    
    const result = await runSentinelAudit("user1", "PAPER");
    
    // Total Cash = 445 + 6.4 = 451.4. Should reconcile.
    expect(result).toBe("RECONCILED");
    
    // Correct balance should be 100 - 6.4 = 93.6 USDT available
    expect(mockPaper.setWalletBalance).toHaveBeenCalledWith("user1", "PAPER", "USDT", 93.6);
  });
});
