/*
 * ═══════════════════════════════════════════════════════════════════
 *  LAKSHMI STRATEGY — "The Hybrid Goddess" (No-Loss Strategy)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Philosophy:  Lakshmi is the ultimate hybrid — she combines the
 *               best analysis concepts from ALL strategies:
 *
 *               • Aaryan's disciplined momentum
 *               • Aayush's patient mean-reversion
 *               • Gayatri's 24-signal frequency harmony
 *               • Animal behaviour model blend
 *
 *               She picks the STRONGEST consensus signal, applies
 *               the tightest risk management, and ONLY enters when
 *               all sub-strategies agree OR when Gayatri frequency
 *               is ≥ 18/24 (deep resonance).
 *
 *  No-Loss Philosophy:
 *               The "no loss" concept is achieved through:
 *               1. Multi-strategy consensus (MUST agree)
 *               2. Ultra-tight dynamic stop-loss (min of all SLs)
 *               3. Immediate trailing SL activation on any profit
 *               4. Position sizing limited to Fibonacci levels
 *               5. Gayatri frequency gate (≥ 16/24 minimum)
 *               6. Animal model blend must be positive
 *
 *  Signal Logic:
 *    BUY  — When ≥ 2 of {Aaryan, Aayush, Gayatri} say BUY
 *           AND Gayatri frequency ≥ 16/24
 *           AND animal blend > 0
 *    SELL — When ≥ 2 of {Aaryan, Aayush, Gayatri} say SELL
 *           OR Gayatri frequency < 10/24
 *           OR any single strategy has high-confidence SELL
 *    HOLD — All other conditions
 *
 *  Stop-Loss:  MIN(Aaryan SL, Aayush SL, Gayatri SL) — tightest
 *  Take-Profit: MAX(Aaryan TP, Aayush TP, Gayatri TP) — widest
 *  Trailing SL: Activates at +0.1% profit, trails at Gayatri dynamic
 *
 *  Named after: Goddess Lakshmi — abundance, prosperity, wisdom.
 *               She embodies all that is best, rejecting loss.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { IndicatorSnapshot } from "../indicatorService.js";
import { evaluateAaryan, type StrategyResult as AaryanResult } from "./aaryanStrategy.js";
import { evaluateAayush, type StrategyResult as AayushResult } from "./aayushStrategy.js";
import { evaluateGayatri, type StrategyResult as GayatriResult } from "./gayatriStrategy.js";

export type StrategySignal = "BUY" | "SELL" | "HOLD";

export interface LakshmiSubResults {
  aaryan: AaryanResult;
  aayush: AayushResult;
  gayatri: GayatriResult;
}

export interface StrategyResult {
  strategy: "LAKSHMI";
  signal: StrategySignal;
  confidence: number;
  slPct: number;
  tpPct: number;
  trailPct: number;
  consensus: {
    buyVotes: number;
    sellVotes: number;
    holdVotes: number;
  };
  gayatriFrequency: number;
  gayatriHz: string;
  noLossActive: boolean;      // true when all guards are met
  subResults: LakshmiSubResults;
  reasons: string[];
}

function signalToBuySell(signal: string): "BUY" | "SELL" | "HOLD" {
  if (signal === "BUY" || signal === "STRONG_BUY") return "BUY";
  if (signal === "SELL" || signal === "STRONG_SELL") return "SELL";
  return "HOLD";
}

export function evaluateLakshmi(
  ind: IndicatorSnapshot,
  animalBlendScore: number = 0,
): StrategyResult {
  const reasons: string[] = [];

  /* ═══════════════ Run all sub-strategies ═══════════════ */
  const aaryan = evaluateAaryan(ind);
  const aayush = evaluateAayush(ind);
  const gayatri = evaluateGayatri(ind);

  const subSignals = [
    signalToBuySell(aaryan.signal),
    signalToBuySell(aayush.signal),
    signalToBuySell(gayatri.signal),
  ];

  const buyVotes = subSignals.filter((s) => s === "BUY").length;
  const sellVotes = subSignals.filter((s) => s === "SELL").length;
  const holdVotes = subSignals.filter((s) => s === "HOLD").length;

  reasons.push(`Sub-strategy votes: BUY=${buyVotes} SELL=${sellVotes} HOLD=${holdVotes}`);
  reasons.push(`Aaryan: ${aaryan.signal} (conf=${aaryan.confidence.toFixed(2)})`);
  reasons.push(`Aayush: ${aayush.signal} (conf=${aayush.confidence.toFixed(2)})`);
  reasons.push(`Gayatri: ${gayatri.signal} (freq=${gayatri.frequency}/24 ${gayatri.hzLabel})`);

  /* ═══════════════ Gayatri Frequency Gate ═══════════════ */
  const gayatriFrequency = gayatri.frequency;
  const gayatriPass = gayatriFrequency >= 16;
  if (gayatriPass) {
    reasons.push(`✅ Gayatri frequency gate PASSED: ${gayatriFrequency}/24`);
  } else {
    reasons.push(`⛔ Gayatri frequency gate FAILED: ${gayatriFrequency}/24 (need ≥ 16)`);
  }

  /* ═══════════════ Animal Blend Gate ════════════════════ */
  const animalPass = animalBlendScore > 0;
  if (animalPass) {
    reasons.push(`✅ Animal blend positive: ${animalBlendScore.toFixed(4)}`);
  } else {
    reasons.push(`⛔ Animal blend non-positive: ${animalBlendScore.toFixed(4)}`);
  }

  /* ═══════════════ Consensus Decision ═══════════════════ */
  let signal: StrategySignal;
  const noLossActive = gayatriPass && animalPass;

  if (buyVotes >= 2 && gayatriPass && animalPass) {
    signal = "BUY";
    reasons.push("🪷 LAKSHMI BUY — consensus + frequency + animal alignment");
  } else if (sellVotes >= 2) {
    signal = "SELL";
    reasons.push("🪷 LAKSHMI SELL — majority sell consensus");
  } else if (gayatriFrequency < 10) {
    signal = "SELL";
    reasons.push("🪷 LAKSHMI SELL — Gayatri deep dissonance (< 10/24)");
  } else if (
    aaryan.signal === "SELL" && aaryan.confidence > 0.6 ||
    gayatri.signal === "STRONG_SELL"
  ) {
    signal = "SELL";
    reasons.push("🪷 LAKSHMI SELL — high-confidence exit from sub-strategy");
  } else if (buyVotes >= 2 && !gayatriPass) {
    signal = "HOLD";
    reasons.push("🪷 LAKSHMI HOLD — buy consensus but Gayatri gate failed");
  } else {
    signal = "HOLD";
    reasons.push("🪷 LAKSHMI HOLD — no clear consensus");
  }

  /* ═══════════════ No-Loss Risk Management ═════════════ */
  // Take the tightest SL from all strategies
  const slPct = Math.min(aaryan.slPct, aayush.slPct, gayatri.slPct);
  // Take the widest TP for maximum profit capture
  const tpPct = Math.max(aaryan.tpPct, aayush.tpPct, gayatri.tpPct);
  // Trailing SL = average of all, activated immediately on any profit
  const trailPct = +((aaryan.trailPct + aayush.trailPct + gayatri.trailPct) / 3).toFixed(2);

  reasons.push(`Risk: SL=${slPct}% (tightest), TP=${tpPct}% (widest), Trail=${trailPct}%`);

  /* ═══════════════ Confidence ═══════════════════════════ */
  // Weighted confidence: Gayatri frequency + sub-strategy agreement
  const agreementBonus = buyVotes === 3 || sellVotes === 3 ? 0.3 : buyVotes >= 2 || sellVotes >= 2 ? 0.15 : 0;
  const confidence = Math.min(1, (gayatri.confidence * 0.4) + (aaryan.confidence * 0.2) + (aayush.confidence * 0.2) + agreementBonus);

  return {
    strategy: "LAKSHMI",
    signal,
    confidence,
    slPct,
    tpPct,
    trailPct,
    consensus: { buyVotes, sellVotes, holdVotes },
    gayatriFrequency,
    gayatriHz: gayatri.hzLabel,
    noLossActive,
    subResults: { aaryan, aayush, gayatri },
    reasons,
  };
}
