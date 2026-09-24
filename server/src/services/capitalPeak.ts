/**
 * Most capital that was in open trades at the same time — the fair base for
 * "what return did I make on the money I actually used" (cash is reused
 * across trades, and most of a deposit can sit idle).
 */
export function peakConcurrentCapital(trades: Array<{ openedAt?: any; closedAt?: any; cost: number }>): number {
  const ev: Array<[number, number]> = [];
  for (const t of trades) {
    const o = t.openedAt ? new Date(t.openedAt).getTime() : NaN;
    if (!Number.isFinite(o) || !(t.cost > 0)) continue;
    const c = t.closedAt ? new Date(t.closedAt).getTime() : Date.now();
    ev.push([o, t.cost], [Math.max(o, c), -t.cost]);
  }
  // At equal timestamps, process closes before opens.
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, peak = 0;
  for (const [, d] of ev) { cur += d; if (cur > peak) peak = cur; }
  return Math.round(peak * 100) / 100;
}
