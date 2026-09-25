import { dailyBreakdown, istDayStart } from "../src/services/dailyBreakdown.js";

// "now" = 2026-09-25 15:30 IST
const now = Date.UTC(2026, 8, 25, 10, 0);
const ist = (d: number, h: number, m = 0) => Date.UTC(2026, 8, d, h, m) - 5.5 * 3_600_000;

test("IST day boundaries", () => {
  expect(new Date(istDayStart(now)).toISOString()).toBe("2026-09-24T18:30:00.000Z");
});

test("per-day invested, peak, closed and holding", () => {
  const rows = dailyBreakdown([
    // yesterday: opened, carried overnight, closed today
    { openedAt: ist(24, 14), closedAt: ist(25, 10), cost: 5000, realized: 700, charges: 20, open: false },
    // today: two overlapping trades, one closed at a loss
    { openedAt: ist(25, 9, 30), closedAt: ist(25, 11), cost: 3000, realized: -400, charges: 20, open: false },
    { openedAt: ist(25, 10, 30), cost: 4000, unrealized: 250, open: true },
  ], 7, now);

  const today = rows.find((r) => r.date === "2026-09-25")!;
  expect(today.opened).toBe(2);
  expect(today.invested).toBe(7000);
  expect(today.peak).toBe(8000);         // 09:30-10:00: 5000 carried + 3000 (carried closes before the 10:30 open)
  expect(today.closedCount).toBe(2);
  expect(today.won).toBe(1);
  expect(today.lost).toBe(1);
  expect(today.charges).toBe(40);
  expect(today.realizedNet).toBe(260);   // (700-20) + (-400-20)
  expect(today.holdingCount).toBe(1);
  expect(today.holdingCost).toBe(4000);
  expect(today.unrealized).toBe(250);

  const yday = rows.find((r) => r.date === "2026-09-24")!;
  expect(yday.invested).toBe(5000);
  expect(yday.closedCount).toBe(0);
  expect(yday.holdingCount).toBe(1);     // carried overnight
  expect(yday.holdingCost).toBe(5000);
  expect(yday.unrealized).toBeNull();

  expect(rows.map((r) => r.date)).toEqual(["2026-09-25", "2026-09-24"]); // empty days omitted
});
