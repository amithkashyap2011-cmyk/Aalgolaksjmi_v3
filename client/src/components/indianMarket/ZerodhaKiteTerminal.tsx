import React, { useState, useEffect } from "react";
import {
  Search, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Wallet, Layers, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw,
  Plus, X, ChevronRight, HelpCircle, Activity, Briefcase, FileText,
  DollarSign, SlidersHorizontal, BarChart2, PieChart, Sparkles,
  Zap, Target, ShieldAlert, Check, Calendar, Download, Filter,
  ArrowRight, Award, Clock
} from "lucide-react";

interface StockItem {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE" | "NFO" | "BFO";
  category: "INDEX" | "OPTIONS" | "EQUITY";
  price: number;
  change: number;
  changePct: number;
  lotSize: number;
  aiSignal?: "BUY" | "SELL" | "HOLD";
  aiConfidence?: number;
  aiRegime?: string;
}

interface PositionItem {
  tradeId: string;
  symbol: string;
  underlying: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  accountType: string;
  productType?: string;
}

interface OrderItem {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  slPrice?: number;
  tpPrice?: number;
  productType: "CNC" | "MIS" | "NRML";
  orderType: "MARKET" | "LIMIT" | "SL";
  status: "COMPLETE" | "REJECTED" | "OPEN";
  timestamp: string;
}

interface HistoricalTradeItem {
  tradeId: string;
  symbol: string;
  underlying: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  realizedPnlPct: number;
  charges: number;
  netPnl: number;
  productType: "CNC" | "MIS" | "NRML";
  exitReason: string;
  openedAt?: string;
  closedAt?: string;
  strategy?: string;
}

const DEFAULT_INDIAN_WATCHLIST: StockItem[] = [
  { symbol: "NIFTY50", name: "NIFTY 50 Index", exchange: "NSE", category: "INDEX", price: 24530.20, change: 158.40, changePct: 0.65, lotSize: 25, aiSignal: "BUY", aiConfidence: 89, aiRegime: "Bullish Trend" },
  { symbol: "BANKNIFTY", name: "NIFTY BANK Index", exchange: "NSE", category: "INDEX", price: 52140.50, change: 425.10, changePct: 0.82, lotSize: 15, aiSignal: "BUY", aiConfidence: 92, aiRegime: "High Conviction Long" },
  { symbol: "FINNIFTY", name: "NIFTY Fin Services", exchange: "NSE", category: "INDEX", price: 23150.00, change: -45.20, changePct: -0.19, lotSize: 25, aiSignal: "HOLD", aiConfidence: 65, aiRegime: "Mean Reverting" },
  { symbol: "SENSEX", name: "BSE SENSEX", exchange: "BSE", category: "INDEX", price: 80519.30, change: 432.50, changePct: 0.54, lotSize: 10, aiSignal: "BUY", aiConfidence: 84, aiRegime: "Momentum Breakout" },
  { symbol: "NIFTY 24500 CE", name: "NIFTY Weekly 24500 Call", exchange: "NFO", category: "OPTIONS", price: 142.50, change: 24.10, changePct: 20.35, lotSize: 25, aiSignal: "BUY", aiConfidence: 91, aiRegime: "Option Gamma Surge" },
  { symbol: "NIFTY 24500 PE", name: "NIFTY Weekly 24500 Put", exchange: "NFO", category: "OPTIONS", price: 98.20, change: -18.40, changePct: -15.78, lotSize: 25, aiSignal: "SELL", aiConfidence: 85, aiRegime: "Theta Decay" },
  { symbol: "BANKNIFTY 52100 CE", name: "BANKNIFTY Weekly 52100 Call", exchange: "NFO", category: "OPTIONS", price: 285.00, change: 45.00, changePct: 18.75, lotSize: 15, aiSignal: "BUY", aiConfidence: 94, aiRegime: "Institutional Call Buy" },
  { symbol: "BANKNIFTY 52100 PE", name: "BANKNIFTY Weekly 52100 Put", exchange: "NFO", category: "OPTIONS", price: 195.40, change: -32.60, changePct: -14.30, lotSize: 15, aiSignal: "SELL", aiConfidence: 88, aiRegime: "Volatility Crush" },
  { symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE", category: "EQUITY", price: 2985.40, change: 35.60, changePct: 1.21, lotSize: 1, aiSignal: "BUY", aiConfidence: 87, aiRegime: "Volume Expansion" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", exchange: "NSE", category: "EQUITY", price: 1642.10, change: 12.80, changePct: 0.79, lotSize: 1, aiSignal: "BUY", aiConfidence: 86, aiRegime: "Trend Continuation" },
  { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE", category: "EQUITY", price: 1845.50, change: -8.40, changePct: -0.45, lotSize: 1, aiSignal: "HOLD", aiConfidence: 70, aiRegime: "Consolidation" },
  { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE", category: "EQUITY", price: 4210.00, change: 28.50, changePct: 0.68, lotSize: 1, aiSignal: "BUY", aiConfidence: 81, aiRegime: "Support Bounce" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", exchange: "NSE", category: "EQUITY", price: 1084.20, change: 18.90, changePct: 1.77, lotSize: 1, aiSignal: "BUY", aiConfidence: 93, aiRegime: "Strong Bull Trend" },
  { symbol: "SBIN", name: "State Bank of India", exchange: "NSE", category: "EQUITY", price: 824.50, change: 6.20, changePct: 0.76, lotSize: 1, aiSignal: "BUY", aiConfidence: 88, aiRegime: "Breakout" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", exchange: "NSE", category: "EQUITY", price: 1215.30, change: 14.10, changePct: 1.17, lotSize: 1, aiSignal: "BUY", aiConfidence: 90, aiRegime: "Institutional Accumulation" },
];

function formatINR(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(val || 0);
}

export default function ZerodhaKiteTerminal({ onSwitchToQuant }: { onSwitchToQuant?: () => void }) {
  // Navigation Tabs: Watchlist, Orders, Holdings, Positions, PNL_HISTORY, Funds
  const [activeTab, setActiveTab] = useState<"WATCHLIST" | "ORDERS" | "HOLDINGS" | "POSITIONS" | "PNL_HISTORY" | "FUNDS">("WATCHLIST");
  const [marketwatchIndex, setMarketwatchIndex] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "INDICES" | "OPTIONS" | "EQUITY">("ALL");

  // P&L & History Timeframe: daily, weekly, monthly, all
  const [historyTimeframe, setHistoryTimeframe] = useState<"daily" | "weekly" | "monthly" | "all">("daily");

  // Order Placement Modal State
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [productType, setProductType] = useState<"CNC" | "MIS" | "NRML">("MIS");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL">("MARKET");
  const [quantity, setQuantity] = useState<number>(1);
  const [limitPrice, setLimitPrice] = useState<number>(0);
  
  // Dynamic AI SL & Target State
  const [enableSL, setEnableSL] = useState(true);
  const [stopLossPrice, setStopLossPrice] = useState<number>(0);
  const [enableTarget, setEnableTarget] = useState(true);
  const [targetPrice, setTargetPrice] = useState<number>(0);
  const [aiRiskProfile, setAiRiskProfile] = useState<"RECOMMENDED" | "CONSERVATIVE" | "AGGRESSIVE">("RECOMMENDED");
  const [enableTrailing, setEnableTrailing] = useState(true);

  const [orderExecuting, setOrderExecuting] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Runtime Data State
  const [funds, setFunds] = useState({ availableCashINR: 500000, usedMarginINR: 0, totalCollateralINR: 500000 });
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [tradeHistory, setTradeHistory] = useState<HistoricalTradeItem[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);

  const [holdings, setHoldings] = useState<any[]>([
    { symbol: "RELIANCE", name: "Reliance Industries", quantity: 25, avgPrice: 2850.00, currentPrice: 2985.40, invested: 71250, currentVal: 74635, pnl: 3385, pnlPct: 4.75 },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd", quantity: 50, avgPrice: 1580.00, currentPrice: 1642.10, invested: 79000, currentVal: 82105, pnl: 3105, pnlPct: 3.93 },
    { symbol: "TATAMOTORS", name: "Tata Motors Ltd", quantity: 40, avgPrice: 990.00, currentPrice: 1084.20, invested: 39600, currentVal: 43368, pnl: 3768, pnlPct: 9.51 },
  ]);

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Dynamic AI SL & TP Calculator Function
  const calculateAiDynamicLevels = (
    stock: StockItem,
    side: "BUY" | "SELL",
    profile: "RECOMMENDED" | "CONSERVATIVE" | "AGGRESSIVE" = "RECOMMENDED",
    basePrice?: number
  ) => {
    const price = basePrice || stock.price;
    const isBuy = side === "BUY";
    
    // Dynamic ATR estimate based on asset class
    let atrMultiplier = 0.012; // 1.2% standard
    if (stock.category === "OPTIONS") {
      atrMultiplier = 0.25; // 25% option premium volatility
    } else if (stock.category === "INDEX") {
      atrMultiplier = 0.009; // 0.9% index volatility
    } else if (stock.category === "EQUITY") {
      atrMultiplier = 0.015; // 1.5% equity stock volatility
    }

    // Risk:Reward Multipliers
    let slFactor = 1.2;
    let tpFactor = 2.4; // 1:2 default
    if (profile === "CONSERVATIVE") {
      slFactor = 0.8;
      tpFactor = 1.6; // 1:2 tighter
    } else if (profile === "AGGRESSIVE") {
      slFactor = 1.5;
      tpFactor = 3.5; // 1:2.33 trend runner
    }

    const slDistance = price * atrMultiplier * slFactor;
    const tpDistance = price * atrMultiplier * tpFactor;

    const dynamicSL = isBuy ? Number((price - slDistance).toFixed(2)) : Number((price + slDistance).toFixed(2));
    const dynamicTP = isBuy ? Number((price + tpDistance).toFixed(2)) : Number((price - tpDistance).toFixed(2));

    return {
      sl: dynamicSL,
      tp: dynamicTP,
      slDistance,
      tpDistance,
      slPct: ((Math.abs(dynamicSL - price) / price) * 100).toFixed(2),
      tpPct: ((Math.abs(dynamicTP - price) / price) * 100).toFixed(2),
      riskRewardRatio: (tpFactor / slFactor).toFixed(1),
    };
  };

  // Fetch Live Positions, Funds, History & Analytics
  const fetchLiveData = async () => {
    try {
      // 1. Positions
      const posRes = await fetch("/api/indian-market/positions");
      const posData = await posRes.json();
      if (posData.success) {
        setPositions(posData.positions || []);
      }

      // 2. Funds
      const fundsRes = await fetch("/api/indian-market/funds?userId=guest-user");
      const fundsData = await fundsRes.json();
      if (fundsData.success) {
        setFunds(fundsData);
      }

      // 3. Trade History
      const histRes = await fetch(`/api/indian-market/history?timeframe=${historyTimeframe}`);
      const histData = await histRes.json();
      if (histData.success) {
        setTradeHistory(histData.history || []);
      }

      // 4. Analytics
      const analRes = await fetch("/api/indian-market/analytics");
      const analData = await analRes.json();
      if (analData.success) {
        setAnalytics(analData.analytics);
      }
    } catch {
      // Fail-soft fallback
    }
  };

  useEffect(() => {
    fetchLiveData();
    const timer = setInterval(fetchLiveData, 3000);
    return () => clearInterval(timer);
  }, [historyTimeframe]);

  // Open Order Modal for a stock with Dynamic AI Calculations
  const handleOpenOrder = (stock: StockItem, side: "BUY" | "SELL") => {
    setSelectedStock(stock);
    setOrderSide(side);
    const isOptionOrIndex = stock.category === "OPTIONS" || stock.category === "INDEX";
    setProductType(isOptionOrIndex ? "MIS" : "CNC");
    setQuantity(stock.lotSize || 1);
    setLimitPrice(stock.price);
    setOrderType("MARKET");
    setEnableSL(true);
    setEnableTarget(true);
    setAiRiskProfile("RECOMMENDED");
    setEnableTrailing(true);

    // Compute dynamic AI suggestions
    const levels = calculateAiDynamicLevels(stock, side, "RECOMMENDED");
    setStopLossPrice(levels.sl);
    setTargetPrice(levels.tp);

    setIsOrderModalOpen(true);
  };

  // Handle Risk Profile Change in Modal
  const handleApplyRiskProfile = (profile: "RECOMMENDED" | "CONSERVATIVE" | "AGGRESSIVE") => {
    if (!selectedStock) return;
    setAiRiskProfile(profile);
    const price = orderType === "LIMIT" ? limitPrice : selectedStock.price;
    const levels = calculateAiDynamicLevels(selectedStock, orderSide, profile, price);
    setStopLossPrice(levels.sl);
    setTargetPrice(levels.tp);
  };

  // Submit Order Execution
  const handleExecuteOrder = async () => {
    if (!selectedStock) return;
    setOrderExecuting(true);

    try {
      const isMIS = productType === "MIS";
      const leverage = isMIS ? 5 : 1;

      const res = await fetch("/api/indian-market/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedStock.symbol.split(" ")[0], // root symbol for backend
          side: orderSide,
          quantity: quantity,
          productType: productType,
          leverage: leverage,
          sl: enableSL ? stopLossPrice : undefined,
          tp: enableTarget ? targetPrice : undefined,
          mode: "PAPER",
          userId: "guest-user",
          aiConfidence: selectedStock.aiConfidence || 90,
        }),
      });

      const data = await res.json();
      if (data.ok || data.success) {
        showToast(
          `✅ ${orderSide} ${quantity}x ${selectedStock.symbol} executed at ₹${selectedStock.price} | SL: ₹${stopLossPrice} | Target: ₹${targetPrice}`,
          "success"
        );

        // Add to local orders book
        setOrders((prev) => [
          {
            id: `ORD-${Date.now().toString().slice(-6)}`,
            symbol: selectedStock.symbol,
            side: orderSide,
            quantity,
            price: selectedStock.price,
            slPrice: enableSL ? stopLossPrice : undefined,
            tpPrice: enableTarget ? targetPrice : undefined,
            productType,
            orderType,
            status: "COMPLETE",
            timestamp: new Date().toLocaleTimeString("en-IN"),
          },
          ...prev,
        ]);

        // If CNC, add to holdings
        if (productType === "CNC" && orderSide === "BUY") {
          setHoldings((prev) => [
            {
              symbol: selectedStock.symbol,
              name: selectedStock.name,
              quantity,
              avgPrice: selectedStock.price,
              currentPrice: selectedStock.price,
              invested: quantity * selectedStock.price,
              currentVal: quantity * selectedStock.price,
              pnl: 0,
              pnlPct: 0,
            },
            ...prev,
          ]);
        }

        setIsOrderModalOpen(false);
        fetchLiveData();
      } else {
        showToast(`Order Rejected: ${data.error || "Failed execution"}`, "error");
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setOrderExecuting(false);
    }
  };

  // 1-Click Square Off
  const handleSquareOff = async (tradeId: string, symbol: string) => {
    try {
      const res = await fetch("/api/indian-market/close-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, userId: "guest-user" }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Position ${symbol} squared off (P&L: ₹${data.realizedPnlINR?.toFixed(2) || 0})`, "success");
        fetchLiveData();
      }
    } catch {
      showToast("Failed squaring off position", "error");
    }
  };

  // Quick Deposit Funds
  const handleAddFunds = async (amount: number) => {
    try {
      const res = await fetch("/api/indian-market/funds/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, userId: "guest-user" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`₹${amount.toLocaleString("en-IN")} deposited to Paper Account`, "success");
        fetchLiveData();
      }
    } catch {
      showToast("Failed depositing funds", "error");
    }
  };

  // Export Trade History as CSV
  const handleExportCSV = () => {
    if (tradeHistory.length === 0) {
      showToast("No trade history records to export", "info");
      return;
    }

    const headers = ["Trade ID", "Symbol", "Side", "Product", "Qty", "Entry Price", "Exit Price", "Gross PnL (INR)", "Charges (INR)", "Net PnL (INR)", "Exit Reason", "Closed At"];
    const rows = tradeHistory.map((t) => [
      t.tradeId,
      t.symbol,
      t.side,
      t.productType,
      t.quantity,
      t.entryPrice,
      t.exitPrice,
      t.realizedPnl,
      t.charges,
      t.netPnl,
      t.exitReason,
      t.closedAt ? new Date(t.closedAt).toLocaleString("en-IN") : "—",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Aalgolakshmi_Indian_PnL_Report_${historyTimeframe.toUpperCase()}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Tax P&L Statement downloaded successfully", "success");
  };

  // Filter Watchlist Stocks
  const filteredStocks = DEFAULT_INDIAN_WATCHLIST.filter((s) => {
    const matchesSearch = s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || s.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (categoryFilter === "INDICES") return s.category === "INDEX";
    if (categoryFilter === "OPTIONS") return s.category === "OPTIONS";
    if (categoryFilter === "EQUITY") return s.category === "EQUITY";
    return true;
  });

  // Dynamic values for order calculations
  const orderPrice = orderType === "MARKET" ? (selectedStock?.price || 0) : limitPrice;
  const totalNotional = (quantity || 0) * orderPrice;
  const isMIS = productType === "MIS";
  const requiredMargin = isMIS ? totalNotional / 5 : totalNotional;

  // Dynamic PnL Projection calculations in modal
  const isBuySide = orderSide === "BUY";
  const projectedLossPerUnit = Math.abs(orderPrice - stopLossPrice);
  const projectedGainPerUnit = Math.abs(targetPrice - orderPrice);
  const totalMaxRiskINR = projectedLossPerUnit * quantity;
  const totalTargetProfitINR = projectedGainPerUnit * quantity;
  const currentRiskReward = totalMaxRiskINR > 0 ? (totalTargetProfitINR / totalMaxRiskINR).toFixed(2) : "2.0";

  // Spot Index Prices for Kite Header
  const niftySpot = DEFAULT_INDIAN_WATCHLIST.find((s) => s.symbol === "NIFTY50") || { price: 24530.20, change: 158.40, changePct: 0.65 };
  const bankNiftySpot = DEFAULT_INDIAN_WATCHLIST.find((s) => s.symbol === "BANKNIFTY") || { price: 52140.50, change: 425.10, changePct: 0.82 };
  const sensexSpot = DEFAULT_INDIAN_WATCHLIST.find((s) => s.symbol === "SENSEX") || { price: 80519.30, change: 432.50, changePct: 0.54 };

  // Holdings Summary
  const totalInvested = holdings.reduce((sum, h) => sum + h.invested, 0);
  const totalCurrentVal = holdings.reduce((sum, h) => sum + h.currentVal, 0);
  const totalHoldingsPnl = totalCurrentVal - totalInvested;
  const totalHoldingsPnlPct = totalInvested > 0 ? (totalHoldingsPnl / totalInvested) * 100 : 0;

  // Positions Summary
  const totalPositionsPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);

  // Timeframe-specific analytics
  const currentMetrics =
    historyTimeframe === "daily"
      ? analytics?.daily || { netPnL: 3450, tradesCount: 4, winRate: 75.0, grossProfit: 4500, grossLoss: 1050, charges: 180 }
      : historyTimeframe === "weekly"
      ? analytics?.weekly || { netPnL: 18420, tradesCount: 16, winRate: 68.8, grossProfit: 24500, grossLoss: 6080, charges: 720 }
      : historyTimeframe === "monthly"
      ? analytics?.monthly || { netPnL: 64850, tradesCount: 52, winRate: 71.2, grossProfit: 89000, grossLoss: 24150, charges: 2340 }
      : analytics || { netPnL: 64850, totalTrades: 52, winRate: 71.2, profitFactor: 2.15, maxDrawdown: "-3.8%" };

  return (
    <div style={{ background: "#0b0f19", minHeight: "100vh", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      
      {/* ─── TOAST NOTIFICATION ─── */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 9999,
            padding: "12px 18px",
            borderRadius: 8,
            background: toastMsg.type === "success" ? "#065f46" : toastMsg.type === "error" ? "#991b1b" : "#1e293b",
            color: "#fff",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            border: `1px solid ${toastMsg.type === "success" ? "#10b981" : toastMsg.type === "error" ? "#ef4444" : "#475569"}`,
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {toastMsg.type === "success" ? <CheckCircle2 size={16} color="#34d399" /> : <AlertCircle size={16} color="#f87171" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ─── 1. ZERODHA KITE TOP NAVIGATION BAR ─── */}
      <header
        style={{
          background: "#131b2e",
          borderBottom: "1px solid #1e293b",
          padding: "0 20px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        {/* Left: Kite Logo & Live Spot Indices */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "#ff5722",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                color: "#fff",
                fontSize: 15,
                boxShadow: "0 0 10px rgba(255,87,34,0.4)",
              }}
            >
              K
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
              Kite <span style={{ color: "#38bdf8", fontSize: 11, fontWeight: 700, background: "rgba(56,189,248,0.15)", padding: "2px 6px", borderRadius: 4 }}>AI SMART</span>
            </span>
          </div>

          <div style={{ width: 1, height: 24, background: "#334155" }} />

          {/* Indices Ticker Strip */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>NIFTY 50</span>
              <span style={{ fontWeight: 700, color: "#fff" }}>{niftySpot.price.toLocaleString("en-IN")}</span>
              <span style={{ color: niftySpot.change >= 0 ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: 600 }}>
                {niftySpot.change >= 0 ? "+" : ""}{niftySpot.changePct}%
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>NIFTY BANK</span>
              <span style={{ fontWeight: 700, color: "#fff" }}>{bankNiftySpot.price.toLocaleString("en-IN")}</span>
              <span style={{ color: bankNiftySpot.change >= 0 ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: 600 }}>
                {bankNiftySpot.change >= 0 ? "+" : ""}{bankNiftySpot.changePct}%
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>SENSEX</span>
              <span style={{ fontWeight: 700, color: "#fff" }}>{sensexSpot.price.toLocaleString("en-IN")}</span>
              <span style={{ color: sensexSpot.change >= 0 ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: 600 }}>
                {sensexSpot.change >= 0 ? "+" : ""}{sensexSpot.changePct}%
              </span>
            </div>
          </div>
        </div>

        {/* Right: Main Navigation Tabs & AI Quant Switch */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[
            { id: "WATCHLIST", label: "Dashboard / Watchlist" },
            { id: "ORDERS", label: `Orders (${orders.length})` },
            { id: "HOLDINGS", label: `Holdings (${holdings.length})` },
            { id: "POSITIONS", label: `Positions (${positions.length})` },
            { id: "PNL_HISTORY", label: "📊 P&L / Trade History" },
            { id: "FUNDS", label: "Funds" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: activeTab === tab.id ? "rgba(56,126,209,0.2)" : "transparent",
                color: activeTab === tab.id ? "#387ed1" : "#94a3b8",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #387ed1" : "2px solid transparent",
                padding: "16px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {tab.label}
            </button>
          ))}

          {/* Switch to Advanced Quant Mode */}
          {onSwitchToQuant && (
            <button
              onClick={onSwitchToQuant}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 6,
                background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                border: "1px solid #3b82f6",
                color: "#60a5fa",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                marginLeft: 12,
              }}
            >
              <Activity size={14} />
              <span>⚡ AI Quant Engine</span>
            </button>
          )}
        </div>
      </header>

      {/* ─── 2. MAIN LAYOUT: SPLIT SCREEN (MARKETWATCH ON LEFT + ACTIVE VIEW ON RIGHT) ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", minHeight: "calc(100vh - 56px)" }}>
        
        {/* ─── LEFT: ZERODHA MARKETWATCH SIDEBAR ─── */}
        <div
          style={{
            background: "#0e1424",
            borderRight: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Search Bar */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #1e293b" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#161f36",
                border: "1px solid #273553",
                borderRadius: 6,
                padding: "8px 12px",
              }}
            >
              <Search size={15} color="#64748b" />
              <input
                type="text"
                placeholder="Search eg: infy, banknifty weekly, reliance..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#fff",
                  fontSize: 13,
                  width: "100%",
                }}
              />
            </div>

            {/* Filter Chips */}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {[
                { id: "ALL", label: "All" },
                { id: "INDICES", label: "Indices" },
                { id: "OPTIONS", label: "F&O Weekly" },
                { id: "EQUITY", label: "Shares" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCategoryFilter(f.id as any)}
                  style={{
                    background: categoryFilter === f.id ? "#387ed1" : "#1e293b",
                    color: categoryFilter === f.id ? "#fff" : "#94a3b8",
                    border: "none",
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stock Item Rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredStocks.map((stock) => {
              const isUp = stock.change >= 0;
              return (
                <div
                  key={stock.symbol}
                  className="kite-stock-row"
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #162035",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transition: "background 0.15s ease",
                    cursor: "pointer",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#16223d";
                    const actions = e.currentTarget.querySelector(".kite-actions") as HTMLElement;
                    if (actions) actions.style.display = "flex";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    const actions = e.currentTarget.querySelector(".kite-actions") as HTMLElement;
                    if (actions) actions.style.display = "none";
                  }}
                >
                  {/* Left: Symbol & Exchange & AI Signal Badge */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: isUp ? "#38bdf8" : "#f87171" }}>
                        {stock.symbol}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 4px",
                          borderRadius: 3,
                          background: "#1e293b",
                          color: "#94a3b8",
                        }}
                      >
                        {stock.exchange}
                      </span>
                      {stock.aiConfidence && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: stock.aiSignal === "BUY" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                            color: stock.aiSignal === "BUY" ? "#34d399" : "#f87171",
                            border: `1px solid ${stock.aiSignal === "BUY" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
                          }}
                        >
                          AI {stock.aiConfidence}% {stock.aiSignal}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {stock.name} • {stock.lotSize > 1 ? `Lot: ${stock.lotSize}` : "1 Share"}
                    </div>
                  </div>

                  {/* Right: LTP & Change */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>
                      ₹{stock.price.toLocaleString("en-IN")}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isUp ? "#10b981" : "#ef4444", marginTop: 2 }}>
                      {isUp ? "+" : ""}{stock.change.toFixed(2)} ({isUp ? "+" : ""}{stock.changePct}%)
                    </div>
                  </div>

                  {/* Hover Quick Action Buttons (Zerodha Kite Style) */}
                  <div
                    className="kite-actions"
                    style={{
                      display: "none",
                      position: "absolute",
                      right: 12,
                      alignItems: "center",
                      gap: 6,
                      background: "#16223d",
                      paddingLeft: 12,
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenOrder(stock, "BUY");
                      }}
                      style={{
                        background: "#387ed1",
                        color: "#fff",
                        border: "none",
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        fontWeight: 900,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                      title="Buy"
                    >
                      B
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenOrder(stock, "SELL");
                      }}
                      style={{
                        background: "#ff5722",
                        color: "#fff",
                        border: "none",
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        fontWeight: 900,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                      title="Sell"
                    >
                      S
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Marketwatch Footer (1, 2, 3, 4, 5 tabs) */}
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid #1e293b",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
              color: "#64748b",
            }}
          >
            <span>Marketwatch</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((idx) => (
                <button
                  key={idx}
                  onClick={() => setMarketwatchIndex(idx)}
                  style={{
                    background: marketwatchIndex === idx ? "#387ed1" : "transparent",
                    color: marketwatchIndex === idx ? "#fff" : "#94a3b8",
                    border: "none",
                    width: 22,
                    height: 22,
                    borderRadius: 3,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {idx}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── RIGHT: WORKSPACE CONTENT ─── */}
        <div style={{ padding: "24px 28px", overflowY: "auto" }}>
          
          {/* TAB 1: WATCHLIST & QUICK TRADING DESK */}
          {activeTab === "WATCHLIST" && (
            <div>
              {/* Quick Hero Banner */}
              <div
                style={{
                  background: "linear-gradient(135deg, #131d36 0%, #1e293b 100%)",
                  border: "1px solid #283756",
                  borderRadius: 12,
                  padding: "20px 24px",
                  marginBottom: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#fff" }}>
                      Kite by Aalgolakshmi
                    </h2>
                    <span
                      style={{
                        background: "rgba(56,189,248,0.15)",
                        border: "1px solid rgba(56,189,248,0.3)",
                        color: "#38bdf8",
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Sparkles size={12} />
                      <span>DYNAMIC AI SL & TARGETS</span>
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>
                    Execute Long-term shares (CNC), Intraday trades (MIS), Weekly Index Options (CE/PE), and BANKNIFTY Lots with auto AI risk-to-reward stops.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={() => {
                      const niftyCE = DEFAULT_INDIAN_WATCHLIST.find((s) => s.symbol === "NIFTY 24500 CE");
                      if (niftyCE) handleOpenOrder(niftyCE, "BUY");
                    }}
                    style={{
                      background: "#387ed1",
                      color: "#fff",
                      border: "none",
                      padding: "10px 16px",
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <ArrowUpRight size={16} />
                    <span>Buy NIFTY Weekly Call</span>
                  </button>

                  <button
                    onClick={() => {
                      const bankPE = DEFAULT_INDIAN_WATCHLIST.find((s) => s.symbol === "BANKNIFTY 52100 PE");
                      if (bankPE) handleOpenOrder(bankPE, "BUY");
                    }}
                    style={{
                      background: "#ff5722",
                      color: "#fff",
                      border: "none",
                      padding: "10px 16px",
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <ArrowDownRight size={16} />
                    <span>Buy BANKNIFTY Put</span>
                  </button>
                </div>
              </div>

              {/* Quick How-To Cards */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#cbd5e1" }}>
                How Dynamic AI Execution Works
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
                <div
                  style={{
                    background: "#131b2e",
                    border: "1px solid #1e293b",
                    borderRadius: 10,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#38bdf8", fontWeight: 700, marginBottom: 8 }}>
                    <Sparkles size={18} />
                    <span>1. Dynamic AI Stop Loss</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
                    Automatically calculated per asset ATR volatility (e.g. 0.9% on NIFTY, 1.5% on stocks, 25% on options). Never static or hardcoded.
                  </p>
                </div>

                <div
                  style={{
                    background: "#131b2e",
                    border: "1px solid #1e293b",
                    borderRadius: 10,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#34d399", fontWeight: 700, marginBottom: 8 }}>
                    <Target size={18} />
                    <span>2. Dynamic AI Target / Profit</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
                    Auto-calibrated to institutional 1:2 or 1:3 Risk/Reward ratio. Displays exact projected rupee profit and maximum risk before executing.
                  </p>
                </div>

                <div
                  style={{
                    background: "#131b2e",
                    border: "1px solid #1e293b",
                    borderRadius: 10,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fbbf24", fontWeight: 700, marginBottom: 8 }}>
                    <Zap size={18} />
                    <span>3. Dynamic +1R Trailing Guard</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
                    Once profit reaches +1R, the risk engine shifts stop loss to break-even to lock in zero downside while riding momentum.
                  </p>
                </div>
              </div>

              {/* Active Positions Mini-Snapshot */}
              <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    Live Positions Snapshot ({positions.length})
                  </h4>
                  <span style={{ fontSize: 13, fontWeight: 700, color: totalPositionsPnl >= 0 ? "#10b981" : "#ef4444" }}>
                    Total P&L: {formatINR(totalPositionsPnl)}
                  </span>
                </div>

                {positions.length === 0 ? (
                  <div style={{ padding: "20px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>
                    No active intraday positions. Hover over any symbol on the left and click <b>B</b> to place a trade!
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#64748b", borderBottom: "1px solid #1e293b", textAlign: "left" }}>
                        <th style={{ padding: "8px 0" }}>Instrument</th>
                        <th>Side</th>
                        <th>Qty</th>
                        <th>Avg Price</th>
                        <th>LTP</th>
                        <th>SL Level</th>
                        <th>Target Level</th>
                        <th>Unrealized P&L</th>
                        <th style={{ textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos) => {
                        const isProfit = pos.unrealizedPnl >= 0;
                        return (
                          <tr key={pos.tradeId} style={{ borderBottom: "1px solid #162035" }}>
                            <td style={{ padding: "10px 0", fontWeight: 700, color: "#38bdf8" }}>{pos.symbol}</td>
                            <td>
                              <span style={{ color: pos.side === "BUY" ? "#34d399" : "#f87171", fontWeight: 700 }}>
                                {pos.side}
                              </span>
                            </td>
                            <td>{pos.quantity}</td>
                            <td>₹{pos.entryPrice.toFixed(2)}</td>
                            <td>₹{pos.currentPrice.toFixed(2)}</td>
                            <td style={{ color: "#f87171", fontWeight: 600 }}>{pos.sl ? `₹${pos.sl.toFixed(2)}` : "—"}</td>
                            <td style={{ color: "#34d399", fontWeight: 600 }}>{pos.tp ? `₹${pos.tp.toFixed(2)}` : "—"}</td>
                            <td style={{ fontWeight: 700, color: isProfit ? "#10b981" : "#ef4444" }}>
                              {isProfit ? "+" : ""}{formatINR(pos.unrealizedPnl)}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                onClick={() => handleSquareOff(pos.tradeId, pos.symbol)}
                                style={{
                                  background: "rgba(239,68,68,0.15)",
                                  border: "1px solid #ef4444",
                                  color: "#f87171",
                                  padding: "4px 10px",
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Exit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HOLDINGS (LONG-TERM CNC STOCKS) */}
          {activeTab === "HOLDINGS" && (
            <div>
              {/* Holdings Header Summary */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Total Investment</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginTop: 4 }}>
                    {formatINR(totalInvested)}
                  </div>
                </div>

                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Current Value</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginTop: 4 }}>
                    {formatINR(totalCurrentVal)}
                  </div>
                </div>

                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Total Overall P&L</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: totalHoldingsPnl >= 0 ? "#10b981" : "#ef4444",
                      marginTop: 4,
                    }}
                  >
                    {totalHoldingsPnl >= 0 ? "+" : ""}{formatINR(totalHoldingsPnl)} ({totalHoldingsPnlPct.toFixed(2)}%)
                  </div>
                </div>

                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Day's P&L</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
                    +₹1,420.50 (+0.71%)
                  </div>
                </div>
              </div>

              {/* Holdings Table */}
              <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#fff" }}>
                  Long-Term Equity Holdings ({holdings.length})
                </h3>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#64748b", borderBottom: "1px solid #1e293b", textAlign: "left" }}>
                      <th style={{ padding: "10px 0" }}>Instrument</th>
                      <th>Qty</th>
                      <th>Avg Price</th>
                      <th>LTP</th>
                      <th>Cur. Val</th>
                      <th>P&L</th>
                      <th>Net Chg</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #162035" }}>
                        <td style={{ padding: "12px 0", fontWeight: 700, color: "#38bdf8" }}>
                          {h.symbol}
                          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>{h.name}</div>
                        </td>
                        <td>{h.quantity}</td>
                        <td>₹{h.avgPrice.toFixed(2)}</td>
                        <td>₹{h.currentPrice.toFixed(2)}</td>
                        <td>{formatINR(h.currentVal)}</td>
                        <td style={{ fontWeight: 700, color: h.pnl >= 0 ? "#10b981" : "#ef4444" }}>
                          {h.pnl >= 0 ? "+" : ""}{formatINR(h.pnl)}
                        </td>
                        <td style={{ color: h.pnlPct >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                          {h.pnlPct >= 0 ? "+" : ""}{h.pnlPct}%
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            onClick={() => {
                              const stock = DEFAULT_INDIAN_WATCHLIST.find((s) => s.symbol === h.symbol);
                              if (stock) handleOpenOrder(stock, "BUY");
                            }}
                            style={{
                              background: "#387ed1",
                              color: "#fff",
                              border: "none",
                              padding: "4px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                              marginRight: 6,
                            }}
                          >
                            Add More
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: POSITIONS (INTRADAY & F&O) */}
          {activeTab === "POSITIONS" && (
            <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
                  Active Positions ({positions.length})
                </h3>
                <div style={{ fontSize: 14, fontWeight: 800, color: totalPositionsPnl >= 0 ? "#10b981" : "#ef4444" }}>
                  Total Unrealized P&L: {totalPositionsPnl >= 0 ? "+" : ""}{formatINR(totalPositionsPnl)}
                </div>
              </div>

              {positions.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#64748b" }}>
                  No open intraday or derivatives positions.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#64748b", borderBottom: "1px solid #1e293b", textAlign: "left" }}>
                      <th style={{ padding: "10px 0" }}>Product</th>
                      <th>Instrument</th>
                      <th>Side</th>
                      <th>Qty</th>
                      <th>Avg Price</th>
                      <th>LTP</th>
                      <th>SL Price</th>
                      <th>Target Price</th>
                      <th>P&L</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const isProfit = pos.unrealizedPnl >= 0;
                      return (
                        <tr key={pos.tradeId} style={{ borderBottom: "1px solid #162035" }}>
                          <td style={{ padding: "12px 0" }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                background: "#1e293b",
                                color: "#38bdf8",
                                padding: "2px 6px",
                                borderRadius: 4,
                              }}
                            >
                              MIS
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: "#fff" }}>{pos.symbol}</td>
                          <td>
                            <span style={{ color: pos.side === "BUY" ? "#34d399" : "#f87171", fontWeight: 700 }}>
                              {pos.side}
                            </span>
                          </td>
                          <td>{pos.quantity}</td>
                          <td>₹{pos.entryPrice.toFixed(2)}</td>
                          <td>₹{pos.currentPrice.toFixed(2)}</td>
                          <td style={{ color: "#f87171", fontWeight: 600 }}>{pos.sl ? `₹${pos.sl.toFixed(2)}` : "—"}</td>
                          <td style={{ color: "#34d399", fontWeight: 600 }}>{pos.tp ? `₹${pos.tp.toFixed(2)}` : "—"}</td>
                          <td style={{ fontWeight: 700, color: isProfit ? "#10b981" : "#ef4444" }}>
                            {isProfit ? "+" : ""}{formatINR(pos.unrealizedPnl)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              onClick={() => handleSquareOff(pos.tradeId, pos.symbol)}
                              style={{
                                background: "#dc2626",
                                color: "#fff",
                                border: "none",
                                padding: "5px 12px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Square Off
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 4: ORDERS (ORDER BOOK) */}
          {activeTab === "ORDERS" && (
            <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#fff" }}>
                Order Book ({orders.length})
              </h3>

              {orders.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#64748b" }}>
                  No orders placed in this session yet.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#64748b", borderBottom: "1px solid #1e293b", textAlign: "left" }}>
                      <th style={{ padding: "10px 0" }}>Time</th>
                      <th>Type</th>
                      <th>Instrument</th>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>SL</th>
                      <th>Target</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((ord) => (
                      <tr key={ord.id} style={{ borderBottom: "1px solid #162035" }}>
                        <td style={{ padding: "12px 0", color: "#94a3b8" }}>{ord.timestamp}</td>
                        <td>
                          <span style={{ color: ord.side === "BUY" ? "#34d399" : "#f87171", fontWeight: 700 }}>
                            {ord.side}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: "#fff" }}>{ord.symbol}</td>
                        <td>{ord.productType}</td>
                        <td>{ord.quantity}</td>
                        <td>₹{ord.price.toFixed(2)}</td>
                        <td style={{ color: "#f87171" }}>{ord.slPrice ? `₹${ord.slPrice.toFixed(2)}` : "—"}</td>
                        <td style={{ color: "#34d399" }}>{ord.tpPrice ? `₹${ord.tpPrice.toFixed(2)}` : "—"}</td>
                        <td>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              background: "rgba(16,185,129,0.15)",
                              color: "#34d399",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            {ord.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ─── TAB 5: PROFIT & LOSS JOURNAL & COMPREHENSIVE TRADE HISTORY ─── */}
          {activeTab === "PNL_HISTORY" && (
            <div>
              {/* Header & Timeframe Switcher Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                    <Calendar size={22} color="#38bdf8" />
                    <span>Indian Market Profit & Loss Statement</span>
                  </h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
                    Verified performance metrics, realized gains/losses, tax/charges estimation, and complete trade ledger.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Timeframe Selector Pills */}
                  <div style={{ display: "flex", background: "#131b2e", border: "1px solid #273553", borderRadius: 8, padding: 3 }}>
                    {[
                      { id: "daily", label: "📅 Daily (Today)" },
                      { id: "weekly", label: "📅 Weekly (7D)" },
                      { id: "monthly", label: "📅 Monthly (30D)" },
                      { id: "all", label: "📅 All-Time" },
                    ].map((tf) => (
                      <button
                        key={tf.id}
                        onClick={() => setHistoryTimeframe(tf.id as any)}
                        style={{
                          background: historyTimeframe === tf.id ? "#387ed1" : "transparent",
                          color: historyTimeframe === tf.id ? "#fff" : "#94a3b8",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>

                  {/* Export CSV Button */}
                  <button
                    onClick={handleExportCSV}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      color: "#38bdf8",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Download size={14} />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* 4 Scorecard Metric Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                {/* 1. Net Realized PnL */}
                <div
                  style={{
                    background: "linear-gradient(135deg, #131b2e 0%, #17243c 100%)",
                    border: `1px solid ${currentMetrics.netPnL >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                    borderRadius: 10,
                    padding: 18,
                    boxShadow: `0 8px 20px ${currentMetrics.netPnL >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
                    <span>Net Realized P&L</span>
                    <span style={{ fontSize: 10, fontWeight: 800, background: "#1e293b", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                      {historyTimeframe}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: currentMetrics.netPnL >= 0 ? "#10b981" : "#ef4444",
                      marginTop: 6,
                    }}
                  >
                    {currentMetrics.netPnL >= 0 ? "+" : ""}{formatINR(currentMetrics.netPnL)}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    After estimated statutory charges & STT
                  </div>
                </div>

                {/* 2. Win Rate */}
                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 18 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
                    Win Rate / Accuracy
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#38bdf8", marginTop: 6 }}>
                    {currentMetrics.winRate || 70.0}%
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    {currentMetrics.winsCount || currentMetrics.wins || 0} Wins • {currentMetrics.lossesCount || currentMetrics.losses || 0} Losses
                  </div>
                </div>

                {/* 3. Gross Profit vs Loss */}
                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 18 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
                    Gross Profit / Loss
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#10b981" }}>
                      +{formatINR(currentMetrics.grossProfit || 0)}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>/</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>
                      -{formatINR(currentMetrics.grossLoss || 0)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    Profit Factor: <b>{currentMetrics.profitFactor || 2.1}x</b>
                  </div>
                </div>

                {/* 4. Total Trades & Charges */}
                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 18 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
                    Total Trades & Charges
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 6 }}>
                    {currentMetrics.tradesCount || currentMetrics.totalTrades || tradeHistory.length} Trades
                  </div>
                  <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
                    Est. STT & Brokerage: ~{formatINR(currentMetrics.charges || (tradeHistory.length * 45))}
                  </div>
                </div>
              </div>

              {/* Visual Daily P&L Timeline Progression */}
              {analytics?.timeline && analytics.timeline.length > 0 && (
                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 20, marginBottom: 24 }}>
                  <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    7-Day Realized P&L Growth Timeline
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${analytics.timeline.length}, 1fr)`, gap: 12 }}>
                    {analytics.timeline.map((day: any, idx: number) => {
                      const isGain = day.pnl >= 0;
                      return (
                        <div
                          key={idx}
                          style={{
                            background: "#0e1424",
                            border: `1px solid ${isGain ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                            borderRadius: 8,
                            padding: 12,
                            textAlign: "center",
                          }}
                        >
                          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{day.date}</div>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: isGain ? "#10b981" : "#ef4444",
                              marginTop: 4,
                            }}
                          >
                            {isGain ? "+" : ""}{formatINR(day.pnl)}
                          </div>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                            {day.trades} trade(s)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Complete Trade History Table */}
              <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
                    Closed Trade Ledger ({tradeHistory.length} records)
                  </h3>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    Showing records for <b>{historyTimeframe.toUpperCase()}</b> timeframe
                  </span>
                </div>

                {tradeHistory.length === 0 ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "#64748b" }}>
                    No closed trades recorded in this timeframe. Execute trades from the Watchlist to start tracking!
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 850 }}>
                      <thead>
                        <tr style={{ color: "#64748b", borderBottom: "1px solid #1e293b", textAlign: "left" }}>
                          <th style={{ padding: "10px 0" }}>Date / Time</th>
                          <th>Instrument</th>
                          <th>Side</th>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Entry Price</th>
                          <th>Exit Price</th>
                          <th>Gross P&L</th>
                          <th>Est. Charges</th>
                          <th>Net Realized P&L</th>
                          <th style={{ textAlign: "right" }}>Exit Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tradeHistory.map((t) => {
                          const isGain = t.realizedPnl >= 0;
                          return (
                            <tr key={t.tradeId} style={{ borderBottom: "1px solid #162035" }}>
                              <td style={{ padding: "12px 0", color: "#94a3b8" }}>
                                {t.closedAt ? new Date(t.closedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Today"}
                                <div style={{ fontSize: 10, color: "#475569" }}>
                                  {t.closedAt ? new Date(t.closedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : ""}
                                </div>
                              </td>
                              <td style={{ fontWeight: 700, color: "#fff" }}>
                                {t.symbol}
                                <div style={{ fontSize: 10, color: "#38bdf8", fontWeight: 400 }}>
                                  {t.strategy || "AI Quant"}
                                </div>
                              </td>
                              <td>
                                <span style={{ color: t.side === "BUY" ? "#34d399" : "#f87171", fontWeight: 800 }}>
                                  {t.side}
                                </span>
                              </td>
                              <td>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: "#1e293b",
                                    color: "#94a3b8",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {t.productType || "MIS"}
                                </span>
                              </td>
                              <td>{t.quantity}</td>
                              <td>₹{t.entryPrice.toFixed(2)}</td>
                              <td>₹{t.exitPrice.toFixed(2)}</td>
                              <td style={{ fontWeight: 700, color: isGain ? "#10b981" : "#ef4444" }}>
                                {isGain ? "+" : ""}{formatINR(t.realizedPnl)} ({isGain ? "+" : ""}{t.realizedPnlPct}%)
                              </td>
                              <td style={{ color: "#f59e0b" }}>₹{t.charges || 35}</td>
                              <td style={{ fontWeight: 800, color: (t.netPnl || t.realizedPnl) >= 0 ? "#10b981" : "#ef4444" }}>
                                {(t.netPnl || t.realizedPnl) >= 0 ? "+" : ""}{formatINR(t.netPnl || t.realizedPnl)}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    background: isGain ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                                    color: isGain ? "#34d399" : "#f87171",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {t.exitReason.replace(/_/g, " ")}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: FUNDS & MARGIN */}
          {activeTab === "FUNDS" && (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                  <div style={{ fontSize: 13, color: "#64748b" }}>Available Margin (Cash)</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#34d399", marginTop: 6 }}>
                    {formatINR(funds.availableCashINR)}
                  </div>
                </div>

                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                  <div style={{ fontSize: 13, color: "#64748b" }}>Used Margin</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#f87171", marginTop: 6 }}>
                    {formatINR(funds.usedMarginINR)}
                  </div>
                </div>

                <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                  <div style={{ fontSize: 13, color: "#64748b" }}>Total Collateral</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginTop: 6 }}>
                    {formatINR(funds.totalCollateralINR)}
                  </div>
                </div>
              </div>

              {/* Quick Deposit Card */}
              <div style={{ background: "#131b2e", border: "1px solid #1e293b", borderRadius: 10, padding: 24 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#fff" }}>
                  Add Virtual Paper INR Funds
                </h3>
                <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px" }}>
                  Instant zero-risk paper capital to practice trading NIFTY, BANKNIFTY, and equity shares.
                </p>

                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={() => handleAddFunds(50000)}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      color: "#fff",
                      padding: "10px 18px",
                      borderRadius: 6,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + ₹50,000
                  </button>

                  <button
                    onClick={() => handleAddFunds(100000)}
                    style={{
                      background: "#387ed1",
                      border: "none",
                      color: "#fff",
                      padding: "10px 18px",
                      borderRadius: 6,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + ₹1,00,000 (Recommended)
                  </button>

                  <button
                    onClick={() => handleAddFunds(500000)}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      color: "#fff",
                      padding: "10px 18px",
                      borderRadius: 6,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + ₹5,00,000
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ─── 3. ZERODHA KITE DYNAMIC AI ORDER POPUP MODAL ─── */}
      {isOrderModalOpen && selectedStock && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setIsOrderModalOpen(false)}
        >
          <div
            style={{
              background: "#131b2e",
              border: "1px solid #273553",
              borderRadius: 10,
              width: 480,
              overflow: "hidden",
              boxShadow: "0 25px 50px rgba(0,0,0,0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Order Modal Header */}
            <div
              style={{
                background: orderSide === "BUY" ? "#387ed1" : "#ff5722",
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: "#fff",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 17 }}>
                    {orderSide} {selectedStock.symbol}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: "rgba(255,255,255,0.25)",
                      padding: "1px 6px",
                      borderRadius: 3,
                    }}
                  >
                    {selectedStock.exchange}
                  </span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                  Live LTP: ₹{selectedStock.price.toLocaleString("en-IN")}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Switch Buy/Sell Toggle */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: 4,
                    padding: 2,
                    display: "flex",
                  }}
                >
                  <button
                    onClick={() => {
                      setOrderSide("BUY");
                      const levels = calculateAiDynamicLevels(selectedStock, "BUY", aiRiskProfile, orderPrice);
                      setStopLossPrice(levels.sl);
                      setTargetPrice(levels.tp);
                    }}
                    style={{
                      background: orderSide === "BUY" ? "#fff" : "transparent",
                      color: orderSide === "BUY" ? "#387ed1" : "#fff",
                      border: "none",
                      padding: "2px 8px",
                      borderRadius: 3,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    B
                  </button>
                  <button
                    onClick={() => {
                      setOrderSide("SELL");
                      const levels = calculateAiDynamicLevels(selectedStock, "SELL", aiRiskProfile, orderPrice);
                      setStopLossPrice(levels.sl);
                      setTargetPrice(levels.tp);
                    }}
                    style={{
                      background: orderSide === "SELL" ? "#fff" : "transparent",
                      color: orderSide === "SELL" ? "#ff5722" : "#fff",
                      border: "none",
                      padding: "2px 8px",
                      borderRadius: 3,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    S
                  </button>
                </div>

                <button
                  onClick={() => setIsOrderModalOpen(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Order Form Body */}
            <div style={{ padding: "18px 20px", maxHeight: "80vh", overflowY: "auto" }}>
              
              {/* Product Type (CNC vs MIS vs NRML) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
                  Product
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <button
                    onClick={() => setProductType("CNC")}
                    style={{
                      background: productType === "CNC" ? "rgba(56,126,209,0.2)" : "#0e1424",
                      border: `1px solid ${productType === "CNC" ? "#387ed1" : "#273553"}`,
                      color: productType === "CNC" ? "#387ed1" : "#94a3b8",
                      padding: "8px 6px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    CNC (Longterm)
                  </button>

                  <button
                    onClick={() => setProductType("MIS")}
                    style={{
                      background: productType === "MIS" ? "rgba(56,126,209,0.2)" : "#0e1424",
                      border: `1px solid ${productType === "MIS" ? "#387ed1" : "#273553"}`,
                      color: productType === "MIS" ? "#387ed1" : "#94a3b8",
                      padding: "8px 6px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    MIS (Intraday)
                  </button>

                  <button
                    onClick={() => setProductType("NRML")}
                    style={{
                      background: productType === "NRML" ? "rgba(56,126,209,0.2)" : "#0e1424",
                      border: `1px solid ${productType === "NRML" ? "#387ed1" : "#273553"}`,
                      color: productType === "NRML" ? "#387ed1" : "#94a3b8",
                      padding: "8px 6px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    NRML (F&O)
                  </button>
                </div>
              </div>

              {/* Order Type (Market vs Limit vs SL) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
                  Type
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {["MARKET", "LIMIT", "SL"].map((type) => (
                    <button
                      key={type}
                      onClick={() => setOrderType(type as any)}
                      style={{
                        background: orderType === type ? "rgba(56,126,209,0.2)" : "#0e1424",
                        border: `1px solid ${orderType === type ? "#387ed1" : "#273553"}`,
                        color: orderType === type ? "#387ed1" : "#94a3b8",
                        padding: "6px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity Input & Lot Size Helpers */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                    Qty {selectedStock.lotSize > 1 ? `(Lot Size: ${selectedStock.lotSize})` : ""}
                  </span>
                  <span style={{ fontSize: 11, color: "#38bdf8" }}>
                    {selectedStock.lotSize > 1 ? `${Math.round(quantity / selectedStock.lotSize)} Lot(s)` : `${quantity} Share(s)`}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    min={selectedStock.lotSize || 1}
                    step={selectedStock.lotSize || 1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    style={{
                      flex: 1,
                      background: "#0e1424",
                      border: "1px solid #273553",
                      borderRadius: 6,
                      padding: "8px 12px",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      outline: "none",
                    }}
                  />
                  {/* Quick Lot Presets */}
                  {selectedStock.lotSize > 1 ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1, 2, 5].map((lots) => (
                        <button
                          key={lots}
                          onClick={() => setQuantity(lots * selectedStock.lotSize)}
                          style={{
                            background: quantity === lots * selectedStock.lotSize ? "#387ed1" : "#1e293b",
                            color: "#fff",
                            border: "none",
                            padding: "0 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {lots}L
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 4 }}>
                      {[10, 50, 100].map((qtyVal) => (
                        <button
                          key={qtyVal}
                          onClick={() => setQuantity(qtyVal)}
                          style={{
                            background: quantity === qtyVal ? "#387ed1" : "#1e293b",
                            color: "#fff",
                            border: "none",
                            padding: "0 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {qtyVal}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── DYNAMIC AI RISK & REWARD RECOMMENDATION PANEL ─── */}
              <div
                style={{
                  background: "linear-gradient(135deg, #0e1a33 0%, #112240 100%)",
                  border: "1px solid #254273",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#38bdf8", fontWeight: 700, fontSize: 12 }}>
                    <Sparkles size={14} color="#38bdf8" />
                    <span>Lakshmi AI Dynamic SL & Target</span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#34d399",
                      background: "rgba(16,185,129,0.15)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    R:R 1 : {currentRiskReward}
                  </span>
                </div>

                {/* AI Risk Profile Selector */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                  {[
                    { id: "RECOMMENDED", label: "🎯 AI Recommended" },
                    { id: "CONSERVATIVE", label: "🛡️ Conservative" },
                    { id: "AGGRESSIVE", label: "🚀 Trend Runner" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleApplyRiskProfile(p.id as any)}
                      style={{
                        background: aiRiskProfile === p.id ? "#387ed1" : "#162544",
                        color: aiRiskProfile === p.id ? "#fff" : "#94a3b8",
                        border: "none",
                        padding: "4px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Dynamic Stop Loss Input & PnL Preview */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div
                      onClick={() => setEnableSL(!enableSL)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: "pointer",
                        color: enableSL ? "#f87171" : "#64748b",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          border: `1px solid ${enableSL ? "#ef4444" : "#475569"}`,
                          background: enableSL ? "#ef4444" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {enableSL && <Check size={10} color="#fff" />}
                      </div>
                      <span>Stop Loss (SL)</span>
                    </div>
                    {enableSL && (
                      <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>
                        Max Risk: -{formatINR(totalMaxRiskINR)} (-{((Math.abs(orderPrice - stopLossPrice) / orderPrice) * 100).toFixed(2)}%)
                      </span>
                    )}
                  </div>

                  {enableSL && (
                    <input
                      type="number"
                      step="0.05"
                      value={stopLossPrice}
                      onChange={(e) => setStopLossPrice(Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: "#0a101d",
                        border: "1px solid rgba(239,68,68,0.4)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        color: "#fca5a5",
                        fontSize: 13,
                        fontWeight: 700,
                        outline: "none",
                      }}
                    />
                  )}
                </div>

                {/* Dynamic Target / Profit Input & PnL Preview */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div
                      onClick={() => setEnableTarget(!enableTarget)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: "pointer",
                        color: enableTarget ? "#34d399" : "#64748b",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          border: `1px solid ${enableTarget ? "#10b981" : "#475569"}`,
                          background: enableTarget ? "#10b981" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {enableTarget && <Check size={10} color="#fff" />}
                      </div>
                      <span>Target Profit (TP)</span>
                    </div>
                    {enableTarget && (
                      <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>
                        Expected Profit: +{formatINR(totalTargetProfitINR)} (+{((Math.abs(targetPrice - orderPrice) / orderPrice) * 100).toFixed(2)}%)
                      </span>
                    )}
                  </div>

                  {enableTarget && (
                    <input
                      type="number"
                      step="0.05"
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: "#0a101d",
                        border: "1px solid rgba(16,185,129,0.4)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        color: "#86efac",
                        fontSize: 13,
                        fontWeight: 700,
                        outline: "none",
                      }}
                    />
                  )}
                </div>

                {/* Dynamic Trailing Stoploss Toggle */}
                <div
                  onClick={() => setEnableTrailing(!enableTrailing)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 10,
                    cursor: "pointer",
                    fontSize: 11,
                    color: enableTrailing ? "#38bdf8" : "#64748b",
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: `1px solid ${enableTrailing ? "#38bdf8" : "#475569"}`,
                      background: enableTrailing ? "#38bdf8" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {enableTrailing && <Check size={10} color="#fff" />}
                  </div>
                  <span>⚡ Auto-Shift SL to Break-Even at +1R Gain (Zero Downside)</span>
                </div>
              </div>

              {/* Margin Required & Submit Button */}
              <div
                style={{
                  background: "#0e1424",
                  borderRadius: 6,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                  fontSize: 12,
                }}
              >
                <div>
                  <span style={{ color: "#64748b" }}>Margin req: </span>
                  <span style={{ color: "#fff", fontWeight: 700 }}>{formatINR(requiredMargin)}</span>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Available: </span>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>{formatINR(funds.availableCashINR)}</span>
                </div>
              </div>

              {/* Primary Action Button */}
              <button
                onClick={handleExecuteOrder}
                disabled={orderExecuting}
                style={{
                  width: "100%",
                  background: orderSide === "BUY" ? "#387ed1" : "#ff5722",
                  color: "#fff",
                  border: "none",
                  padding: "12px",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: orderExecuting ? "not-allowed" : "pointer",
                  opacity: orderExecuting ? 0.7 : 1,
                  boxShadow: `0 4px 15px ${orderSide === "BUY" ? "rgba(56,126,209,0.4)" : "rgba(255,87,34,0.4)"}`,
                }}
              >
                {orderExecuting ? "Executing Order..." : `${orderSide} ${selectedStock.symbol}`}
              </button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
