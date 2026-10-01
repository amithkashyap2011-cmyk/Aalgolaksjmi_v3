import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { Trade } from "../src/models/Trade.js";
import { getPolicy } from "../src/services/aqea/tradeGovernor.js";

function chain(rows: any[]) {
  const c: any = {};
  c.sort = () => c; c.limit = () => c; c.select = () => c; c.lean = async () => rows;
  return c;
}

describe("trade governor policy is scoped to the book being traded", () => {
  let queries: any[];
  beforeEach(() => {
    queries = [];
    jest.spyOn(Trade, "find").mockImplementation(((q: any) => { queries.push(q); return chain([]); }) as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it("filters closed trades by mode and accountType", async () => {
    await getPolicy("scope-user-1", { mode: "PAPER", accountType: "SPOT" });
    expect(queries[0].mode).toBe("PAPER");
    expect(queries[0].accountType).toBe("SPOT");
  });

  it("does not share a cached policy between PAPER/LIVE or SPOT/FUTURES", async () => {
    await getPolicy("scope-user-2", { mode: "PAPER", accountType: "SPOT" });
    await getPolicy("scope-user-2", { mode: "PAPER", accountType: "FUTURES" });
    await getPolicy("scope-user-2", { mode: "LIVE", accountType: "SPOT" });
    expect(queries.length).toBe(3);
    await getPolicy("scope-user-2", { mode: "PAPER", accountType: "SPOT" }); // cached
    expect(queries.length).toBe(3);
  });

  it("stays unscoped (old behaviour) when no scope is given", async () => {
    await getPolicy("scope-user-3");
    expect(queries[0].mode).toBeUndefined();
    expect(queries[0].accountType).toBeUndefined();
  });
});
