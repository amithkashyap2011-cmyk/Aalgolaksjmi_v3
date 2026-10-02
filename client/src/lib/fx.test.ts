import { describe, it, expect } from "vitest";
import { resolveFxRate } from "./fx";

describe("resolveFxRate", () => {
  it("prefers the live rate", () => expect(resolveFxRate(88.1, 90)).toBe(88.1));
  it("falls back to last live rate", () => expect(resolveFxRate(undefined, 90)).toBe(90));
  it("returns null, not a made-up constant, when nothing is known", () => {
    expect(resolveFxRate(undefined)).toBeNull();
    expect(resolveFxRate(0, null)).toBeNull();
    expect(resolveFxRate(NaN, undefined)).toBeNull();
  });
});
