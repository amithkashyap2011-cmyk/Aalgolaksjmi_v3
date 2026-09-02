/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Standardized Indian Broker Execution Adapter Interface
 * ═══════════════════════════════════════════════════════════════════
 */

import { IndianTradeObject, IndianTradeStatus } from "../types.js";

export interface IndianOrderRequest {
  tradeId: string;
  userId: string;
  symbol: string;
  underlying: string;
  exchange: "NSE" | "BSE" | "NFO" | "BFO";
  action: "BUY" | "SELL";
  quantity: number;
  orderType: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  productType: "MIS" | "CNC" | "NRML";
  price?: number;
  triggerPrice?: number;
  tag?: string;
}

export interface IndianOrderResponse {
  success: boolean;
  orderId: string;
  status: IndianTradeStatus;
  filledPrice: number;
  filledQuantity: number;
  message?: string;
  timestamp: number;
}

export interface IIndianBrokerAdapter {
  getFunds(userId: string): Promise<{ availableINR: number; usedMarginINR: number }>;
  placeOrder(request: IndianOrderRequest): Promise<IndianOrderResponse>;
  modifyOrder(orderId: string, price?: number, quantity?: number): Promise<boolean>;
  cancelOrder(orderId: string): Promise<boolean>;
  squareOffPosition(tradeId: string, exitPrice?: number): Promise<{ success: boolean; realizedPnlINR: number }>;
  reconcileOrders(userId: string): Promise<{ discrepancies: string[] }>;
}
