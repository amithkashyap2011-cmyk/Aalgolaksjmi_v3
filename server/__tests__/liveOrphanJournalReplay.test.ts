import { describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "orphan-")), "journal.jsonl");
let g: typeof import("../src/services/liveFillGuard.js");

describe("LIVE orphan entry blocks survive a restart (journal is the source of truth)", () => {
  beforeAll(async () => {
    // Pre-existing journal from a previous run: A orphaned, B orphaned then cleared, plus a torn line.
    fs.writeFileSync(tmp, [
      JSON.stringify({ userId: "u1", symbol: "BTCUSDT", side: "BUY", qty: 0.01, avgPrice: 60000, error: "db down" }),
      JSON.stringify({ userId: "u1", symbol: "ETHUSDT", side: "BUY", qty: 1, avgPrice: 3000, error: "db down" }),
      JSON.stringify({ userId: "u1", symbol: "ETHUSDT", cleared: true, by: "admin" }),
      '{"userId":"u1","symbol":"SOLUSDT","side":"BU', // torn write
    ].join("\n") + "\n");
    process.env.LIVE_ORPHAN_JOURNAL_PATH = tmp;
    g = await import("../src/services/liveFillGuard.js");
  });
  beforeEach(() => { g._resetLiveEntryBlocksForTest(); g.loadBlocksFromJournal(tmp); });

  it("restores blocks at boot: orphaned symbol blocked, cleared symbol free, torn line ignored", () => {
    expect(g.isLiveEntryBlocked("u1", "BTCUSDT")).toBe(true);
    expect(g.isLiveEntryBlocked("u1", "ETHUSDT")).toBe(false);
    expect(g.isLiveEntryBlocked("u1", "SOLUSDT")).toBe(false);
  });

  it("a new orphan fill is journaled, so it is still blocked after a simulated restart", async () => {
    await g.journalOrphanFill({ userId: "u2", symbol: "XRPUSDT", side: "BUY", qty: 5, avgPrice: 0.5 }, new Error("trade create failed"));
    expect(g.isLiveEntryBlocked("u2", "XRPUSDT")).toBe(true);
    g._resetLiveEntryBlocksForTest();          // process restart wipes memory...
    expect(g.isLiveEntryBlocked("u2", "XRPUSDT")).toBe(false);
    g.loadBlocksFromJournal(tmp);              // ...boot replays the journal
    expect(g.isLiveEntryBlocked("u2", "XRPUSDT")).toBe(true);
  });

  it("clearing a block is journaled and also survives a restart", () => {
    g.clearLiveEntryBlock("u1", "BTCUSDT", "test");
    expect(g.isLiveEntryBlocked("u1", "BTCUSDT")).toBe(false);
    g._resetLiveEntryBlocksForTest();
    g.loadBlocksFromJournal(tmp);
    expect(g.isLiveEntryBlocked("u1", "BTCUSDT")).toBe(false);
  });

  it("lists the active blocks", async () => {
    await g.journalOrphanFill({ userId: "u3", symbol: "ADAUSDT", side: "SELL", qty: 10, avgPrice: 0.4 }, new Error("x"));
    expect(g.listLiveEntryBlocks()).toEqual(expect.arrayContaining([{ userId: "u3", symbol: "ADAUSDT" }]));
  });
});
