# AQEA V10.3 UI Component Map

## Root Layout
- `InstitutionalLayout.tsx`
  - `SidebarNav.tsx` (Links to the 5 main pages)
  - `GlobalStatusBar.tsx` (Connection, Mode, Time)

## Page 1: Command Center (`CommandCenterPage.tsx`)
- `EquityWidget.tsx` (Total Equity, Available Capital)
- `PnLWidget.tsx` (Daily PnL, Weekly PnL)
- `PerformanceWidget.tsx` (Win Rate, Profit Factor)
- `PortfolioHeatMap.tsx` (Recharts Treemap or Bar chart of exposure)
- `RegimeIndicator.tsx` (Current Market Regime status)
- `OpenPositionsTable.tsx` (List of currently active trades)

## Page 2: AI Observability (`AIObservabilityPage.tsx`)
- `ModelHealthGrid.tsx` (Cards for CNN, PPO, Transformer status)
- `ModelDriftChart.tsx` (Recharts Line/Bar chart showing drift over time)
- `PredictionDistributionPie.tsx` (Recharts Pie showing LONG/SHORT/HOLD splits)
- `ConfidenceHistogram.tsx` (Recharts Bar chart showing confidence buckets)
- `InferenceLatencyWidget.tsx` (Average response times)

## Page 3: Trade Attribution (`TradeAttributionPage.tsx`)
- `AttributionDataTable.tsx` (Data table with the following columns)
  - Timestamp, Symbol
  - Direction, Entry, Exit, PnL
  - CNN Confidence, OF Score, SM Score, Regime
  - Final Decision Score
- `AttributionFilterBar.tsx` (Filters for Regime, Symbol, Direction)

## Page 4: Risk Center (`RiskCenterPage.tsx`)
- `ExposureDonut.tsx` (Recharts Donut chart of utilized vs free capital)
- `PositionLimitsWidget.tsx` (Current usage vs max allowed)
- `SectorConcentrationChart.tsx` (Recharts Bar chart)
- `DrawdownTracker.tsx` (Recharts Line chart of equity peak-to-trough)
- `RiskViolationsLog.tsx` (List of blocked trades or alerts)

## Page 5: Paper Trading Monitor (`PaperMonitorPage.tsx`)
- `PaperProgressWidget.tsx` (Trade count progress bar towards 100)
- `InstitutionalMetricsCard.tsx` (WR, PF, Expectancy, Sharpe)
- `BenchmarkDriftCard.tsx` (Comparison vs V9.2 baseline)
- `RegimeBreakdownChart.tsx` (Performance segmented by market regime)
- `SymbolBreakdownChart.tsx` (Performance segmented by asset)
