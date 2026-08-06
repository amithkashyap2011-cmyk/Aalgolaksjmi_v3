import { useState, useEffect } from "react";
import * as api from "../lib/api";
import { socket } from "../lib/socket";

export function useKlines(symbol: string, interval: string, limit = 100) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchInitial() {
      try {
        setLoading(true);
        const klines = await api.getKlines(symbol, interval, limit);
        if (active) {
          setData(klines.map(k => ({
            time: k.openTime / 1000,
            open: parseFloat(k.open),
            high: parseFloat(k.high),
            low: parseFloat(k.low),
            close: parseFloat(k.close),
          })));
        }
      } catch (err) {
        console.error("Failed to fetch klines:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchInitial();

    return () => {
      active = false;
    };
  }, [symbol, interval, limit]);

  useEffect(() => {
    const handleTick = (tick: any) => {
      if (tick.symbol !== symbol) return;
      
      const intervalInSeconds = (tf: string) => {
        const value = parseInt(tf);
        if (tf.endsWith("m")) return value * 60;
        if (tf.endsWith("h")) return value * 3600;
        if (tf.endsWith("d")) return value * 86400;
        return 60;
      };

      const step = intervalInSeconds(interval);
      
      setData(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const now = Math.floor(Date.now() / 1000);
        
        const lastCandleStart = last.time;
        
        if (now < lastCandleStart + step) {
          const updated = {
            ...last,
            high: Math.max(last.high, parseFloat(tick.price)),
            low: Math.min(last.low, parseFloat(tick.price)),
            close: parseFloat(tick.price),
          };
          return [...prev.slice(0, -1), updated];
        } else {
          // New candle
          const next = {
            time: Math.floor(now / step) * step,
            open: parseFloat(tick.price),
            high: parseFloat(tick.price),
            low: parseFloat(tick.price),
            close: parseFloat(tick.price),
          };
          return [...prev.slice(1), next];
        }
      });
    };

    socket.on("tick", handleTick);
    return () => {
      socket.off("tick", handleTick);
    };
  }, [symbol, interval]);

  return { data, loading };
}
