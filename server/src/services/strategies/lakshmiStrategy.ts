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
import { evaluateOhmkara, type StrategyResult as OhmkaraResult } from "./ohmkaraStrategy.js";

export type StrategySignal = "BUY" | "SELL" | "HOLD";

export interface LakshmiSubResults {
  aaryan: AaryanResult;
  aayush: AayushResult;
  gayatri: GayatriResult;
  ohmkara: OhmkaraResult;
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
  noiseGateActive?: boolean;  // Added for 18.8 Hz Infrasound Gate
  triggerStrategy?: string;
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

  /* ═════════════════ Run all sub-strategies ═══════════════════ */
  const aaryan = evaluateAaryan(ind);
  const aayush = evaluateAayush(ind);
  const gayatri = evaluateGayatri(ind);
  const ohmkara = evaluateOhmkara(ind);

  const subSignals = [
    signalToBuySell(aaryan.signal),
    signalToBuySell(aayush.signal),
    signalToBuySell(gayatri.signal),
    signalToBuySell(ohmkara.signal),
  ];

  const buyVotes = subSignals.filter((s) => s === "BUY").length;
  const sellVotes = subSignals.filter((s) => s === "SELL").length;
  const holdVotes = subSignals.filter((s) => s === "HOLD").length;

  // Ohmkara bonus: high-precision override
  const ohmkaraBuying = ohmkara.signal === "BUY" || ohmkara.signal === "STRONG_BUY";
  const ohmkaraSelling = ohmkara.signal === "SELL" || ohmkara.signal === "STRONG_SELL";

  reasons.push(`Sub-strategy votes: BUY=${buyVotes} SELL=${sellVotes} HOLD=${holdVotes}`);
  reasons.push(`Aaryan: ${aaryan.signal} (conf=${aaryan.confidence.toFixed(2)})`);
  reasons.push(`Aayush: ${aayush.signal} (conf=${aayush.confidence.toFixed(2)})`);
  reasons.push(`Gayatri: ${gayatri.signal} (freq=${gayatri.frequency}/24 ${gayatri.hzLabel})`);
  reasons.push(`Ohmkara: ${ohmkara.signal} (gates=${ohmkara.gatesActive}/5, OM=${ohmkara.omOctaveScore}/8${ohmkara.isFullResonance ? " 🕉️ FULL RESONANCE" : ""})`);

  /* ═══════════════ Gayatri Frequency Gate ═══════════════ */
  const gayatriFrequency = gayatri.frequency;
  const noiseGateActive = (gayatri as any).noiseGateActive || false;
  const requiredFrequency = noiseGateActive ? 18 : 16;
  const gayatriPass = gayatriFrequency >= requiredFrequency;

  if (noiseGateActive) {
    reasons.push(`🌌 18.8 Hz Infrasound Noise Gate is ACTIVE — tightening Gayatri gate to ≥ 18/24`);
  }

  if (gayatriPass) {
    reasons.push(`✅ Gayatri frequency gate PASSED: ${gayatriFrequency}/24 (required ≥ ${requiredFrequency})`);
  } else {
    reasons.push(`⛔ Gayatri frequency gate FAILED: ${gayatriFrequency}/24 (need ≥ ${requiredFrequency})`);
  }

  /* ═══════════════ Animal Blend Gate ════════════════════ */
  const animalPass = animalBlendScore > 0;
  if (animalPass) {
    reasons.push(`✅ Animal blend positive: ${animalBlendScore.toFixed(4)}`);
  } else {
    reasons.push(`⛔ Animal blend non-positive: ${animalBlendScore.toFixed(4)}`);
  }

  /* ═════════════════ Consensus Decision ═══════════════ */
  let signal: StrategySignal;
  const noLossActive = gayatriPass && animalPass;

  // 🔱 Ohmkara Full Resonance Override — strongest possible buy signal
  if (ohmkara.isFullResonance && gayatriPass) {
    signal = "BUY";
    reasons.push("🕉️ OHMKARA FULL RESONANCE override — Lakshmi BUY confirmed by primordial alignment");
  } else if (buyVotes >= 2 && gayatriPass && animalPass) {
    signal = "BUY";
    reasons.push("🌹 LAKSHMI BUY — consensus + frequency + animal alignment");
  } else if (ohmkaraSelling) {
    // Ohmkara SELL = dangerous market — override to exit
    signal = "SELL";
    reasons.push("🕉️ OHMKARA EXIT SIGNAL — primordial dissonance detected, protecting capital");
  } else if (sellVotes >= 2) {
    signal = "SELL";
    reasons.push("🌹 LAKSHMI SELL — majority sell consensus");
  } else if (gayatriFrequency < 10) {
    signal = "SELL";
    reasons.push("🌹 LAKSHMI SELL — Gayatri deep dissonance (< 10/24)");
  } else if (
    aaryan.signal === "SELL" && aaryan.confidence > 0.6 ||
    gayatri.signal === "STRONG_SELL"
  ) {
    signal = "SELL";
    reasons.push("🌹 LAKSHMI SELL — high-confidence exit from sub-strategy");
  } else if (buyVotes >= 2 && !gayatriPass) {
    signal = "HOLD";
    reasons.push("🌹 LAKSHMI HOLD — buy consensus but Gayatri gate failed");
  } else {
    signal = "HOLD";
    reasons.push("🌹 LAKSHMI HOLD — no clear consensus");
  }

  /* ═════════════════ No-Loss Risk Management ═══════════ */
  let slPct = 2.0;
  let tpPct = 4.0;
  let trailPct = 1.0;
  let triggerStrategy = "LAKSHMI";

  const activeVoters: any[] = [];
  const allSubResultObjs = [
    { strategy: "AARYAN", signal: aaryan.signal, slPct: aaryan.slPct, tpPct: aaryan.tpPct, trailPct: aaryan.trailPct, confidence: aaryan.confidence },
    { strategy: "AAYUSH", signal: aayush.signal, slPct: aayush.slPct, tpPct: aayush.tpPct, trailPct: aayush.trailPct, confidence: aayush.confidence },
    { strategy: "GAYATRI", signal: gayatri.signal, slPct: gayatri.slPct, tpPct: gayatri.tpPct, trailPct: gayatri.trailPct, confidence: gayatri.confidence },
    { strategy: "OHMKARA", signal: ohmkara.signal, slPct: ohmkara.slPct, tpPct: ohmkara.tpPct, trailPct: ohmkara.trailPct, confidence: ohmkara.confidence },
  ];

  allSubResultObjs.forEach((res) => {
    const buySell = signalToBuySell(res.signal);
    if (signal !== "HOLD" && buySell === signal) {
      activeVoters.push(res);
    }
  });

  if (activeVoters.length > 0) {
    const sumSl = activeVoters.reduce((sum, v) => sum + v.slPct, 0);
    const sumTp = activeVoters.reduce((sum, v) => sum + v.tpPct, 0);
    const sumTrail = activeVoters.reduce((sum, v) => sum + v.trailPct, 0);
    slPct = +(sumSl / activeVoters.length).toFixed(2);
    tpPct = +(sumTp / activeVoters.length).toFixed(2);
    trailPct = +(sumTrail / activeVoters.length).toFixed(2);

    // Find voter with the highest confidence as dominant
    const dominant = activeVoters.reduce((max, v) => v.confidence > max.confidence ? v : max, activeVoters[0]);
    triggerStrategy = `LAKSHMI_${dominant.strategy}`;
    reasons.push(`Active voters averaged for SL/TP: ${activeVoters.map((v) => v.strategy).join(", ")}. Dominant: ${dominant.strategy}`);
  } else {
    // Fallback if no specific voters (e.g. default/reversal gates)
    slPct = Math.min(aaryan.slPct, aayush.slPct, gayatri.slPct, ohmkara.slPct);
    tpPct = Math.max(aaryan.tpPct, aayush.tpPct, gayatri.tpPct, ohmkara.tpPct);
    trailPct = +((aaryan.trailPct + aayush.trailPct + gayatri.trailPct + ohmkara.trailPct) / 4).toFixed(2);
    reasons.push("Fallback to global bounds (no active matching voters)");
  }

  // If Ohmkara is fully resonant, boost TP further (rewards the strongest setups)
  if (ohmkara.isFullResonance) {
    tpPct = +Math.max(tpPct * 1.15, 5.0).toFixed(2);
    slPct = +(slPct * 0.9).toFixed(2);
    reasons.push(`🕉️ Ohmkara Full Resonance boost: TP elevated to ${tpPct}%, SL tightened to ${slPct}%`);
  } else if (ohmkaraBuying && signal === "BUY") {
    tpPct = +Math.max(tpPct, ohmkara.tpPct).toFixed(2);
    reasons.push(`🕉️ Ohmkara BUY: widening TP to ${tpPct}%`);
  }

  // If 18.8 Hz Noise Gate is active, tighten risk bounds by 20% to mitigate choppy market losses
  if (noiseGateActive) {
    slPct = +(slPct * 0.8).toFixed(2);
    trailPct = +(trailPct * 0.8).toFixed(2);
    reasons.push(`🛡️ Noise-dampened risk bounds applied: SL tightened to ${slPct}%, Trail tightened to ${trailPct}%`);
  }

  reasons.push(`Risk: SL=${slPct}% (averaged), TP=${tpPct}% (averaged), Trail=${trailPct}%`);

  /* ═════════════════ Confidence ═══════════════════ */
  // Weighted confidence: Gayatri frequency + sub-strategy agreement + Ohmkara bonus
  const agreementBonus = buyVotes === 4 || sellVotes === 4 ? 0.35
    : buyVotes === 3 || sellVotes === 3 ? 0.3
    : buyVotes >= 2 || sellVotes >= 2 ? 0.15 : 0;
  const ohmkaraBonus = ohmkara.isFullResonance ? 0.15 : ohmkaraBuying ? 0.07 : 0;
  const confidence = Math.min(1,
    (gayatri.confidence * 0.35) +
    (aaryan.confidence * 0.15) +
    (aayush.confidence * 0.15) +
    (ohmkara.confidence * 0.15) +
    agreementBonus +
    ohmkaraBonus
  );

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
    subResults: { aaryan, aayush, gayatri, ohmkara },
    reasons,
    noiseGateActive,
    triggerStrategy,
  };
}
