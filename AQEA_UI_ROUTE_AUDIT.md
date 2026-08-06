# AQEA UI ROUTE AUDIT

| ROUTE | COMPONENT | RENDERED | UNUSED | EVIDENCE |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `HomePage` | YES | NO | `App.tsx:73` |
| `/aqea` | `Dashboard` | YES | NO | `App.tsx:74` |
| `/aqea/strategy` | `StrategyAI` | YES | NO | `App.tsx:83` |
| `/aqea/risk-center` | `RiskCenterV8` | YES | NO | `App.tsx:84` |
| `/aqea/wallet` | `WalletCenter` | YES | NO | `App.tsx:85` |
| `/aqea/pnl` | `PnLCenter` | YES | NO | `App.tsx:86` |
| `/aqea/sentiment` | `MarketSentiment` | YES | NO | `App.tsx:87` |
| `/aqea/guard` | `CapitalGuard` | YES | NO | `App.tsx:88` |
| `/aqea/health` | `SystemHealth` | YES | NO | `App.tsx:89` |
| `/aqea/orders` | `OrdersPage` | YES | NO | `App.tsx:90` |
| `/aqea/positions` | `Positions` | YES | NO | `App.tsx:91` |
| `/aqea/history` | `TradeHistory` | YES | NO | `App.tsx:94` |
| `/aqea/forecast` | `ForecastCenter` | YES | NO | `App.tsx:95` |
| `/aqea/replay` | `ReplayDashboard` | YES | NO | `App.tsx:96` |
| `/aqea/shadow` | `ShadowDashboard` | YES | NO | `App.tsx:97` |
| `/aqea/intelligence` | `SymbolIntelligencePage` | YES | NO | `App.tsx:92` |
| `/aqea/ai` | `AIMatrix` | YES | NO | `App.tsx:93` |
| `/aqea/logs` | `LiveLogs` | YES | NO | `App.tsx:98` |
| `/backtest` | `BacktestPage` | YES | NO | `App.tsx:109` |
| `/settings` | `SettingsPage` | YES | NO | `App.tsx:110` |
| `/wallet` | `WalletPage` | YES | NO | `App.tsx:111` |
| `/institutional` | `InstitutionalCommandCenter` | YES | NO | `App.tsx:100` |
| `/institutional/command` | `InstitutionalCommandCenter` | YES | NO | `App.tsx:101` |
| `/institutional/ai` | `AIObservability` | YES | NO | `App.tsx:102` |
| `/institutional/attribution` | `TradeAttribution` | YES | NO | `App.tsx:103` |
| `/institutional/risk` | `InstitutionalRiskCenter` | YES | NO | `App.tsx:104` |
| `/institutional/paper` | `PaperTradingMonitor` | YES | NO | `App.tsx:105` |
| `/aqea (Operations Hub?)` | `Dashboard` | UNVERIFIED | - | No literal match for "Operations Hub" in code. |

## ═══════════════════════════════════════════════
## VERIFICATION ANSWERS
## ═══════════════════════════════════════════════

1. **Which page is actually loaded at `/aqea`?**
   `Dashboard.tsx`
   Evidence: `client/src/App.tsx:74`

2. **Is Dashboard.tsx used?**
   YES. It is mapped to `/aqea`.
   Evidence: `client/src/App.tsx:74`

3. **Is HomePage.tsx used?**
   YES. It is mapped to `/`.
   Evidence: `client/src/App.tsx:73`

4. **Is InstitutionalCommandCenter.tsx used?**
   YES. It is mapped to `/institutional` and `/institutional/command`.
   Evidence: `client/src/App.tsx:100, 101`

5. **Which route renders Operations Hub?**
   UNVERIFIED. No component or route is explicitly named "Operations Hub". However, `/aqea` (Mission Control) or `/institutional` (Command Center) are the primary operational entry points.

6. **Which route renders Dashboard?**
   `/aqea`
   Evidence: `client/src/App.tsx:74`

7. **Which pages are unreachable?**
   Most pages are reachable via `Sidebar.tsx` or `InstitutionalLayout.tsx`. However, `/aqea/logs` and some deeper institutional sub-routes might only be reachable if the specific Sidebar/Layout is active. `Dashboard.tsx` is only reachable via `/aqea`, while `/` leads to `HomePage.tsx`.
