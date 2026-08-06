# AQEA V10.3 UI Implementation Plan

## Phase 1: Foundation & Layout Setup
1. **Routing:** Add new routes to `App.tsx` (e.g., `/institutional`, `/observability`, `/attribution`, `/risk`, `/paper`).
2. **Layout Wrapper:** Build `InstitutionalLayout.tsx` providing a fixed sidebar with navigation links and a top `GlobalStatusBar.tsx`.
3. **Theming:** Ensure `tailwind.config.cjs` and global CSS support the institutional slate/dark color palette (slate-900 backgrounds, emerald/rose accents).

## Phase 2: Page Implementation

### 2.1 Command Center (`CommandCenterPage.tsx`)
- Fetch data from `/api/aqea-governance/observability` and `/api/trading/open-positions`.
- Build Grid layout with standard summary widgets (Equity, PnL, Win Rate, Profit Factor, Regime).
- Integrate a live positions table.

### 2.2 AI Observability (`AIObservabilityPage.tsx`)
- Fetch data from `/api/aqea-governance/summary` and `/api/aqea-attribution/stats`.
- Implement Recharts visualizers for Prediction Distribution and Model Drift.
- Display health status cards for CNN, PPO, and Transformer.

### 2.3 Trade Attribution (`TradeAttributionPage.tsx`)
- Fetch data from `/api/aqea-attribution`.
- Build a comprehensive, paginated data table to display timestamp, symbol, direction, entry, exit, PnL, CNN Confidence, OF Score, SM Score, Regime, and Final Score.
- Do NOT implement any trade execution/override actions on this table (read-only constraint).

### 2.4 Risk Center (`RiskCenterPage.tsx`)
- Fetch data from `/api/aqea-governance/observability` (risk object).
- Implement Exposure Donut and Portfolio Heat charts.
- Build a simple log component for risk alerts/violations.

### 2.5 Paper Trading Monitor (`PaperMonitorPage.tsx`)
- Fetch data from `/api/aqea-governance/paper`.
- Display progress bar towards the 100-trade goal.
- Map the API response metrics (Win Rate, Profit Factor, Expectancy, Sharpe) into a clean dashboard view.
- Highlight the Benchmark Drift delta visually (green for positive drift, red for negative).

## Phase 3: Integration & Polish
1. **WebSocket Hooking:** Ensure `useWebSocket` or equivalent existing socket logic is plugged into the new widgets where real-time updates are needed (e.g., live pricing for open positions).
2. **Component Refactoring:** Move repetitive UI patterns (e.g., Metric Cards) into shared components in `client/src/components/ui/`.
3. **Testing:** Verify all routes render correctly and data fetches successfully without breaking existing application routes.
