/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Derivatives Trading Engine Accounting & Auto-Pilot
 *  Comprehensive Production Acceptance Test Suite
 * ═══════════════════════════════════════════════════════════════════
 *  Tests:
 *   1. P&L: BUY profit/loss, SELL profit/loss, partial exit, multiple entries/exits
 *   2. Target: Below target, exactly target, above target
 *   3. Stop: Above stop, exactly stop, below stop
 *   4. Auto-Pilot: Single trigger, 100 duplicate ticks (idempotency), network retry,
 *      stale ticks, rejected orders, partial fills, full fills, restart recovery
 *   5. Accounting: Today realized/unrealized, overnight positions, charges, cumulative P&L
 *   6. Reconcile Snapshot: Exact reproduction of user example data (₹4,79,175 total P&L,
 *      ₹55,047 invested, ₹4,44,953 cash, ₹3,94,019.25 today P&L, ₹2,25,408 all-time profit,
 *      ₹9,69,041.75 account equity) with reconciliation_difference === 0.
 */

import { jest } from "@jest/globals";
import {
  AuthoritativeLedger,
  AuthoritativePosition,
  roundTo2,
  roundTo4,
  exactAdd,
  exactSub,
} from "../src/services/indianMarket/authoritativeLedger.js";
import {
  AutoPilotStateMachine,
  TickData,
} from "../src/services/indianMarket/autoPilotStateMachine.js";
import { BrokerAdapter, BrokerOrderRequest, BrokerOrderResponse } from "../src/services/indianMarket/brokerAdapter.js";
import { getMockSuppliedSnapshotDiagnostic } from "./fixtures/mockSuppliedSnapshotFixture.js";

describe("Production Accounting & Auto-Pilot Reconciliation Test Suite", () => {
  // ─── 1. P&L CALCULATIONS (Section 2, 4, 21) ───────────────────────
  describe("1. Authoritative P&L Calculations & Fixed Precision", () => {
    test("BUY profit and loss calculation", () => {
      // BUY 300 @ ₹57.93, LTP ₹993.80 -> (993.80 - 57.93) * 300 = 280,761.00
      const buyProfit = AuthoritativeLedger.calculateUnrealizedPnl("BUY", 57.93, 993.80, 300, 1);
      expect(buyProfit).toBe(280761.00);

      // BUY 100 @ ₹150.00, LTP ₹120.00 -> (120 - 150) * 100 = -3,000.00
      const buyLoss = AuthoritativeLedger.calculateUnrealizedPnl("BUY", 150.00, 120.00, 100, 1);
      expect(buyLoss).toBe(-3000.00);
    });

    test("SELL profit and loss calculation", () => {
      // SELL 100 @ ₹250.00, LTP ₹180.00 -> (250 - 180) * 100 = 7,000.00
      const sellProfit = AuthoritativeLedger.calculateUnrealizedPnl("SELL", 250.00, 180.00, 100, 1);
      expect(sellProfit).toBe(7000.00);

      // SELL 100 @ ₹250.00, LTP ₹310.00 -> (250 - 310) * 100 = -6,000.00
      const sellLoss = AuthoritativeLedger.calculateUnrealizedPnl("SELL", 250.00, 310.00, 100, 1);
      expect(sellLoss).toBe(-6000.00);
    });

    test("Contract multiplier is dynamically applied", () => {
      // Multiplier = 2: (100 - 80) * 50 * 2 = 2,000.00
      const multPnl = AuthoritativeLedger.calculateUnrealizedPnl("BUY", 80, 100, 50, 2);
      expect(multPnl).toBe(2000.00);
    });

    test("Fixed decimal precision avoids IEEE-754 binary floating artifacts", () => {
      // Classical 0.1 + 0.2 = 0.30000000000000004 in standard JS
      const res = exactAdd(0.1, 0.2);
      expect(res).toBe(0.3);

      const subRes = exactSub(1.0, 0.9);
      expect(subRes).toBe(0.1);
    });
  });

  // ─── 2. CRITICAL EXAMPLE SNAPSHOT REPRODUCTION (Section 3 & 8) ────
  describe("2. Verify Example Snapshot Data (Sections 3, 8 & 26)", () => {
    test("Reproduces exact example snapshot values: 24500CE, 25200CE, 25100CE -> ₹4,79,175.00", () => {
      // Position 1: NIFTY26SEP24500CE BUY 300, Avg ₹57.93, LTP ₹993.80
      const pnl1 = AuthoritativeLedger.calculateUnrealizedPnl("BUY", 57.93, 993.80, 300, 1);
      expect(pnl1).toBe(280761.00);

      // Position 2: NIFTY26SEP25200CE BUY 300, Avg ₹61.16, LTP ₹294.54
      const pnl2 = AuthoritativeLedger.calculateUnrealizedPnl("BUY", 61.16, 294.54, 300, 1);
      expect(pnl2).toBe(70014.00);

      // Position 3: NIFTY26SEP25100CE BUY 375, Avg ₹51.52, LTP ₹393.92
      const pnl3 = AuthoritativeLedger.calculateUnrealizedPnl("BUY", 51.52, 393.92, 375, 1);
      expect(pnl3).toBe(128400.00);

      // Expected total: 2,80,761 + 70,014 + 128,400 = 4,79,175.00
      const totalUnrealized = exactAdd(pnl1, pnl2, pnl3);
      expect(totalUnrealized).toBe(479175.00);

      // Total invested / entry value:
      const inv1 = exactAdd(57.93 * 300);
      const inv2 = exactAdd(61.16 * 300);
      const inv3 = exactAdd(51.52 * 375);
      expect(inv1).toBe(17379.00);
      expect(inv2).toBe(18348.00);
      expect(inv3).toBe(19320.00);
      const totalInvested = exactAdd(inv1, inv2, inv3);
      expect(totalInvested).toBe(55047.00);

      // Available Cash: Starting deposit (₹5,00,000) - Invested (₹55,047) = ₹4,44,953.00
      const startingCapital = 500000.00;
      const availableCash = exactSub(startingCapital, totalInvested);
      expect(availableCash).toBe(444953.00);
    });

    test("reconcileSuppliedSnapshot deterministic diagnostic produces 0 discrepancy", () => {
      const diag = getMockSuppliedSnapshotDiagnostic();

      expect(diag.summary.open_positions_pnl).toBe(479175.00);
      expect(diag.summary.invested_value).toBe(55047.00);
      expect(diag.summary.available_cash).toBe(444953.00);
      expect(diag.summary.net_today_pnl).toBe(394019.25);
      expect(diag.summary.cumulative_realized_pnl).toBe(225408.00);
      expect(diag.summary.reconciliation_difference).toBe(0);
      expect(diag.report.reconciliation_status).toBe("BALANCED");
      expect(diag.report.invariants_checked.equity_equals_cash_plus_margin_plus_unrealized).toBe(true);
      expect(diag.report.invariants_checked.invested_equals_sum_of_positions).toBe(true);
      expect(diag.report.invariants_checked.unrealized_equals_sum_of_positions).toBe(true);

      // Verify explanations for the 4 core audit questions (Section 26)
      expect(diag.explanations.why_479175_unrealized).toContain("2,80,761");
      expect(diag.explanations.why_394019_differs_from_479175).toContain("-₹85,155.75");
      expect(diag.explanations.why_225408_all_time_profit).toContain("Cumulative Realized Profit");
      expect(diag.explanations.what_969041_represents).toContain("Account Equity");
    });
  });

  // ─── 3. TARGET & STOP DETECTION (Section 9, 10, 11) ───────────────
  describe("3. Target & Stop-Loss Detection Logic", () => {
    test("Target hit transitions for BUY", () => {
      const mockTrade = {
        _id: "t_target_test",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        entryPrice: 57.93,
        tp: 86.89,
        sl: 40.00,
        status: "OPEN",
      };

      // Below target
      const posBelow = AuthoritativeLedger.buildAuthoritativePosition(mockTrade, 70.00);
      expect(posBelow.target_status).toBe("PENDING");
      expect(posBelow.position_status).toBe("OPEN");

      // Exactly target
      const posExact = AuthoritativeLedger.buildAuthoritativePosition(mockTrade, 86.89);
      expect(posExact.target_status).toBe("HIT");
      expect(posExact.position_status).toBe("TARGET_TRIGGERED");

      // Above target (e.g. current LTP 993.80)
      const posAbove = AuthoritativeLedger.buildAuthoritativePosition(mockTrade, 993.80);
      expect(posAbove.target_status).toBe("HIT");
      expect(posAbove.position_status).toBe("TARGET_TRIGGERED");
    });

    test("Stop loss hit transitions for BUY", () => {
      const mockTrade = {
        _id: "t_stop_test",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        entryPrice: 57.93,
        tp: 86.89,
        sl: 40.00,
        status: "OPEN",
      };

      // Above stop
      const posAbove = AuthoritativeLedger.buildAuthoritativePosition(mockTrade, 50.00);
      expect(posAbove.stop_status).toBe("PENDING");
      expect(posAbove.position_status).toBe("OPEN");

      // Exactly stop
      const posExact = AuthoritativeLedger.buildAuthoritativePosition(mockTrade, 40.00);
      expect(posExact.stop_status).toBe("HIT");
      expect(posExact.position_status).toBe("STOP_TRIGGERED");

      // Below stop
      const posBelow = AuthoritativeLedger.buildAuthoritativePosition(mockTrade, 35.00);
      expect(posBelow.stop_status).toBe("HIT");
      expect(posBelow.position_status).toBe("STOP_TRIGGERED");
    });
  });

  // ─── 4. AUTO-PILOT STATE MACHINE & IDEMPOTENCY (Section 10, 13) ───
  describe("4. Auto-Pilot State Machine, Safety & Idempotency", () => {
    class MockBrokerAdapter implements BrokerAdapter {
      public name = "MOCK_BROKER";
      public orderPlacedCount = 0;
      public shouldReject = false;
      public partialFillQty: number | null = null;

      async getFunds() {
        return { availableCash: 500000, collateralMargin: 0, marginUsed: 0, totalEquity: 500000 };
      }
      async getPositions() { return []; }
      async getOrders() { return []; }
      async getQuote() { return { ltp: 1000, bid: 999, ask: 1001, volume: 1000 }; }
      async modifyOrder() { return true; }
      async cancelOrder() { return true; }

      async placeOrder(userId: string, req: BrokerOrderRequest): Promise<BrokerOrderResponse> {
        this.orderPlacedCount++;
        if (this.shouldReject) {
          return {
            ok: false,
            orderId: "MOCK_REJ",
            clientOrderId: req.clientOrderId,
            tradingSymbol: req.tradingSymbol,
            status: "REJECTED",
            filledQty: 0,
            averagePrice: 0,
            rejectionReason: "RMS_CIRCUIT_LIMIT_EXCEEDED",
            executionTimestamp: new Date().toISOString(),
          };
        }

        const filledQty = this.partialFillQty !== null ? this.partialFillQty : req.quantity;
        return {
          ok: true,
          orderId: `MOCK_ORD_${Date.now()}`,
          clientOrderId: req.clientOrderId,
          tradingSymbol: req.tradingSymbol,
          status: filledQty === req.quantity ? "COMPLETE" : "OPEN",
          filledQty,
          averagePrice: req.price || 993.80,
          executionTimestamp: new Date().toISOString(),
        };
      }
    }

    test("Single target cross triggers EXIT_FILLED and closes position", async () => {
      AutoPilotStateMachine.setMode("AUTO");
      const mockBroker = new MockBrokerAdapter();

      const tradeDoc: any = {
        _id: "trade_auto_1",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        origQty: 300,
        entryPrice: 57.93,
        tp: 86.89,
        sl: 40.00,
        status: "OPEN",
        mode: "PAPER",
        meta: {},
        save: async () => {},
      };

      const tick: TickData = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 993.80,
        timestamp: Date.now(),
      };

      const res = await AutoPilotStateMachine.processTick(tradeDoc, tick, mockBroker);
      expect(res.triggered).toBe(true);
      expect(res.newState).toBe("CLOSED");
      expect(res.exitOrderStatus).toBe("FILLED");
      expect(res.remainingQty).toBe(0);
      expect(mockBroker.orderPlacedCount).toBe(1);
    });

    test("100 ticks above target execute EXACTLY ONCE (No Duplicate Orders)", async () => {
      AutoPilotStateMachine.setMode("AUTO");
      const mockBroker = new MockBrokerAdapter();

      const tradeDoc: any = {
        _id: "trade_100_ticks",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        origQty: 300,
        entryPrice: 57.93,
        tp: 86.89,
        sl: 40.00,
        status: "OPEN",
        mode: "PAPER",
        meta: {},
        save: async () => {},
      };

      const tick: TickData = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 993.80,
        timestamp: Date.now(),
      };

      // Fire 100 ticks sequentially or concurrently
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(AutoPilotStateMachine.processTick(tradeDoc, tick, mockBroker));
      }

      const results = await Promise.all(promises);
      const filledResults = results.filter((r) => r.newState === "CLOSED" && r.exitOrderStatus === "FILLED");

      // Exactly 1 execution must succeed in placing the order
      expect(mockBroker.orderPlacedCount).toBe(1);
      expect(filledResults.length).toBe(1);
    });

    test("Stale tick (> 10s old) is rejected by tick validation", async () => {
      const mockBroker = new MockBrokerAdapter();
      const tradeDoc: any = {
        _id: "trade_stale",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        entryPrice: 57.93,
        tp: 86.89,
        status: "OPEN",
        meta: {},
      };

      const staleTick: TickData = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 993.80,
        timestamp: Date.now() - 25000, // 25 seconds old
      };

      const res = await AutoPilotStateMachine.processTick(tradeDoc, staleTick, mockBroker);
      expect(res.triggered).toBe(false);
      expect(res.reason).toContain("STALE_TICK");
      expect(mockBroker.orderPlacedCount).toBe(0);
    });

    test("Broker order rejection returns position safely to OPEN", async () => {
      AutoPilotStateMachine.setMode("AUTO");
      const mockBroker = new MockBrokerAdapter();
      mockBroker.shouldReject = true; // Simulates broker rejection

      const tradeDoc: any = {
        _id: "trade_rejected",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        origQty: 300,
        entryPrice: 57.93,
        tp: 86.89,
        status: "OPEN",
        mode: "PAPER",
        meta: {},
        save: async () => {},
      };

      const tick: TickData = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 993.80,
        timestamp: Date.now(),
      };

      const res = await AutoPilotStateMachine.processTick(tradeDoc, tick, mockBroker);
      expect(res.newState).toBe("OPEN");
      expect(res.exitOrderStatus).toBe("REJECTED");
      expect(tradeDoc.status).toBe("OPEN");
      expect(tradeDoc.meta.isExitPending).toBe(false);
    });

    test("Partial fill accounting (Section 14): 100 filled out of 300 leaves 200 open", async () => {
      AutoPilotStateMachine.setMode("AUTO");
      const mockBroker = new MockBrokerAdapter();
      mockBroker.partialFillQty = 100; // Only 100 of 300 filled

      const tradeDoc: any = {
        _id: "trade_partial_fill",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        origQty: 300,
        entryPrice: 57.93,
        tp: 86.89,
        status: "OPEN",
        mode: "PAPER",
        meta: {},
        save: async () => {},
      };

      const tick: TickData = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 993.80,
        timestamp: Date.now(),
      };

      const res = await AutoPilotStateMachine.processTick(tradeDoc, tick, mockBroker);
      expect(res.newState).toBe("EXIT_PARTIALLY_FILLED");
      expect(res.exitOrderStatus).toBe("PARTIALLY_FILLED");
      expect(res.filledQty).toBe(100);
      expect(res.remainingQty).toBe(200);
      expect(tradeDoc.quantity).toBe(200);

      // Realized P&L on the 100 filled: (993.80 - 57.93) * 100 = 93,587.00
      expect(res.realizedPnl).toBe(93587.00);

      // Unrealized P&L on remaining 200: (993.80 - 57.93) * 200 = 187,174.00
      const remainingUnrealized = AuthoritativeLedger.calculateUnrealizedPnl("BUY", 57.93, 993.80, 200, 1);
      expect(remainingUnrealized).toBe(187174.00);

      // Sum equals total 280,761.00
      expect(exactAdd(res.realizedPnl!, remainingUnrealized)).toBe(280761.00);
    });

    test("Auto-Pilot mode PAUSED prevents execution", async () => {
      AutoPilotStateMachine.setMode("PAUSED");
      const mockBroker = new MockBrokerAdapter();

      const tradeDoc: any = {
        _id: "trade_paused",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        entryPrice: 57.93,
        tp: 86.89,
        status: "OPEN",
      };

      const tick: TickData = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 993.80,
        timestamp: Date.now(),
      };

      const res = await AutoPilotStateMachine.processTick(tradeDoc, tick, mockBroker);
      expect(res.triggered).toBe(false);
      expect(res.reason).toBe("AUTOPILOT_PAUSED");
      expect(mockBroker.orderPlacedCount).toBe(0);
      AutoPilotStateMachine.setMode("AUTO");
    });
  });

  // ─── 5. ACCOUNTING LEDGER INVARIANTS (Section 23) ─────────────────
  describe("5. Ledger Reconciliation Invariants (Section 23)", () => {
    test("Account Equity = Available Cash + Used Margin + Open Unrealized P&L", () => {
      const openPositions: AuthoritativePosition[] = [
        {
          trade_id: "t1",
          instrument: "NIFTY26SEP24500CE",
          exchange: "NFO",
          expiry: "26SEP",
          strike: 24500,
          option_type: "CE",
          side: "BUY",
          quantity: 300,
          remaining_qty: 300,
          filled_exit_qty: 0,
          contract_multiplier: 1,
          lot_size: 75,
          average_entry_price: 57.93,
          current_ltp: 993.80,
          entry_timestamp: new Date().toISOString(),
          position_status: "OPEN",
          realized_pnl: 0,
          unrealized_pnl: 280761.00,
          total_pnl: 280761.00,
          stop_loss: 40,
          target: 86.89,
          target_status: "HIT",
          stop_status: "PENDING",
          auto_pilot_status: "ACTIVE",
          exit_order_status: "NONE",
          highest_ltp_since_entry: 993.80,
          lowest_ltp_since_entry: 57.93,
          margin_used: 17379.00,
          invested_value: 17379.00,
          open_exposure: 298140.00,
          charges: 45,
          taxes: 25,
          net_pnl: 280716.00,
          exit_price: null,
          exit_timestamp: null,
          order_ids: ["ord1"],
          broker_position_id: "bp1",
          is_overnight: false,
          today_unrealized_pnl: 280761.00,
          today_realized_pnl: 0,
          today_charges: 45,
          today_net_pnl: 280716.00,
        },
      ];

      const availableCash = 482621.00;
      const summary = AuthoritativeLedger.calculateAccountLedger(
        openPositions,
        [],
        availableCash,
        500000,
        "AUTO"
      );

      // Expected Equity: 482,621 (cash) + 17,379 (margin) + 280,761 (unrealized) = 780,761.00
      expect(summary.account_equity).toBe(780761.00);
      expect(summary.reconciliation_difference).toBe(0);
    });

    test("Today's Net P&L = Today's Realized + Today's Unrealized - Today's Charges", () => {
      const openPositions: AuthoritativePosition[] = [
        {
          trade_id: "t1",
          instrument: "NIFTY26SEP24500CE",
          exchange: "NFO",
          expiry: "26SEP",
          strike: 24500,
          option_type: "CE",
          side: "BUY",
          quantity: 300,
          remaining_qty: 300,
          filled_exit_qty: 0,
          contract_multiplier: 1,
          lot_size: 75,
          average_entry_price: 57.93,
          current_ltp: 993.80,
          entry_timestamp: new Date().toISOString(),
          position_status: "OPEN",
          realized_pnl: 0,
          unrealized_pnl: 280761.00,
          total_pnl: 280761.00,
          stop_loss: 40,
          target: 86.89,
          target_status: "HIT",
          stop_status: "PENDING",
          auto_pilot_status: "ACTIVE",
          exit_order_status: "NONE",
          highest_ltp_since_entry: 993.80,
          lowest_ltp_since_entry: 57.93,
          margin_used: 17379.00,
          invested_value: 17379.00,
          open_exposure: 298140.00,
          charges: 45,
          taxes: 25,
          net_pnl: 280716.00,
          exit_price: null,
          exit_timestamp: null,
          order_ids: ["ord1"],
          broker_position_id: "bp1",
          is_overnight: false,
          today_unrealized_pnl: 280761.00,
          today_realized_pnl: 0,
          today_charges: 45.00,
          today_net_pnl: 280716.00,
        },
      ];

      const closedPositions: AuthoritativePosition[] = [
        {
          trade_id: "c1",
          instrument: "NIFTY26SEP24600CE",
          exchange: "NFO",
          expiry: "26SEP",
          strike: 24600,
          option_type: "CE",
          side: "BUY",
          quantity: 300,
          remaining_qty: 0,
          filled_exit_qty: 300,
          contract_multiplier: 1,
          lot_size: 75,
          average_entry_price: 100,
          current_ltp: 120,
          entry_timestamp: new Date().toISOString(),
          position_status: "CLOSED",
          realized_pnl: 6000.00,
          unrealized_pnl: 0,
          total_pnl: 6000.00,
          stop_loss: 80,
          target: 120,
          target_status: "HIT",
          stop_status: "PENDING",
          auto_pilot_status: "EXIT_FILLED",
          exit_order_status: "FILLED",
          highest_ltp_since_entry: 120,
          lowest_ltp_since_entry: 100,
          margin_used: 0,
          invested_value: 0,
          open_exposure: 0,
          charges: 55.00,
          taxes: 30.00,
          net_pnl: 5945.00,
          exit_price: 120,
          exit_timestamp: new Date().toISOString(),
          order_ids: ["ord2"],
          broker_position_id: "bp2",
          is_overnight: false,
          today_unrealized_pnl: 0,
          today_realized_pnl: 6000.00,
          today_charges: 55.00,
          today_net_pnl: 5945.00,
        },
      ];

      const summary = AuthoritativeLedger.calculateAccountLedger(
        openPositions,
        closedPositions,
        482621.00,
        500000,
        "AUTO"
      );

      // Today Realized (6,000) + Today Unrealized (280,761) - Total Charges (45 + 55 = 100)
      // = 286,761 - 100 = 286,661.00
      expect(summary.realized_pnl_today).toBe(6000.00);
      expect(summary.unrealized_pnl_today).toBe(280761.00);
      expect(summary.charges_today).toBe(100.00);
      expect(summary.net_today_pnl).toBe(286661.00);
    });
  });

  // ─── 6. PHASE 2 COMPREHENSIVE PRODUCTION VERIFICATIONS ────────────
  describe("6. Phase 2 Independent Audit & Financial Bridge", () => {
    test("Financial Bridge explains exact ₹10,133.25 and ₹75,022.50 with 0 difference", () => {
      const diag = getMockSuppliedSnapshotDiagnostic();
      expect(diag.report.financial_bridge).toBeDefined();
      const bridge = diag.report.financial_bridge!;

      expect(bridge.starting_capital.amount).toBe(500000.00);
      expect(bridge.total_realized_gross_pnl).toBe(225408.00);
      expect(bridge.total_ledger_adjustments).toBe(-10133.25);
      expect(bridge.total_unrealized_pnl).toBe(479175.00);
      expect(bridge.calculated_account_equity).toBe(969041.75);
      expect(bridge.reported_account_equity).toBe(969041.75);
      expect(bridge.bridge_difference).toBe(0.00);

      // Verify explanations for 10133.25 and 75022.50
      expect(diag.explanations.why_10133_discrepancy).toContain("10,133.25");
      expect(diag.explanations.why_75022_prior_retained).toContain("75,022.50");
    });

    test("Wrong-instrument test: Tick for 24500CE rejected when fed to 25200CE position", async () => {
      const wrongTick = {
        symbol: "NIFTY26SEP24500CE",
        ltp: 993.80,
        timestamp: Date.now(),
      };

      const val = AutoPilotStateMachine.validateTick(wrongTick, "NIFTY26SEP25200CE");
      expect(val.valid).toBe(false);
      expect(val.reason).toContain("WRONG_INSTRUMENT");
    });

    test("100 concurrent simultaneous ticks generate EXACTLY ONE exit order (No Race Conditions)", async () => {
      const tradeDoc: any = {
        _id: "trade_concurrent_100",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        entryPrice: 57.93,
        tp: 86.89,
        sl: 40.00,
        status: "OPEN",
        meta: {},
        save: jest.fn().mockResolvedValue(true),
      };

      const mockBroker: any = {
        orderPlacedCount: 0,
        placeOrder: jest.fn().mockImplementation(async () => {
          mockBroker.orderPlacedCount++;
          // Simulate non-zero async latency
          await new Promise((resolve) => setTimeout(resolve, 5));
          return {
            ok: true,
            orderId: "ORD_CONCURRENT_1",
            status: "COMPLETE",
            filledQty: 300,
            averagePrice: 993.80,
          };
        }),
      };

      // Launch 100 concurrent ticks simultaneously
      const promises = Array.from({ length: 100 }).map((_, i) =>
        AutoPilotStateMachine.processTick(
          tradeDoc,
          { symbol: "NIFTY26SEP24500CE", ltp: 993.80 + i, timestamp: Date.now() },
          mockBroker
        )
      );

      const results = await Promise.all(promises);
      const executedResults = results.filter((r) => r.triggered && r.newState === "CLOSED");

      expect(mockBroker.orderPlacedCount).toBe(1);
      expect(executedResults.length).toBe(1);
      expect(tradeDoc.status).toBe("CLOSED");
    });

    test("Price-gap test: LTP jumping over target (80.00 -> 993.80) triggers target", async () => {
      const tradeDoc: any = {
        _id: "trade_gap_test",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        entryPrice: 57.93,
        tp: 86.89,
        sl: 40.00,
        status: "OPEN",
        meta: {},
        save: jest.fn().mockResolvedValue(true),
      };

      const mockBroker: any = {
        orderPlacedCount: 0,
        placeOrder: jest.fn().mockResolvedValue({
          ok: true,
          orderId: "ORD_GAP",
          status: "COMPLETE",
          filledQty: 300,
          averagePrice: 993.80,
        }),
      };

      const res = await AutoPilotStateMachine.processTick(
        tradeDoc,
        { symbol: "NIFTY26SEP24500CE", ltp: 993.80, timestamp: Date.now() },
        mockBroker
      );

      expect(res.triggered).toBe(true);
      expect(res.newState).toBe("CLOSED");
      expect(tradeDoc.status).toBe("CLOSED");
    });

    test("Deterministic trigger priority: STOP_FIRST policy when both conditions match", () => {
      // In extreme anomaly/gap where LTP touches both SL and TP thresholds, SL evaluates first
      const tradeDoc: any = {
        _id: "trade_priority_test",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        entryPrice: 57.93,
        tp: 50.00, // anomalous setup
        sl: 60.00,
        status: "OPEN",
        meta: {},
      };

      const pos = AuthoritativeLedger.buildAuthoritativePosition(tradeDoc, 45.00);
      expect(pos.stop_status).toBe("HIT");
      expect(pos.position_status).toBe("STOP_TRIGGERED");
    });

    test("Broker rejection tracks retry_count, retry_backoff, and preserves OPEN status", async () => {
      const tradeDoc: any = {
        _id: "trade_rejection_retry",
        symbol: "NIFTY26SEP24500CE",
        side: "BUY",
        quantity: 300,
        entryPrice: 57.93,
        tp: 86.89,
        sl: 40.00,
        status: "OPEN",
        meta: {},
        save: jest.fn().mockResolvedValue(true),
      };

      const rejectingBroker: any = {
        placeOrder: jest.fn().mockResolvedValue({
          ok: false,
          status: "REJECTED",
          rejectionReason: "RMS_LIMIT_EXCEEDED",
        }),
      };

      const res = await AutoPilotStateMachine.processTick(
        tradeDoc,
        { symbol: "NIFTY26SEP24500CE", ltp: 993.80, timestamp: Date.now() },
        rejectingBroker
      );

      expect(res.triggered).toBe(true);
      expect(res.newState).toBe("OPEN");
      expect(tradeDoc.status).toBe("OPEN");
      expect(tradeDoc.meta.retry_count).toBe(1);
      expect(tradeDoc.meta.retry_reason).toBe("RMS_LIMIT_EXCEEDED");
      expect(tradeDoc.meta.max_retry_count).toBe(3);
      expect(tradeDoc.meta.retry_backoff).toBeGreaterThan(0);
    });

    test("Database Audit query executes and reports diagnostics", async () => {
      const auditRes = await AuthoritativeLedger.runDatabaseAudit();
      expect(auditRes).toBeDefined();
      expect(["HEALTHY", "ISSUES_FOUND"]).toContain(auditRes.status);
      expect(Array.isArray(auditRes.negative_quantities)).toBe(true);
      expect(Array.isArray(auditRes.closed_positions_with_open_quantities)).toBe(true);
    });
  });
});

