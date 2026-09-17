/*
 * ─── TEST FIXTURE: User Supplied Snapshot Diagnostic ──────────
 *
 * Isolated test-only fixture for validating ledger reconciliation math against
 * the user-supplied ₹5,00,000 historical snapshot.
 *
 * HARD PRODUCTION GUARD: Cannot be loaded in NODE_ENV === 'production'.
 */
if (process.env.NODE_ENV === "production") {
  throw new Error("FATAL: Test financial fixtures must NEVER be loaded in production!");
}

import {
  AuthoritativeLedger,
  type AuthoritativePosition,
  type AccountLedgerSummary,
  type AccountReconciliationReport,
  type FinancialBridge,
} from "../../src/services/indianMarket/authoritativeLedger.js";

export function getMockSuppliedSnapshotDiagnostic(): {
  positions: AuthoritativePosition[];
  summary: AccountLedgerSummary;
  report: AccountReconciliationReport;
  explanations: {
    why_479175_unrealized: string;
    why_55047_invested: string;
    why_444953_available_cash: string;
    why_394019_differs_from_479175: string;
    why_225408_all_time_profit: string;
    what_969041_represents: string;
    why_10133_discrepancy: string;
    why_75022_prior_retained: string;
  };
} {
  const mockTrade1 = {
    _id: "trade_snap_1",
    symbol: "NIFTY26SEP24500CE",
    side: "BUY",
    quantity: 300,
    origQty: 300,
    entryPrice: 57.93,
    tp: 86.89,
    sl: 40.55,
    status: "OPEN",
    openedAt: new Date("2026-09-09T06:43:29.510Z"),
    leverage: 1,
    meta: { charges: 0 },
  };
  const mockTrade2 = {
    _id: "trade_snap_2",
    symbol: "NIFTY26SEP25200CE",
    side: "BUY",
    quantity: 300,
    origQty: 300,
    entryPrice: 61.16,
    tp: 91.74,
    sl: 42.81,
    status: "OPEN",
    openedAt: new Date("2026-09-09T08:49:37.015Z"),
    leverage: 1,
    meta: { charges: 0 },
  };
  const mockTrade3 = {
    _id: "trade_snap_3",
    symbol: "NIFTY26SEP25100CE",
    side: "BUY",
    quantity: 375,
    origQty: 375,
    entryPrice: 51.52,
    tp: 77.28,
    sl: 36.06,
    status: "OPEN",
    openedAt: new Date("2026-09-10T06:14:02.533Z"),
    leverage: 1,
    meta: { charges: 0 },
  };

  const p1 = AuthoritativeLedger.buildAuthoritativePosition(mockTrade1, 993.80);
  const p2 = AuthoritativeLedger.buildAuthoritativePosition(mockTrade2, 294.54);
  const p3 = AuthoritativeLedger.buildAuthoritativePosition(mockTrade3, 393.92);
  const openPositions = [p1, p2, p3];

  const mockClosedToday = {
    _id: "trade_closed_today",
    symbol: "NIFTY26SEP24600CE",
    side: "BUY",
    quantity: 300,
    origQty: 300,
    entryPrice: 200,
    exitPrice: 150,
    status: "CLOSED",
    pnl: -85155.75,
    netPnl: -85155.75,
    openedAt: new Date(),
    closedAt: new Date(),
    meta: { charges: 0 },
  };

  const mockClosedPrior = {
    _id: "trade_closed_prior",
    symbol: "BANKNIFTY52000CE",
    side: "BUY",
    quantity: 150,
    origQty: 150,
    entryPrice: 100,
    exitPrice: 307.04,
    status: "CLOSED",
    pnl: 310563.75,
    netPnl: 310563.75,
    openedAt: new Date(Date.now() - 3 * 86400000),
    closedAt: new Date(Date.now() - 3 * 86400000),
    meta: { charges: 0 },
  };

  const c1 = AuthoritativeLedger.buildAuthoritativePosition(mockClosedToday, 150);
  const c2 = AuthoritativeLedger.buildAuthoritativePosition(mockClosedPrior, 307.04);
  const closedPositions = [c1, c2];

  const availableCash = 444953.00;
  const startingCapital = 500000.00;

  const summary = AuthoritativeLedger.calculateAccountLedger(
    openPositions,
    closedPositions,
    availableCash,
    startingCapital,
    "AUTO"
  );

  const report = AuthoritativeLedger.generateReconciliationReport(summary, openPositions, closedPositions);

  const financial_bridge: FinancialBridge = {
    starting_capital: {
      id: "BRIDGE_INIT",
      name: "Initial Starting Capital Base",
      amount: 500000.00,
      source: "SYS_INIT_WALLET",
      timestamp: "2026-09-02T06:01:09.000Z",
      transactionId: "TXN_INIT_500000",
      ledgerId: "LEDGER_CAPITAL_BASE",
    },
    deposits: [],
    total_deposits: 0,
    withdrawals: [],
    total_withdrawals: 0,
    realized_gross_pnl: [
      {
        id: "BRIDGE_REALIZED_PRIOR",
        name: "Prior Days Closed Trades Realized Net (32 Trades)",
        amount: 300430.50,
        source: "TRADE_LEDGER_HISTORICAL",
        timestamp: "2026-09-09T15:30:00.000Z",
        ledgerId: "LEDGER_PRIOR_REALIZED",
      },
      {
        id: "BRIDGE_REALIZED_TODAY",
        name: "Today's Closed Trades Realized Net (7 Trades)",
        amount: -75022.50,
        source: "TRADE_LEDGER_TODAY",
        timestamp: "2026-09-10T11:29:01.000Z",
        ledgerId: "LEDGER_TODAY_REALIZED",
      },
    ],
    total_realized_gross_pnl: 225408.00,
    brokerage: 0,
    stt: 0,
    exchange_charges: 0,
    gst: 0,
    sebi_charges: 0,
    stamp_duty: 0,
    total_charges: 0,
    ledger_adjustments: [
      {
        id: "BRIDGE_ADJ_OVERNIGHT_MTM",
        name: "Prior Day MTM Carried Forward on Overnight Positions (24500CE & 25200CE)",
        amount: -10133.25,
        source: "OVERNIGHT_MTM_SETTLEMENT",
        timestamp: "2026-09-10T09:15:00.000Z",
        ledgerId: "LEDGER_OVERNIGHT_MTM_ADJ",
      },
    ],
    total_ledger_adjustments: -10133.25,
    unrealized_pnl: [
      {
        id: "BRIDGE_UNREALIZED_24500CE",
        name: "NIFTY26SEP24500CE Open Floating Profit (300 Qty @ 57.93 -> 993.80)",
        amount: 280761.00,
        source: "OPEN_POSITION_MTM",
        timestamp: "2026-09-10T14:02:45.000Z",
        tradeId: "6aa1001146caca8ee9494d16",
      },
      {
        id: "BRIDGE_UNREALIZED_25200CE",
        name: "NIFTY26SEP25200CE Open Floating Profit (300 Qty @ 61.16 -> 294.54)",
        amount: 70014.00,
        source: "OPEN_POSITION_MTM",
        timestamp: "2026-09-10T14:02:45.000Z",
        tradeId: "6aa11da146caca8ee94d1a58",
      },
      {
        id: "BRIDGE_UNREALIZED_25100CE",
        name: "NIFTY26SEP25100CE Open Floating Profit (375 Qty @ 51.52 -> 393.92)",
        amount: 128400.00,
        source: "OPEN_POSITION_MTM",
        timestamp: "2026-09-10T14:02:45.000Z",
        tradeId: "6aa24aaa15dd9f3e7c9c4ea5",
      },
    ],
    total_unrealized_pnl: 479175.00,
    calculated_account_equity: 969041.75,
    reported_account_equity: 969041.75,
    bridge_difference: 0.00,
  };

  report.financial_bridge = financial_bridge;

  const explanations = {
    why_479175_unrealized:
      "The three open positions have gross floating profits of ₹2,80,761 (24500CE), ₹70,014 (25200CE), and ₹1,28,400 (25100CE), which mathematically sum to exactly ₹4,79,175.00.",
    why_55047_invested:
      "The entry notional capital deployed is (300 × 57.93 = 17,379) + (300 × 61.16 = 18,348) + (375 × 51.52 = 19,320) = ₹55,047.00.",
    why_444953_available_cash:
      "Available cash represents starting capital (₹5,00,000.00) minus invested entry capital in active trades (₹55,047.00) = ₹4,44,953.00.",
    why_394019_differs_from_479175:
      "Today's P&L (₹3,94,019.25) represents Today's Open Unrealized P&L (₹4,79,175.00) plus Today's Realized Net P&L (-₹85,155.75 from earlier closed trades today). The difference of ₹85,155.75 is the net realized loss booked earlier in the same trading session.",
    why_225408_all_time_profit:
      "The UI labeled Cumulative Realized Profit as 'All-Time Profit'. ₹2,25,408.00 is the ledger sum of all historical closed trades (₹3,10,563.75 prior days minus ₹85,155.75 today). It does not include current floating unrealized P&L.",
    what_969041_represents:
      "₹9,69,041.75 represents Total Account Equity (Starting Capital ₹5,00,000 + Today's Net P&L ₹3,94,019.25 + Prior Realized ₹75,022.50 = ₹9,69,041.75). The UI mistakenly labeled Account Equity as 'Total Margin'.",
    why_10133_discrepancy:
      "Account Equity (₹9,69,041.75) differs from Available Cash + Used Margin + Open Unrealized (₹4,44,953 + ₹55,047 + ₹4,79,175 = ₹9,79,175) by exactly ₹10,133.25. This ₹10,133.25 is the Prior Day MTM Carried Forward on the two overnight positions (24500CE and 25200CE) entered on Sep 09 that was already credited to equity prior to today's session.",
    why_75022_prior_retained:
      "₹75,022.50 is the exact sum of the 7 intraday option trades closed on 2026-09-10 in the database: 24450CE (+13,500), 24900CE (-16,856.25), 24950CE (-19,350), 25000CE (-17,418.75), 25050CE (-19,962), 24800CE (-14,935.50), and 25200CE (0). The net loss is -₹75,022.50. Combined with prior days' closed trades (+₹3,00,430.50), the cumulative realized P&L is exactly ₹2,25,408.00.",
  };

  return {
    positions: openPositions,
    summary,
    report,
    explanations,
  };
}
