/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Independent Cleanroom Financial Accounting Reference Oracle
 * ═══════════════════════════════════════════════════════════════════
 *  STRICT PURITY INVARIANT:
 *  This reference implementation is completely isolated from production code.
 *  DO NOT import AuthoritativeLedger, IndianCostModel, or any application logic.
 *  Formulated from foundational financial and exchange mathematics.
 */

export interface OracleTradeInput {
  tradeId: string;
  side: "BUY" | "SELL";
  instrumentType: "EQUITY" | "FUTURES" | "OPTION_CE" | "OPTION_PE";
  quantity: number;
  remainingQty: number;
  entryPrice: number;
  exitPrice?: number | null;
  currentLtp: number;
  contractMultiplier?: number;
  leverage?: number;
  status: "OPEN" | "CLOSED" | "PARTIALLY_FILLED";
}

export interface OracleAccountInput {
  startingEquity: number;
  deposits: number;
  withdrawals: number;
  adjustments: number;
  trades: OracleTradeInput[];
}

export interface OracleFinancialResult {
  realizedGrossPnl: number;
  unrealizedGrossPnl: number;
  totalGrossPnl: number;
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  gst: number;
  sebiCharges: number;
  stampDuty: number;
  totalCharges: number;
  realizedNetPnl: number;
  netPnl: number;
  marginUsed: number;
  investedValue: number;
  accountEquity: number;
}

export class IndependentAccountingOracle {
  /**
   * Round to 2 decimal places with strict financial epsilon tolerance.
   */
  public static round2(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  /**
   * Pure first-principles Gross P&L calculation.
   */
  public static calculateGrossPnl(
    side: "BUY" | "SELL",
    entryPrice: number,
    currentOrExitPrice: number,
    qty: number,
    multiplier = 1
  ): number {
    if (qty <= 0) return 0;
    const priceDiff = side === "BUY" ? currentOrExitPrice - entryPrice : entryPrice - currentOrExitPrice;
    return this.round2(priceDiff * qty * multiplier);
  }

  /**
   * Pure Indian NSE/BSE Statutory & Regulatory Cost Formulation.
   */
  public static calculateCharges(
    type: "EQUITY" | "FUTURES" | "OPTION_CE" | "OPTION_PE",
    action: "BUY" | "SELL",
    price: number,
    quantity: number,
    multiplier = 1
  ): {
    brokerage: number;
    stt: number;
    exchangeCharges: number;
    gst: number;
    sebiCharges: number;
    stampDuty: number;
    totalCharges: number;
  } {
    const turnover = this.round2(price * quantity * multiplier);

    // 1. Brokerage: Flat ₹20 per executed order (or 0.03% capped at 20)
    const brokerage = Math.min(20, Math.max(0.01, this.round2(turnover * 0.0003)));

    // 2. STT (Securities Transaction Tax)
    let stt = 0;
    if (type === "EQUITY") {
      // 0.1% on delivery or 0.025% on intraday sell
      if (action === "SELL") stt = this.round2(turnover * 0.00025);
    } else if (type === "FUTURES") {
      // 0.0125% on sell side
      if (action === "SELL") stt = this.round2(turnover * 0.000125);
    } else if (type === "OPTION_CE" || type === "OPTION_PE") {
      // 0.0625% on sell side premium turnover
      if (action === "SELL") stt = this.round2(turnover * 0.000625);
    }

    // 3. Exchange Transaction Charges
    let exchangeRate = 0.0000325; // NSE Cash default ~ 0.00325%
    if (type === "FUTURES") exchangeRate = 0.000019; // ~ 0.0019%
    if (type === "OPTION_CE" || type === "OPTION_PE") exchangeRate = 0.0005; // 0.05% on premium
    const exchangeCharges = this.round2(turnover * exchangeRate);

    // 4. SEBI Turnover Charges: ₹10 per crore = 0.0001%
    const sebiCharges = this.round2(turnover * 0.000001);

    // 5. Stamp Duty: Charged only on BUY side
    let stampDuty = 0;
    if (action === "BUY") {
      const stampRate = type === "EQUITY" ? 0.00015 : type === "FUTURES" ? 0.00002 : 0.00003;
      stampDuty = this.round2(turnover * stampRate);
    }

    // 6. GST: 18% on (Brokerage + Exchange Charges + SEBI Charges)
    const taxableBase = this.round2(brokerage + exchangeCharges + sebiCharges);
    const gst = this.round2(taxableBase * 0.18);

    const totalCharges = this.round2(brokerage + stt + exchangeCharges + sebiCharges + stampDuty + gst);

    return {
      brokerage,
      stt,
      exchangeCharges,
      gst,
      sebiCharges,
      stampDuty,
      totalCharges,
    };
  }

  /**
   * Evaluates complete portfolio / account state from first principles.
   */
  public static evaluateAccount(input: OracleAccountInput): OracleFinancialResult {
    let realizedGrossPnl = 0;
    let unrealizedGrossPnl = 0;
    let totalBrokerage = 0;
    let totalStt = 0;
    let totalExchangeCharges = 0;
    let totalGst = 0;
    let totalSebiCharges = 0;
    let totalStampDuty = 0;
    let totalCharges = 0;
    let totalMarginUsed = 0;
    let totalInvestedValue = 0;

    for (const trade of input.trades) {
      const multiplier = trade.contractMultiplier || 1;
      const leverage = trade.leverage || 1;

      // Entry charges (always incurred)
      const entryCosts = this.calculateCharges(trade.instrumentType, trade.side, trade.entryPrice, trade.quantity, multiplier);
      totalBrokerage = this.round2(totalBrokerage + entryCosts.brokerage);
      totalStt = this.round2(totalStt + entryCosts.stt);
      totalExchangeCharges = this.round2(totalExchangeCharges + entryCosts.exchangeCharges);
      totalGst = this.round2(totalGst + entryCosts.gst);
      totalSebiCharges = this.round2(totalSebiCharges + entryCosts.sebiCharges);
      totalStampDuty = this.round2(totalStampDuty + entryCosts.stampDuty);
      totalCharges = this.round2(totalCharges + entryCosts.totalCharges);

      if (trade.status === "CLOSED" && trade.exitPrice) {
        // Position is completely closed
        const pnl = this.calculateGrossPnl(trade.side, trade.entryPrice, trade.exitPrice, trade.quantity, multiplier);
        realizedGrossPnl = this.round2(realizedGrossPnl + pnl);

        // Exit charges
        const exitAction = trade.side === "BUY" ? "SELL" : "BUY";
        const exitCosts = this.calculateCharges(trade.instrumentType, exitAction, trade.exitPrice, trade.quantity, multiplier);
        totalBrokerage = this.round2(totalBrokerage + exitCosts.brokerage);
        totalStt = this.round2(totalStt + exitCosts.stt);
        totalExchangeCharges = this.round2(totalExchangeCharges + exitCosts.exchangeCharges);
        totalGst = this.round2(totalGst + exitCosts.gst);
        totalSebiCharges = this.round2(totalSebiCharges + exitCosts.sebiCharges);
        totalStampDuty = this.round2(totalStampDuty + exitCosts.stampDuty);
        totalCharges = this.round2(totalCharges + exitCosts.totalCharges);
      } else {
        // Open or partially filled
        const openQty = trade.remainingQty;
        if (openQty > 0) {
          const uPnl = this.calculateGrossPnl(trade.side, trade.entryPrice, trade.currentLtp, openQty, multiplier);
          unrealizedGrossPnl = this.round2(unrealizedGrossPnl + uPnl);

          const invested = this.round2(trade.entryPrice * openQty * multiplier);
          const margin = this.round2(invested / leverage);
          totalInvestedValue = this.round2(totalInvestedValue + invested);
          totalMarginUsed = this.round2(totalMarginUsed + margin);
        }

        // Check if there was partial exit
        const filledExitQty = trade.quantity - openQty;
        if (filledExitQty > 0 && trade.exitPrice) {
          const partRealized = this.calculateGrossPnl(trade.side, trade.entryPrice, trade.exitPrice, filledExitQty, multiplier);
          realizedGrossPnl = this.round2(realizedGrossPnl + partRealized);

          const exitAction = trade.side === "BUY" ? "SELL" : "BUY";
          const exitCosts = this.calculateCharges(trade.instrumentType, exitAction, trade.exitPrice, filledExitQty, multiplier);
          totalBrokerage = this.round2(totalBrokerage + exitCosts.brokerage);
          totalStt = this.round2(totalStt + exitCosts.stt);
          totalExchangeCharges = this.round2(totalExchangeCharges + exitCosts.exchangeCharges);
          totalGst = this.round2(totalGst + exitCosts.gst);
          totalSebiCharges = this.round2(totalSebiCharges + exitCosts.sebiCharges);
          totalStampDuty = this.round2(totalStampDuty + exitCosts.stampDuty);
          totalCharges = this.round2(totalCharges + exitCosts.totalCharges);
        }
      }
    }

    const totalGrossPnl = this.round2(realizedGrossPnl + unrealizedGrossPnl);
    const realizedNetPnl = this.round2(realizedGrossPnl - totalCharges);
    const netPnl = this.round2(totalGrossPnl - totalCharges);

    // Canonical Equity Formulation:
    // Equity = StartingCapital + Deposits - Withdrawals + RealizedGrossPnl + UnrealizedGrossPnl - TotalCharges + Adjustments
    const accountEquity = this.round2(
      input.startingEquity +
      input.deposits -
      input.withdrawals +
      realizedGrossPnl +
      unrealizedGrossPnl -
      totalCharges +
      input.adjustments
    );

    return {
      realizedGrossPnl,
      unrealizedGrossPnl,
      totalGrossPnl,
      brokerage: totalBrokerage,
      stt: totalStt,
      exchangeCharges: totalExchangeCharges,
      gst: totalGst,
      sebiCharges: totalSebiCharges,
      stampDuty: totalStampDuty,
      totalCharges,
      realizedNetPnl,
      netPnl,
      marginUsed: totalMarginUsed,
      investedValue: totalInvestedValue,
      accountEquity,
    };
  }
}
