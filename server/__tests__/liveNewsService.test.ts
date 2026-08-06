import { describe, test, expect } from "@jest/globals";
import { LiveNewsService } from "../src/services/liveNewsService.js";
import { MacroEngine } from "../src/services/v4/macroEngine.js";

describe("Live News & Financial NLP Sentiment Service", () => {
  test("analyzeSentiment correctly classifies BULLISH news headlines", () => {
    const text = "NIFTY 50 and Bank NIFTY Surge as RBI Signals Rate Cut Outlook and Strong Profit Growth";
    const result = LiveNewsService.analyzeSentiment(text);

    expect(result.sentiment).toBe("BULLISH");
    expect(result.sentimentScore).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(50);
  });

  test("analyzeSentiment correctly classifies BEARISH news headlines", () => {
    const text = "Market Plunge as Inflation Spike Triggers Sell-Off and Rate Hike Warning";
    const result = LiveNewsService.analyzeSentiment(text);

    expect(result.sentiment).toBe("BEARISH");
    expect(result.sentimentScore).toBeLessThan(0);
    expect(result.confidence).toBeGreaterThan(50);
  });

  test("fetchLiveNews returns structured news items and filters by domain", async () => {
    const indianNews = await LiveNewsService.fetchLiveNews("INDIAN_MARKET");
    expect(Array.isArray(indianNews)).toBe(true);
    expect(indianNews.length).toBeGreaterThan(0);

    const first = indianNews[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("sentiment");
    expect(first).toHaveProperty("sentimentScore");

    const cryptoNews = await LiveNewsService.fetchLiveNews("CRYPTO");
    expect(Array.isArray(cryptoNews)).toBe(true);
  });

  test("getMarketSentimentSummary calculates market impact and counts", async () => {
    const summary = await LiveNewsService.getMarketSentimentSummary("INDIAN_MARKET");
    expect(summary.domain).toBe("INDIAN_MARKET");
    expect(typeof summary.sentimentScore).toBe("number");
    expect(summary.totalHeadlines).toBeGreaterThan(0);
    expect(Array.isArray(summary.topHeadlines)).toBe(true);
  });

  test("MacroEngine integrates live news sentiment with macro event calendar", async () => {
    const events = await MacroEngine.getActiveMacroEvents("INDIAN_MARKET");
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);

    const hasLiveNews = events.some((e) => e.publishedAt !== undefined);
    expect(hasLiveNews).toBe(true);
  });
});
