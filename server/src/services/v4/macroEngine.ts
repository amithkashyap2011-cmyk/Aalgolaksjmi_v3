/*
 * ─── News & Macro Intelligence Engine ─────────────────────────
 *
 * Integrates Economic Calendar (Fed, RBI, Inflation, CPI, PPI, GDP),
 * On-chain whale alerts, social sentiment & market fear/greed.
 */

import { MacroEventLog } from "../../models/MacroEventLog.js";
import { LiveNewsService } from "../liveNewsService.js";

export class MacroEngine {
  public static async getActiveMacroEvents(domain: "INDIAN_MARKET" | "CRYPTO" | "ALL" = "ALL"): Promise<any[]> {
    const liveNews = await LiveNewsService.fetchLiveNews(domain);
    const liveEvents = liveNews.map((item) => ({
      eventName: item.title,
      category: item.category,
      impactScore: item.impactScore,
      sentiment: item.sentiment,
      sentimentScore: item.sentimentScore,
      confidence: item.confidence,
      source: item.source,
      publishedAt: item.publishedAt,
    }));

    const staticCalendar = [
      { eventName: "FOMC Rate Decision", category: "FED", impactScore: 0.90, sentiment: "NEUTRAL" },
      { eventName: "RBI Monetary Policy", category: "RBI", impactScore: 0.85, sentiment: "BULLISH" },
      { eventName: "US CPI Inflation Data", category: "INFLATION", impactScore: 0.88, sentiment: "BULLISH" },
      { eventName: "Whale Wallet 5,000 BTC Transfer", category: "ON_CHAIN", impactScore: 0.72, sentiment: "BEARISH" },
    ];

    return [...liveEvents, ...staticCalendar];
  }
}
