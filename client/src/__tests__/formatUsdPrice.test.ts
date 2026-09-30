import { describe, it, expect } from "vitest";
import { formatUsdPrice } from "../utils/formatUsdPrice";

describe("formatUsdPrice", () => {
  it("keeps sub-cent precision", () => {
    expect(formatUsdPrice(0.00000712)).toBe("$0.00000712");
    expect(formatUsdPrice(0.0000071234)).not.toBe("$0.00");
  });
  it("handles normal and invalid values", () => {
    expect(formatUsdPrice(67000.5)).toBe("$67,000.50");
    expect(formatUsdPrice(NaN)).toBe("—");
    expect(formatUsdPrice(undefined)).toBe("—");
  });
});
