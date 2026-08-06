# AQEA V10.3 Institutional Trading Command Center - UI Architecture

## 1. Overview
The AQEA V10.3 UI Architecture is designed to provide an institution-grade observability layer for the certified AQEA trading engine. It strictly adheres to a "read-only" philosophy regarding trading logic—serving as a window into the state, decisions, and performance of the autonomous system without introducing any capability to manually override the validated quantitative models.

## 2. Technology Stack
- **Framework:** React 18
- **Language:** TypeScript
- **Styling:** Tailwind CSS (Dark Theme optimized for trading environments)
- **Data Visualization:** Recharts for performance curves and distributions
- **State Management:** Zustand (leveraging existing app store patterns)
- **Real-Time Data:** WebSocket via Socket.io for live pricing, portfolio heat, and active signals.

## 3. Data Flow & Integration
The dashboard will consume data exclusively from the existing backend observability and governance APIs established in V8.5 - V10.2:

- **Governance & Risk:** `GET /api/aqea-governance/observability`
  - Provides aggregated metrics for Shadow Validation, Paper Validation, Risk status, and AI Model Health.
- **Decision Attribution:** `GET /api/aqea-attribution`
  - Provides paginated, granular data for every signal (CNN, Transformer, OF, SM, Regime).
- **Subsystem Alpha:** `GET /api/aqea-attribution/outcomes`
  - Provides win-rate and alpha contribution metrics for individual ensemble components.

## 4. Layout Architecture
The application will utilize a persistent sidebar navigation mapping to the five core operational views, with a fixed header displaying critical global state (Connection status, Active Mode, Global Risk Status).

1. **Page 1: Command Center** - High-level executive summary of equity, PnL, and active portfolio heat.
2. **Page 2: AI Observability** - Deep dive into model health, drift, and confidence distributions.
3. **Page 3: Trade Attribution** - Chronological, granular ledger tracing every decision back to its quantitative factors.
4. **Page 4: Risk Center** - Real-time monitoring of exposure, drawdowns, and circuit breakers.
5. **Page 5: Paper Trading Monitor** - Track progress towards the 100-trade institutional validation gate.

## 5. Design Language (Institutional Dark Theme)
- **Backgrounds:** Slate-900 to Slate-950 for primary surfaces.
- **Text:** Slate-300 for primary text, Slate-400 for secondary.
- **Accents:** 
  - Emerald-500 for LONG/PROFIT/HEALTHY signals.
  - Rose-500 for SHORT/LOSS/CRITICAL signals.
  - Amber-500 for HOLD/WARNING/DEGRADED signals.
  - Blue-500 for informational active states (e.g., Active Regime).
- **Typography:** Monospaced fonts for numerical data and tickers to ensure vertical alignment.
