import { peakConcurrentCapital } from "../src/services/capitalPeak.js";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 24, h, m));

test("peak = most capital open at the same time, not the sum of all trades", () => {
  const trades = [
    { openedAt: at(4), closedAt: at(5), cost: 10_000 },
    { openedAt: at(4, 30), closedAt: at(6), cost: 20_000 }, // overlaps the first → 30k
    { openedAt: at(7), closedAt: at(8), cost: 25_000 },     // alone → 25k
  ];
  expect(peakConcurrentCapital(trades)).toBe(30_000);
});

test("a close and an open at the same instant don't double count", () => {
  expect(peakConcurrentCapital([
    { openedAt: at(4), closedAt: at(5), cost: 10_000 },
    { openedAt: at(5), closedAt: at(6), cost: 10_000 },
  ])).toBe(10_000);
});

test("open trades count until now; bad rows are ignored", () => {
  expect(peakConcurrentCapital([{ openedAt: at(4), cost: 5_000 }, { cost: 9_999 } as any, { openedAt: at(4), cost: 0 }])).toBe(5_000);
});
