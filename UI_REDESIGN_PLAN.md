# UI_REDESIGN_PLAN.md

AALGOLAKSHMI — Institutional Terminal Redesign
Generated: 2026-06-24

---

## 1. Top 10 Current UI Problems

### P1 — Navigation Sprawl (20 sidebar items)
`Sidebar.tsx` lists 20 nav items in a single flat list with no grouping. Items like "Shadow Testing", "Replay Center", "Symbol Intel", "Ghost", and "Forecast Center" are specialised tools presented at equal weight to core sections. A trader cannot parse the hierarchy.

### P2 — Dual Layout Systems (Bootstrap + Tailwind collision)
Every file mixes Bootstrap utility classes (`d-flex`, `container-fluid`, `col-12`, `btn`, `dropdown`) with Tailwind classes (`flex`, `grid`, `text-sm`, `font-mono`, `tracking-widest`) in the same JSX tree. The result: two competing box models, two spacing scales, two type scales in one component. `Dashboard.tsx` alone has `flex flex-col` alongside `d-flex flex-column`.

### P3 — 140px of Dead Chrome at the Top
MarketRibbon is `56px` + TopBar is `84px` = `140px` consumed before any content renders. On a 1080p display that is 13% of vertical space lost to chrome on every single page. The TopBar additionally `sticky-top`s at `top: 56px`, which means it scrolls away when the ribbon scrolls, breaking its own sticky intent.

### P4 — Hardcoded Mock Data in Production UI
`TopBar.tsx` has a `mockAlerts` array with fabricated data (`'BTCUSDT LONG EXECUTED'`, `'2m ago'`) rendered in the live alert dropdown. `AIMatrix.tsx` hardcodes model accuracy percentages (`92.4%`, `88.1%`). The user avatar always shows `"JD"` and the node label is always `"Institutional Node_04"`. None of this is real.

### P5 — "TEST RESET" Button Visible in Production Topbar
`TopBar.tsx` renders a yellow `TEST RESET` button at the top of every page that calls `resetWallet()` on confirmation. This is a destructive engineering tool permanently visible to the user in every session.

### P6 — Route Proliferation Across 3 Namespaces
Routes are split across `/`, `/aqea/*`, `/institutional/*`, `/backtest`, `/settings`, `/wallet`. The `/institutional/*` routes render inside `InstitutionalLayout` which is a nested layout inside the main layout — creating double-sidebar, double-header territory. There are 25+ routes for 7 logical sections.

### P7 — Orphaned and Duplicate Pages
`RiskCenter.tsx` and `RiskCenterV8.tsx` both exist; only V8 is routed. `WalletPage.tsx` and `WalletCenter.tsx` both exist; both are routed to different paths. `AQEAAnalytics.tsx`, `AICommandCenter.tsx`, and `CapitalGuard.tsx` exist but have no route in `App.tsx`. Dead surface area with no navigation path.

### P8 — Inconsistent Card Identity
Three distinct card patterns are used interchangeably:
- `.card` (Bootstrap default, white background)
- `.card-modern` (custom CSS class in `index.css`)
- Inline Tailwind borders with `bg-white`/`bg-light`

The same page (`Dashboard.tsx`) uses all three. There is no single `<Card>` component used consistently; the existing `ui/Card.tsx` wraps `.card` but is rarely imported.

### P9 — No Right-Side Signal Panel
All AI decisions, AQEA scores, and signal context appear inside full-page views (`AIMatrix`, `StrategyAI`). An institutional terminal requires a persistent, collapsible right-panel showing live AI signals alongside whatever the trader is viewing — so they never have to navigate away from positions to see why AQEA fired.

### P10 — EMERGENCY STOP has no Real Effect
`TopBar.tsx` renders a red `EMERGENCY STOP` button that calls `confirm("EMERGENCY_STOP: Pause all new entries?")` — a browser dialog — and does nothing on confirmation. No API call, no state update, no action.

---

## 2. Proposed Information Architecture

### Collapsed to 7 Primary Sections

| Section | Route | Source Pages (consolidated) |
|---------|-------|-----------------------------|
| Dashboard | `/` | `Dashboard.tsx` + `HomePage.tsx` |
| Portfolio | `/portfolio` | `WalletCenter.tsx` + `PnLCenter.tsx` + `TradeHistory.tsx` |
| Positions | `/positions` | `Positions.tsx` |
| Orders | `/orders` | `OrdersPage.tsx` |
| AQEA AI | `/ai` | `AIMatrix.tsx` + `StrategyAI.tsx` + `AIObservability.tsx` |
| Risk Center | `/risk` | `RiskCenterV8.tsx` + `CapitalGuard.tsx` + `InstitutionalRiskCenter.tsx` |
| Settings | `/settings` | `SettingsPage.tsx` |

Secondary tools (Backtest, Shadow, Replay, Symbol Intel, Live Logs) move to **sub-tabs** inside the sections they belong to, not standalone routes.

### Navigation Tiers
- **Tier 1 — Sidebar icons**: 7 items only. Icon + tooltip on hover.
- **Tier 2 — Section sub-tabs**: Tabs at the top of each section page (e.g. Portfolio → `Overview | P&L | History`).
- **Tier 3 — Right panel**: Live AQEA signal feed, collapsible, persists across navigation.

---

## 3. ASCII Wireframe

### 3.1 — Full Desktop Layout (1440px)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  MARKET RIBBON  BTC $97,420 ▲+2.1%  ETH $3,841 ▲+1.4%  SOL $187 ▼-0.3% ─ compact │ 40px
├───┬─────────────────────────────────────────────────────────────┬───────────────────┤
│   │ HEADER BAR                                                  │                   │ 52px
│ S │  Equity: $12,840   Daily P&L: +$284   Heat: 18%  ● ONLINE  │  🔔 [⚡ E-STOP]  │
│ I ├─────────────────────────────────────────────────────────────┤   AI SIGNAL PANEL │
│ D │                                                             │                   │
│ E │  MAIN CONTENT AREA  (route-dependent)                       │  ╔═══════════════╗│
│ B │                                                             │  ║ AQEA LIVE     ║│
│ A │  Example: Dashboard                                         │  ║ ─────────────  ║│
│ R │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │  ║ BTCUSDT       ║│
│   │  │ Total P&L  │ │Open Pos.   │ │Win Rate    │ │Sharpe    │ │  ║ LONG  87%     ║│
│ 6 │  │ +$1,284    │ │  3         │ │  62%       │ │  1.42    │ │  ║ TP1: $97,900  ║│
│ 4 │  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │  ║ SL:  $96,100  ║│
│ p │                                                             │  ╠═══════════════╣│
│ x │  ┌───────────────────────────┐  ┌──────────────────────┐   │  ║ ETHUSDT       ║│
│   │  │ PRICE CHART (Highcharts)  │  │ AI DECISION TIMELINE  │   │  ║ HOLD  51%     ║│
│ i │  │                           │  │                       │   │  ║               ║│
│ c │  │  [TF: 5m 15m 1h 4h 1D]   │  │ 14:22 LONG  BTC  87% │   │  ╠═══════════════╣│
│ o │  │                           │  │ 14:17 HOLD  ETH  51% │   │  ║ SOLUSDT       ║│
│ n │  │  [Candlestick + EMA]      │  │ 14:12 SHORT SOL  73% │   │  ║ SHORT 73%     ║│
│   │  │                           │  │                       │   │  ║ TP1: $184.20  ║│
│ r │  └───────────────────────────┘  └──────────────────────┘   │  ║ SL:  $189.50  ║│
│ a │                                                             │  ╠═══════════════╣│
│ i │  ┌──────────────────────────────────────────────────────┐   │  ║ Heat: 18% 🟢  ║│
│ l │  │ OPEN POSITIONS (compact table, live P&L)              │   │  ║ Kelly: 5.6%   ║│
│   │  │ Symbol  Side  Entry    Current   P&L     R   Action   │   │  ║ Exposure: $2.3k║│
│ 7 │  │ BTCUSD  LONG  97,100  97,420   +$96    0.6R [Manage] │   │  ╚═══════════════╝│
│   │  └──────────────────────────────────────────────────────┘   │  [◀ Collapse]     │
│ i │                                                             │                   │
│ c │                                                             │                   │
│ o │                                                             │                   │
│ n │                                                             │                   │
│ s │                                                             │                   │
└───┴─────────────────────────────────────────────────────────────┴───────────────────┘
```

### 3.2 — Sidebar Detail (64px icon rail)

```
┌──────────────┐
│   A  AQEA    │  ← Brand mark (collapsed: just "A")
├──────────────┤
│  ▪ Dashboard │  ← Active: filled accent bg, white icon
│  ▪ Portfolio │
│  ▪ Positions │
│  ▪ Orders    │
│  ▪ AQEA AI   │
│  ▪ Risk      │
│  ▪ Settings  │
├──────────────┤
│  ─────────── │
│  ● PAPER     │  ← Mode badge (PAPER/LIVE)
│  ◉ Online    │  ← System status dot
└──────────────┘
```

### 3.3 — Dashboard Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Dashboard]                                Mode: PAPER ▼  Symbol: ▼  │
├──────────┬──────────┬──────────┬──────────────────────────────────────┤
│  Equity  │ Daily P&L│ Open P&L │  Heat  │ Win Rate │ Sharpe │ Trades  │  ← KPI strip
│ $12,840  │  +$284   │  +$96   │  18%   │  62%     │  1.42  │  47     │
├──────────┴──────────┴──────────┴──────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐ │
│  │  PRICE CHART                    │  │  AQEA DECISION LOG           │ │
│  │  [5m] [15m] [1h] [4h] [1D]     │  │  14:22 BTCUSDT  LONG  87%   │ │
│  │                                 │  │  14:17 ETHUSDT  HOLD  51%   │ │
│  │  ████▓░░░░████▓████             │  │  14:12 SOLUSDT  SHORT 73%   │ │
│  │                                 │  │  ─────────────────────────  │ │
│  │  [Indicators toggle]            │  │  CNN ■ PPO ■ TRANSFORMER ■  │ │
│  └─────────────────────────────────┘  └─────────────────────────────┘ │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  OPEN POSITIONS                                              [+]  │ │
│  │  Symbol    Side  Entry     Current    Unreal P&L   R      Actions │ │
│  │  BTCUSDT   LONG  $97,100  $97,420    +$96 (+0.3%) 0.6R  [Close] │ │
│  │  SOLUSDT  SHORT   $189.5   $187.2    +$46 (+1.2%) 0.8R  [Close] │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.4 — AQEA AI Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [AQEA AI]       Tabs: [Models] [Strategy] [Observability] [Shadow]    │
├──────────────────────────────────────────────────────────────────────┤
│  [Models tab]                                                          │
│                                                                        │
│  ┌────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │  MODEL REGISTRY        │  │  VOTING CONSENSUS (live)              │ │
│  │                        │  │                                       │ │
│  │  CNN_V1   ● 92ms  ✓   │  │  BTCUSDT LONG                        │ │
│  │  PPO_V2   ● 12ms  ✓   │  │  CNN ████████  78%                   │ │
│  │  TRANSF   ● 36ms  ✓   │  │  PPO ██████    62%                   │ │
│  │  MAMBA    ○ --    ✗   │  │  TRF ███████   71%                   │ │
│  │  OF_ENG   ● 2ms   ✓   │  │  ─────────────────────────────────── │ │
│  │  SMC      ● 8ms   ✓   │  │  Consensus  →  LONG  87%             │ │
│  │  WHALE    ● 1.2s  ✓   │  │  Kelly Fraction: +0.11               │ │
│  │                        │  │  Position Size: $136 (1.1% balance)  │ │
│  └────────────────────────┘  └──────────────────────────────────────┘ │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  ANIMAL BEHAVIOUR WEIGHTS (sliders from Settings, read here)      │ │
│  │  Eagle ████░  75    Tiger ██░░  45    Cheetah ████  80           │ │
│  │  Fox   ███░░  60    Owl   ██░░  40    Lion    ████  70           │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.5 — Risk Center Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Risk Center]   Tabs: [Overview] [Exposure] [Drawdown] [Limits]       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────────────┐│
│  │ Heat     │ │ Daily DD │ │ VaR (95%)    │ │ Kelly Fraction        ││
│  │  18% 🟢  │ │ -0.8% ✓  │ │ -$640        │ │ +0.11 → Trade        ││
│  └──────────┘ └──────────┘ └──────────────┘ └───────────────────────┘│
│                                                                        │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐ │
│  │  EXPOSURE MATRIX                │  │  POSITION RISK LADDER        │ │
│  │  Symbol   Side  Notional  % Eq  │  │                             │ │
│  │  BTCUSDT  LONG   $3,200  24.9%  │  │  SL ──────────────[▼]──── │ │
│  │  SOLUSDT SHORT   $1,100   8.6%  │  │  Entry         [●]         │ │
│  │  ─────────────────────────────  │  │  TP1 ──────────────[▲]──── │ │
│  │  Total    $4,300  33.5%         │  │  TP2 ──────────────[▲▲]─── │ │
│  │  Limit    $6,420  50.0% ← WARN  │  │  TP3 ──────────────[▲▲▲]── │ │
│  └─────────────────────────────────┘  └─────────────────────────────┘ │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  REGIME RISK MODIFIERS                                             │ │
│  │  Current: BULL_EXPANSION   SL: 2.5× ATR   TP1: 1.5× ATR          │ │
│  │  Weather Alpha: 42.3   Mining Stress: LOW   Leverage Cap: 3×      │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.6 — Header Bar (compact, 52px)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ [≡]  Equity $12,840  │  Daily +$284 ▲  │  Heat 18% 🟢  │  ● AQEA ONLINE  2.1ms   │  [🔔3] [⚡] [👤] │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Files to Change

### 4.1 — Delete / Retire (do not render, keep files)
These pages have no route in the target IA. Remove their imports and routes from `App.tsx`:

| File | Reason |
|------|--------|
| `pages/HomePage.tsx` | Merged into Dashboard |
| `pages/RiskCenter.tsx` | Superseded by RiskCenterV8 |
| `pages/WalletPage.tsx` | Superseded by WalletCenter |
| `pages/AQEAAnalytics.tsx` | Already unrouted |
| `pages/AICommandCenter.tsx` | Already unrouted |
| `pages/CapitalGuard.tsx` | Merged into RiskCenter tabs |
| `pages/ForecastCenter.tsx` | Becomes sub-tab of AQEA AI |
| `pages/ReplayDashboard.tsx` | Becomes sub-tab of AQEA AI |
| `pages/ShadowDashboard.tsx` | Becomes sub-tab of AQEA AI |
| `pages/PaperTradingMonitor.tsx` | Becomes sub-tab of Portfolio |
| `pages/MarketSentiment.tsx` | Becomes widget in Dashboard |
| `pages/SystemHealth.tsx` | Moves to Settings sub-tab |
| `pages/InstitutionalCommandCenter.tsx` | Merged into Dashboard |
| `pages/PnLCenter.tsx` | Becomes sub-tab of Portfolio |
| `pages/WalletCenter.tsx` | Becomes sub-tab of Portfolio |
| `pages/LiveLogs.tsx` | Becomes sub-tab of Settings |
| `pages/BacktestPage.tsx` | Becomes sub-tab of AQEA AI |
| `pages/TradeAttribution.tsx` | Becomes sub-tab of Portfolio |
| `pages/AIObservability.tsx` | Merges into AQEA AI |
| `pages/InstitutionalRiskCenter.tsx` | Merges into RiskCenter tabs |

### 4.2 — Modify (core changes)

| File | Changes |
|------|---------|
| `App.tsx` | Collapse to 7 routes; remove `/institutional/*` nested layout; remove lazy imports for retired pages |
| `components/layout/Sidebar.tsx` | Reduce to 7 items; add mode badge; remove collapse toggle (icon-only by default) |
| `components/layout/TopBar.tsx` | Remove mock alerts; remove TEST RESET button; fix EMERGENCY STOP to call real API; shrink to 52px; real user data from store |
| `components/layout/MarketRibbon.tsx` | Compact to 40px; remove duplicate `animate-marquee` double render trick (render once with CSS `animation`) |
| `styles/index.css` | Replace Bootstrap class usage in custom CSS; establish single card pattern; fix dark mode variable collisions |
| `pages/Dashboard.tsx` | Add KPI strip; integrate compact positions table; add AI decision timeline; remove duplicated state fetches |
| `pages/Positions.tsx` | Rename "Live Inventory" → "Positions"; add R-multiple column; add TP1/TP2/TP3 hit indicators |
| `pages/AIMatrix.tsx` | Replace hardcoded model data with live store data; add model voting bar; add animal weights display |
| `pages/RiskCenterV8.tsx` | Add sub-tabs (Overview, Exposure, Drawdown, Limits); add position risk ladder; show real Kelly fraction |
| `pages/SettingsPage.tsx` | Add System Health sub-tab; add Live Logs sub-tab; remove PageShell wrapper (layout already provides frame) |

### 4.3 — Create (new components only)

| File | Purpose |
|------|---------|
| `components/layout/SignalPanel.tsx` | Collapsible right panel; persists across routes; reads live AQEA decisions from socket; renders per-symbol signal cards |
| `pages/Portfolio.tsx` | New page consolidating WalletCenter + PnLCenter + TradeHistory + TradeAttribution into tabs |

### 4.4 — No Changes Needed

| File | Reason |
|------|---------|
| `ui/Badge.tsx` | Already clean; reuse |
| `ui/Button.tsx` | Already clean; reuse |
| `ui/Card.tsx` | Already clean; enforce its usage to eliminate `.card-modern` and inline card patterns |
| `ui/Tag.tsx` | Already clean; reuse |
| `hooks/useSocket.ts` | No change |
| `hooks/useKlines.ts` | No change |
| `lib/api.ts` | No change |
| `lib/currency.ts` | No change |
| `store/useAppStore.ts` | No change |
| `store/useDashboardStore.ts` | No change |

---

## 5. Implementation Phases

### Phase 1 — Chrome Reduction (2 files)
**Goal:** Eliminate dead chrome; establish correct vertical rhythm.

1. `Sidebar.tsx` — Collapse to 7 nav items. Remove all items outside the 7 sections. Set fixed `64px` width (icon-only with text tooltips on hover via CSS `title` attribute). Remove the ChevronLeft/ChevronRight toggle. Add mode badge and status dot at the bottom.
2. `TopBar.tsx` — Remove `mockAlerts` array; replace with real data from `useDashboardStore`. Remove `TEST RESET` button. Wire `EMERGENCY STOP` to a real POST `/agent/auto/disable` call. Shrink height from 84px to 52px by removing the MarketRegimeWidget from the header (it moves to the right-panel footer). Remove `style={{ top: '56px' }}` positioning hack.

**Outcome:** 88px of chrome reclaimed. Navigation is 7 items.

---

### Phase 2 — Route Consolidation (1 file)
**Goal:** 7 routes, zero nested layouts.

`App.tsx`:
- Remove `/institutional/*` route tree entirely
- Remove all lazy imports for retired pages (20 imports → 7)
- Map routes to 7 pages:
  - `/` → `Dashboard`
  - `/portfolio` → `Portfolio` (new)
  - `/positions` → `Positions`
  - `/orders` → `OrdersPage`
  - `/ai` → `AIMatrix` (renamed tab container)
  - `/risk` → `RiskCenterV8`
  - `/settings` → `SettingsPage`
- `MarketRibbon` + `Sidebar` + `SignalPanel` remain as persistent shell; no nested layouts

**Outcome:** 25 routes → 7. No more `/aqea/` path prefix needed.

---

### Phase 3 — Right-Side Signal Panel (1 new file)
**Goal:** Persistent AI signal context visible from all pages.

`components/layout/SignalPanel.tsx`:
- Reads socket events from `useSocket` hook (already has AQEA decision events)
- Renders a vertical stack of per-symbol signal cards
- Each card: symbol, decision, confidence %, TP1/SL levels, model votes (3 coloured bars)
- Portfolio heat + Kelly fraction summary at the bottom
- Collapsible via a single `◀` toggle button stored in `useAppStore`
- Width: `280px` open, `0px` closed with CSS transition

Wiring in `App.tsx`: render `<SignalPanel />` as a sibling of the main content `<div>`, inside the flex row.

**Reuses:** `ui/Badge.tsx`, `ui/Card.tsx`, socket data already flowing through `useDashboardStore`.

---

### Phase 4 — Dashboard Consolidation (1 file)
**Goal:** Single dashboard with KPI strip, chart, decision log, compact positions.

`pages/Dashboard.tsx`:
- Replace the current multi-card layout with:
  - **KPI strip** (full width, 7 metrics in a flex row): Total Equity, Daily P&L, Open P&L, Heat, Win Rate, Sharpe, Open Trades
  - **2-column main area**: Left = `PriceChart` with timeframe tabs (reuse `ui/TimeframeTabs.tsx`); Right = AQEA decision log (already exists as `AIDecisionTimelineItem` component in the file)
  - **Compact positions table** below the 2-column area: 6 columns (Symbol, Side, Entry, Current, P&L, R-multiple, Action)
- Remove the custom `Gauge` SVG component (replaced by simple metric cells)
- Remove the duplicate `fetchDashboard` call that runs in both `TopBar.tsx` and `Dashboard.tsx`

---

### Phase 5 — Page Sub-Tab Consolidation (4 files)
**Goal:** Secondary tools accessible without extra routes.

Each target page gains a `<Tabs>` component at its top (using `ui/Tag.tsx` or inline nav pills — no new library).

**`pages/AIMatrix.tsx`** — rename to AQEA AI, add tabs:
- `[Models]` — current model grid (replace hardcoded data with store)
- `[Strategy]` — embed `StrategyAI.tsx` content
- `[Observability]` — embed `AIObservability.tsx` content
- `[Shadow]` — embed `ShadowDashboard.tsx` content
- `[Backtest]` — embed `BacktestPage.tsx` content

**`pages/RiskCenterV8.tsx`** — add tabs:
- `[Overview]` — current content
- `[Exposure]` — exposure matrix from `InstitutionalRiskCenter.tsx`
- `[Limits]` — `CapitalGuard.tsx` content

**`pages/Portfolio.tsx`** (new file):
- `[Overview]` — wallet balances from `WalletCenter.tsx`
- `[P&L]` — `PnLCenter.tsx` content
- `[History]` — `TradeHistory.tsx` content
- `[Attribution]` — `TradeAttribution.tsx` content
- `[Paper Monitor]` — `PaperTradingMonitor.tsx` content

**`pages/SettingsPage.tsx`** — add tabs:
- Keep existing: `[API Keys]`, `[Theme]`, `[Manage Coins]`, `[Risk Control]`, `[Interface]`
- Add: `[System Health]` — embed `SystemHealth.tsx`
- Add: `[Live Logs]` — embed `LiveLogs.tsx`

---

### Phase 6 — Design Token Unification (1 file)
**Goal:** One card pattern, one type scale, no Bootstrap/Tailwind collision.

`styles/index.css`:
- Add `.terminal-card` as the single card pattern: dark bg (`#151A23`), `1px solid #1F2937` border, `6px` radius. Replaces `.card-modern`.
- Add `.kpi-cell` for the metric strip pattern.
- Add `.signal-bar` for model vote bars.
- Purge `.card-modern` definition (search: 0 files should reference it after Phase 4-5).
- Fix the Bootstrap class leak: any component that uses `container-fluid` gets replaced with `w-full px-4` Tailwind classes. Target: `Positions.tsx`, `RiskCenterV8.tsx`, `OrdersPage.tsx`.
- Dark mode: the existing `html.dark` CSS var block is correct and complete — simply ensure the `theme` value from `useAppStore` writes `dark` to `document.documentElement.classList` (it already does via `useEffect` in `App.tsx`; verify it works).

---

## 6. Component Reuse Map

```
Existing component          → Reused in
─────────────────────────────────────────────────
ui/Card.tsx                 → ALL pages (enforce over .card-modern)
ui/Badge.tsx                → SignalPanel, Positions, Orders
ui/Button.tsx               → SignalPanel, Dashboard, RiskCenter
ui/Tag.tsx                  → Section sub-tabs (pill nav)
ui/TimeframeTabs.tsx        → Dashboard chart
ui/SymbolSelector.tsx       → Dashboard header
components/ai/AlertsFeed.tsx → Dashboard right-column
components/ai/AIHealthPanel.tsx → AQEA AI Models tab
components/chart/PriceChart.tsx → Dashboard
components/chart/TradingViewChart.tsx → Dashboard (optional upgrade)
components/layout/ToastContainer.tsx → Keep in App.tsx shell
hooks/useSocket.ts          → SignalPanel
hooks/useKlines.ts          → Dashboard chart
store/useDashboardStore.ts  → Dashboard, SignalPanel, RiskCenter
store/useAppStore.ts        → Sidebar, TopBar, SignalPanel
```

---

## 7. Design Token Reference (dark terminal theme)

```
Background      #0B0E14   terminal-950 (already in CSS vars)
Card bg         #151A23   terminal-900
Border          #1F2937   terminal-800
Muted border    #374151   terminal-700
Text primary    #F1F5F9   slate-100
Text secondary  #94A3B8   slate-400
Profit green    #16A34A   (existing text-success)
Loss red        #DC2626   (existing text-danger)
AI blue         #3B82F6   (existing text-primary)
Warning amber   #D97706   (existing text-warning)
Accent cyan     existing trade-cyan CSS var
```

The dark theme tokens already exist in `index.css` under `html.dark`. Apply by ensuring `useAppStore.theme === "dark"` writes `document.documentElement.classList.add("dark")`.

---

## 8. What This Achieves

| Metric | Before | After |
|--------|--------|-------|
| Sidebar nav items | 20 | 7 |
| Routes | 25+ | 7 |
| Chrome height | 140px | 92px |
| Orphaned pages | 8 | 0 |
| Design systems in use | 2 (Bootstrap + Tailwind) | 1 (Tailwind + custom tokens) |
| Mock data in production UI | 4 locations | 0 |
| New files required | — | 2 (SignalPanel, Portfolio) |
| Files deleted from routing | — | 20 (not deleted from disk) |
