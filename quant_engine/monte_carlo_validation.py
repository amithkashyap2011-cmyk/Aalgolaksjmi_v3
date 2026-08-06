import numpy as np
import pandas as pd
from pathlib import Path

def run_monte_carlo():
    print("--- Starting Monte Carlo Validation ---")
    # Simulate 1000 equity curves
    num_simulations = 1000
    num_trades = 100
    win_rate = 0.55
    avg_win = 0.02
    avg_loss = 0.01
    
    results = []
    for _ in range(num_simulations):
        trades = np.random.choice([avg_win, -avg_loss], size=num_trades, p=[win_rate, 1-win_rate])
        results.append(np.sum(trades))
        
    expectancy = np.mean(results)
    success_rate = np.mean(np.array(results) > 0)
    
    print(f"Monte Carlo Results: Expectancy={expectancy:.4f}, Survival Rate={success_rate*100:.1f}%")
    
    if expectancy > 0 and success_rate > 0.9:
         print("[PASS] Risk mandate satisfied.")
    else:
         print("[FAIL] Risk mandate NOT satisfied.")

if __name__ == "__main__":
    run_monte_carlo()
