# Responsive & UI Hardening Audit — AALGOLAKSHMI

Scope: full client UI. Constraints honored — no backend/API changes, no new
libraries, no mock data, all menus/pages/features kept, reused existing components.

---

## Root causes found

| # | Issue | Root cause |
|---|-------|-----------|
| 1 | **White cards/tables/inputs in dark mode** | `modern.css` defined `--app-*` / `--text-*` / `--bs-*` only in `:root` (light) with **no `html.dark` override** → surfaces stayed light. |
| 2 | **Inconsistent colors** | ~330 hardcoded hex literals across components (`#0b1220`×27, `#10b981`×24, `#f43f5e`×21, `#64748b`×20, `#3b82f6`×18 …) instead of shared tokens. |
| 3 | **Horizontal overflow** | fixed-pixel panels + wide tables with no viewport guard. |
| 4 | **Inconsistent scrollbars / focus rings** | two different `.custom-scrollbar` definitions; default browser focus rings. |
| 5 | **Inconsistent cards/buttons/tables** | `.card`, `.card-modern`, `.table-modern`, ad-hoc inline cards all styled differently. |
| 6 | **Layout overlap / oversized padding on mobile** | desktop `app-main-content` padding + fixed offsets (footer `left:260px`). |
| 7 | **Chart invisible** | TradingView external script blocked by ad-blockers (separate fix: in-app `KlineChart` fallback). |

---

## Fixes applied

### Global (new `design-tokens.css`, imported last)
- **Dark-theme override added** for all legacy `--app-*`, `--text-*` and Bootstrap
  surface/table vars → every `.card-modern`, `.table`, `.form-control`, dropdown,
  offcanvas now flips correctly. **Fixes #1 app-wide with zero component edits.**
- **Canonical token catalogue** (`--ds-*`) for brand/buy/sell/hold/warning, surfaces,
  text, spacing, radii, shadows, fonts. Bootstrap semantic vars aligned to them. (#2, #5)
- **Overflow guard**: `box-sizing:border-box` globally, `html,body{max-width:100%;overflow-x:hidden}`,
  `img,svg,iframe{max-width:100%}`, `.text-break-anywhere`. (#3)
- **Unified** scrollbars + `:focus-visible` ring + `.btn` radius. (#4)
- **Normalised** `.card-modern/.card-financial`, `.table-modern` (header/hover/border),
  inputs, dropdowns/offcanvas via tokens. (#5)
- **Responsive padding** at ≤991px / ≤575px, heading clamp on phones. (#6)

### Per-page / component (this and prior passes)
| Area | Fix |
|------|-----|
| `App.tsx` | removed `overflow-hidden` on `<main>` so the workspace scrolls |
| `HomePage` | terminal columns stack `<lg`; chart 520px min-height; holdings table horizontal scroll (`min-width:720`); per-coin signal timers |
| `BacktestPage` | config/results stack on mobile (`useMediaQuery`) |
| `ForecastCenter` | `1fr 1fr` grids → single column on mobile |
| `TopBar` | metrics hidden `<lg`, mode tabs horizontally scrollable |
| `GlobalFooter` | `position:fixed; left:260px` → `sticky` (no gap when sidebar collapses) |
| `Sidebar` | Reports nav added; desktop rail + mobile offcanvas share arrays |
| `Reports` module | responsive sub-nav, `auto-fill` grids, `table-responsive` |
| `KlineChart` | in-app candlestick fallback (Highcharts + Binance klines) |

---

## Verification
- `tsc --noEmit`: **0 errors** (client).
- `vite build`: **succeeds, 0 errors**.
- Breakpoints targeted: phone ≤575px, tablet 576–991px, desktop ≥992px (Bootstrap `lg`).

---

## Remaining blockers / follow-ups (non-breaking)
1. **Bare `col-N` (no breakpoint)** on a few pages (`AIMatrix`, `StrategyAI`,
   `ShadowDashboard`, `CapitalGuard`, `MarketSentiment`, `ReplayDashboard`) keep N columns
   on phones. Not globally overridden — some are intentional connected legends, so each
   needs a 30-sec per-page review to choose `col-6 col-md-3` etc. Low risk, cosmetic.
2. **Inline hex literals** still exist in always-dark terminal panels (`SignalPanel`,
   `TopBar`, chart components). They render fine (dark-on-dark) but bypass tokens; convert
   opportunistically to `var(--ds-*)` when touching those files.
3. **Legacy/unrouted pages** (`Dashboard.tsx`, `WalletPage.tsx`, `TradeHistory.tsx`,
   `RiskCenter.tsx`) inherit the global fixes but weren't individually re-laid-out since
   they're superseded by the routed equivalents.
