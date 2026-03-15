/*
 * ─── RingBuffer Unit Tests ─────────────────────────────
 *
 * Tests the fixed-capacity circular buffer used throughout
 * the indicator pipeline (SMA, Bollinger, StdDev, etc.)
 */
import { RingBuffer } from "../src/lib/ringBuffer";

describe("RingBuffer", () => {
  /* ── TC-1: construction ────────────────────────── */
  test("TC-1: initialises with correct capacity and zero size", () => {
    const rb = new RingBuffer<number>(5);
    expect(rb.capacity).toBe(5);
    expect(rb.size).toBe(0);
    expect(rb.isFull).toBe(false);
  });

  /* ── TC-2: push and size ───────────────────────── */
  test("TC-2: push increments size up to capacity", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(10);
    expect(rb.size).toBe(1);
    rb.push(20);
    rb.push(30);
    expect(rb.size).toBe(3);
    expect(rb.isFull).toBe(true);
  });

  /* ── TC-3: overflow wraps around ───────────────── */
  test("TC-3: push beyond capacity overwrites oldest (circular)", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    rb.push(4); // overwrites 1
    expect(rb.size).toBe(3);
    expect(rb.toArray()).toEqual([2, 3, 4]);
  });

  /* ── TC-4: at() index access ───────────────────── */
  test("TC-4: at() returns correct element by logical index", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(10);
    rb.push(20);
    rb.push(30);
    expect(rb.at(0)).toBe(10); // oldest
    expect(rb.at(1)).toBe(20);
    expect(rb.at(2)).toBe(30); // newest
  });

  /* ── TC-5: at() out-of-bounds ──────────────────── */
  test("TC-5: at() returns undefined for out-of-bounds index", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    expect(rb.at(-1)).toBeUndefined();
    expect(rb.at(5)).toBeUndefined();
  });

  /* ── TC-6: last() ─────────────────────────────── */
  test("TC-6: last() returns the most recently pushed value", () => {
    const rb = new RingBuffer<number>(5);
    expect(rb.last()).toBeUndefined();
    rb.push(42);
    expect(rb.last()).toBe(42);
    rb.push(99);
    expect(rb.last()).toBe(99);
  });

  /* ── TC-7: toArray() ──────────────────────────── */
  test("TC-7: toArray() returns oldest→newest order after wrap", () => {
    const rb = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((v) => rb.push(v));
    expect(rb.toArray()).toEqual([3, 4, 5]);
  });

  /* ── TC-8: sum() ──────────────────────────────── */
  test("TC-8: sum() returns correct total for numeric buffer", () => {
    const rb = new RingBuffer<number>(4);
    [10, 20, 30, 40].forEach((v) => rb.push(v));
    expect(rb.sum()).toBe(100);
    rb.push(50); // overwrites 10
    expect(rb.sum()).toBe(140); // 20+30+40+50
  });

  /* ── TC-9: clear() ────────────────────────────── */
  test("TC-9: clear() resets size to zero", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    rb.clear();
    expect(rb.size).toBe(0);
    expect(rb.isFull).toBe(false);
    expect(rb.last()).toBeUndefined();
  });

  /* ── TC-10: generic type support ──────────────── */
  test("TC-10: works with string type", () => {
    const rb = new RingBuffer<string>(2);
    rb.push("hello");
    rb.push("world");
    expect(rb.toArray()).toEqual(["hello", "world"]);
    rb.push("!");
    expect(rb.toArray()).toEqual(["world", "!"]);
  });
});
