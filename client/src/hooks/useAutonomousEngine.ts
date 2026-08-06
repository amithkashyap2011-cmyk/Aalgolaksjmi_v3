import { useState, useEffect } from "react";
import { socket } from "../lib/socket";
import { useAppStore } from "../store/useAppStore";

export function useAutonomousEngine(symbol: string, entryPrice?: number) {
  const [atr, setAtr] = useState<number>(0);
  const { consensusData } = useAppStore();

  useEffect(() => {
    const handleTick = (tick: any) => {
      if (tick.symbol === symbol) {
        // Mock ATR using price fluctuations for visual dynamism
        // In production, backend should stream exact ATR
        const mockAtr = parseFloat(tick.price) * 0.015; // Rough estimate 1.5%
        setAtr(mockAtr);
      }
    };
    socket.on("tick", handleTick);
    return () => {
      socket.off("tick", handleTick);
    };
  }, [symbol]);

  const consensus = consensusData[symbol];
  const cAi = consensus?.confidenceLong ?? 0.5;
  const alpha = 1.5;
  const rr = 2.0;
  const volCoeff = 0.5;

  // L_dyn = max(1, min(MaxLeverage, (VolCoeff / ATR) * C_ai))
  const maxLev = 24;
  const lDyn = atr > 0 ? Math.max(1, Math.min(maxLev, Math.floor((volCoeff / atr) * cAi * 100))) : 1;

  // Calculate live SL / TP points if entry price is provided
  let liveSl = 0;
  let liveTp = 0;
  if (entryPrice && atr > 0) {
    liveSl = entryPrice - (atr * alpha);
    liveTp = entryPrice + (atr * alpha * rr);
  }

  return { atr, lDyn, liveSl, liveTp, alpha, rr, cAi };
}
