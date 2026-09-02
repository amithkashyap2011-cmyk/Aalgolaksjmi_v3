/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives Market Cost & Taxation Model
 * ═══════════════════════════════════════════════════════════════════
 *  Calculates realistic regulatory fees for NSE Derivatives (F&O):
 *   - Brokerage (configurable flat ₹20/order or % per lot)
 *   - STT (Securities Transaction Tax: 0.02% on sell futures, 0.1% on sell option premium / 0.125% exercised)
 *   - Exchange Transaction Charges (NSE F&O: 0.0019% futures, 0.05% options premium)
 *   - SEBI Turnover Charges (₹10 per crore = 0.0001%)
 *   - Stamp Duty (0.002% on futures buy, 0.003% on options buy)
 *   - GST (18% on Brokerage + Exchange charges + SEBI charges)
 */

import { InstrumentType, OrderAction } from "./strategyTypes.js";

export interface TradeCostParams {
  instrumentType: InstrumentType;
  action: OrderAction; // BUY | SELL
  price: number;
  quantity: number;
  strikePrice?: number;
}

export interface TradeCostBreakdown {
  turnover: number;
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebi: number;
  stampDuty: number;
  gst: number;
  totalCharges: number;
  netAmount: number;
}

export class IndianCostModel {
  // Configurable flat brokerage per executed order
  private static FLAT_BROKERAGE_PER_ORDER = 20.0; // ₹20 flat rate

  /**
   * Calculates comprehensive Indian regulatory charges for a single order leg
   */
  public static calculateOrderCost(params: TradeCostParams): TradeCostBreakdown {
    const { instrumentType, action, price, quantity } = params;
    const isBuy = action === "BUY";
    const turnover = price * quantity;

    // 1. Brokerage
    const brokerage = this.FLAT_BROKERAGE_PER_ORDER;

    // 2. STT (Securities Transaction Tax)
    // - Futures: 0.02% on Sell side only
    // - Options: 0.10% (0.0010) on Sell side of premium
    let stt = 0;
    if (!isBuy) {
      if (instrumentType === "FUTURE") {
        stt = turnover * 0.0002; // 0.02%
      } else if (instrumentType === "CE" || instrumentType === "PE") {
        stt = turnover * 0.001; // 0.1% on option premium sell
      }
    }

    // 3. Exchange Transaction Charges
    // - NSE Futures: 0.0019% of turnover
    // - NSE Options: 0.05% of premium turnover
    let exchangeTxn = 0;
    if (instrumentType === "FUTURE") {
      exchangeTxn = turnover * 0.000019;
    } else if (instrumentType === "CE" || instrumentType === "PE") {
      exchangeTxn = turnover * 0.0005;
    } else {
      exchangeTxn = turnover * 0.0000345; // Cash Equity
    }

    // 4. SEBI Turnover Charges: ₹10 per crore = 0.0001%
    const sebi = turnover * 0.000001;

    // 5. Stamp Duty (Buy side only in India)
    // - Futures: 0.002% on Buy
    // - Options: 0.003% on Buy
    let stampDuty = 0;
    if (isBuy) {
      if (instrumentType === "FUTURE") {
        stampDuty = turnover * 0.00002;
      } else if (instrumentType === "CE" || instrumentType === "PE") {
        stampDuty = turnover * 0.00003;
      } else {
        stampDuty = turnover * 0.00015;
      }
    }

    // 6. GST (18% on Brokerage + Exchange Txn + SEBI)
    const gstApplicableBase = brokerage + exchangeTxn + sebi;
    const gst = gstApplicableBase * 0.18;

    const totalCharges = Number(
      (brokerage + stt + exchangeTxn + sebi + stampDuty + gst).toFixed(2)
    );

    const netAmount = isBuy
      ? Number((turnover + totalCharges).toFixed(2))
      : Number((turnover - totalCharges).toFixed(2));

    return {
      turnover: Number(turnover.toFixed(2)),
      brokerage: Number(brokerage.toFixed(2)),
      stt: Number(stt.toFixed(2)),
      exchangeTxn: Number(exchangeTxn.toFixed(2)),
      sebi: Number(sebi.toFixed(2)),
      stampDuty: Number(stampDuty.toFixed(2)),
      gst: Number(gst.toFixed(2)),
      totalCharges,
      netAmount,
    };
  }

  /**
   * Calculates round-trip cost (entry + exit)
   */
  public static calculateRoundTripCost(
    instrumentType: InstrumentType,
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    isLong: boolean = true
  ): {
    entryCost: TradeCostBreakdown;
    exitCost: TradeCostBreakdown;
    totalRoundTripCost: number;
    grossPnl: number;
    netPnl: number;
  } {
    const entryAction: OrderAction = isLong ? "BUY" : "SELL";
    const exitAction: OrderAction = isLong ? "SELL" : "BUY";

    const entryCost = this.calculateOrderCost({
      instrumentType,
      action: entryAction,
      price: entryPrice,
      quantity,
    });

    const exitCost = this.calculateOrderCost({
      instrumentType,
      action: exitAction,
      price: exitPrice,
      quantity,
    });

    const totalRoundTripCost = Number(
      (entryCost.totalCharges + exitCost.totalCharges).toFixed(2)
    );

    const priceDiff = isLong ? exitPrice - entryPrice : entryPrice - exitPrice;
    const grossPnl = Number((priceDiff * quantity).toFixed(2));
    const netPnl = Number((grossPnl - totalRoundTripCost).toFixed(2));

    return {
      entryCost,
      exitCost,
      totalRoundTripCost,
      grossPnl,
      netPnl,
    };
  }
}
