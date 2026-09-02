/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Derivatives Paper Execution Adapter & Cost Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { IIndianBrokerAdapter, IndianOrderRequest, IndianOrderResponse } from "./IndianBrokerAdapter.js";
import * as paper from "../../paperState.js";

export class IndianPaperExecutionAdapter implements IIndianBrokerAdapter {
  /**
   * Computes statutory SEBI, GST, STT, and exchange transaction fees for Indian F&O
   */
  public static calculateStatutoryCosts(turnover: number, isOption: boolean = false, isSell: boolean = false): {
    brokerage: number;
    stt: number;
    exchangeCharges: number;
    gst: number;
    sebiCharges: number;
    stampDuty: number;
    totalTaxesAndCharges: number;
  } {
    const brokerage = 20; // Flat ₹20 per executed order (Discount Broker standard)
    const stt = isSell ? (isOption ? turnover * 0.000625 : turnover * 0.000125) : 0;
    const exchangeCharges = isOption ? turnover * 0.0005 : turnover * 0.000019;
    const sebiCharges = turnover * 0.000001; // ₹10 per crore
    const stampDuty = !isSell ? turnover * 0.00003 : 0; // ₹300 per crore on buy
    const gst = (brokerage + exchangeCharges + sebiCharges) * 0.18; // 18% GST

    const totalTaxesAndCharges = Number((brokerage + stt + exchangeCharges + sebiCharges + stampDuty + gst).toFixed(2));

    return {
      brokerage,
      stt: Number(stt.toFixed(2)),
      exchangeCharges: Number(exchangeCharges.toFixed(2)),
      gst: Number(gst.toFixed(2)),
      sebiCharges: Number(sebiCharges.toFixed(2)),
      stampDuty: Number(stampDuty.toFixed(2)),
      totalTaxesAndCharges
    };
  }

  public async getFunds(userId: string): Promise<{ availableINR: number; usedMarginINR: number }> {
    const wallet = paper.getWallet(userId, "PAPER", "INDIAN_NIFTY50" as any);
    const bal = wallet.get("INR") || 0;
    return { availableINR: bal, usedMarginINR: 0 };
  }

  public async placeOrder(request: IndianOrderRequest): Promise<IndianOrderResponse> {
    const clientOrderId = `ORD_INR_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fillPrice = request.price || 100;
    const turnover = request.quantity * fillPrice;
    const costs = IndianPaperExecutionAdapter.calculateStatutoryCosts(turnover, request.symbol.includes("CE") || request.symbol.includes("PE"), request.action === "SELL");

    return {
      success: true,
      orderId: clientOrderId,
      status: "FILLED",
      filledPrice: fillPrice,
      filledQuantity: request.quantity,
      message: `Paper order filled at ₹${fillPrice} (Brokerage & Taxes: ₹${costs.totalTaxesAndCharges})`,
      timestamp: Date.now()
    };
  }

  public async modifyOrder(orderId: string, price?: number, quantity?: number): Promise<boolean> {
    return true;
  }

  public async cancelOrder(orderId: string): Promise<boolean> {
    return true;
  }

  public async squareOffPosition(tradeId: string, exitPrice?: number): Promise<{ success: boolean; realizedPnlINR: number }> {
    return { success: true, realizedPnlINR: 0 };
  }

  public async reconcileOrders(userId: string): Promise<{ discrepancies: string[] }> {
    return { discrepancies: [] };
  }
}
