/**
 * Per-day capital and P&L (IST calendar days), shared by the Indian and
 * crypto dashboards: how much was put into trades each day, the most that was
 * in the market at once, what closed (and its net P&L), and what was still
 * held at the end of the day (right now, for today).
 *
 * Capital per trade is the caller's cost (entry cost for Indian trades,
 * notional ÷ leverage for crypto) so these rows agree with the existing
 * "Put into trades" / "Peak in market" figures.
 */
export interface DailyTradeInput {
  openedAt: Date | string;
  closedAt?: Date | string | null;
  /** Capital tied up by the trade. */
  cost: number;
  /** Realized P&L before charges (closed trades). */
  realized?: number;
  /** Charges paid at close. */
  charges?: number;
  /** Current open P&L (open trades only; used for today's row). */
  unrealized?: number;
  open: boolean;
}

export interface DailyRow {
  date: string;              // YYYY-MM-DD (IST)
  opened: number;            // trades opened that day
  invested: number;          // capital put into trades opened that day
  peak: number;              // most capital in open trades at once that day
  closedCount: number;
  closedCost: number;        // capital of trades closed that day
  won: number;
  lost: number;
  charges: number;
  realizedNet: number;       // realized P&L − charges of trades closed that day
  holdingCount: number;      // still open at end of day (now, for today)
  holdingCost: number;
  unrealized: number | null; // open P&L — known only for today
}

const IST_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const ms = (d: any) => (d ? new Date(d).getTime() : NaN);

/** Start of the IST day containing t, as a UTC timestamp. */
export function istDayStart(t: number): number {
  return Math.floor((t + IST_MS) / DAY_MS) * DAY_MS - IST_MS;
}

export function dailyBreakdown(trades: DailyTradeInput[], days = 30, now = Date.now()): DailyRow[] {
  const valid = trades
    .map((t) => ({ ...t, o: ms(t.openedAt), c: t.open ? NaN : ms(t.closedAt) }))
    .filter((t) => Number.isFinite(t.o) && t.cost > 0);
  const todayStart = istDayStart(now);
  const rows: DailyRow[] = [];

  for (let i = 0; i < days; i++) {
    const start = todayStart - i * DAY_MS;
    const end = i === 0 ? now : start + DAY_MS;
    const row: DailyRow = {
      date: new Date(start + IST_MS).toISOString().slice(0, 10),
      opened: 0, invested: 0, peak: 0,
      closedCount: 0, closedCost: 0, won: 0, lost: 0, charges: 0, realizedNet: 0,
      holdingCount: 0, holdingCost: 0, unrealized: i === 0 ? 0 : null,
    };

    // Concurrency within the day: capital already open at the start, then
    // opens/closes inside the day (closes first at equal timestamps).
    let cur = 0;
    const ev: Array<[number, number]> = [];
    for (const t of valid) {
      const closeAt = Number.isFinite(t.c) ? t.c : Infinity;
      if (t.o >= start && t.o < end) { row.opened++; row.invested += t.cost; }
      if (Number.isFinite(t.c) && t.c >= start && t.c < end) {
        const net = (t.realized ?? 0) - (t.charges ?? 0);
        row.closedCount++; row.closedCost += t.cost; row.charges += t.charges ?? 0; row.realizedNet += net;
        if (net > 0) row.won++; else row.lost++;
      }
      if (t.o < end && closeAt >= end) {
        row.holdingCount++; row.holdingCost += t.cost;
        if (i === 0) row.unrealized = (row.unrealized ?? 0) + (t.unrealized ?? 0);
      }
      if (t.o < start && closeAt >= start) cur += t.cost;
      else if (t.o >= start && t.o < end) ev.push([t.o, t.cost]);
      if (Number.isFinite(t.c) && t.c >= start && t.c < end && t.o < end) ev.push([Math.max(t.c, t.o), -t.cost]);
    }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let peak = cur;
    for (const [, d] of ev) { cur += d; if (cur > peak) peak = cur; }
    row.peak = peak;

    if (row.opened || row.closedCount || row.holdingCount) {
      rows.push({
        ...row,
        invested: r2(row.invested), peak: r2(row.peak), closedCost: r2(row.closedCost),
        charges: r2(row.charges), realizedNet: r2(row.realizedNet), holdingCost: r2(row.holdingCost),
        unrealized: row.unrealized === null ? null : r2(row.unrealized),
      });
    }
  }
  return rows;
}
