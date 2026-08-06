# AALGOLAKSHMI_V2 API Endpoints

## Auth (`/auth`)
- `POST /auth/register`: Register a new user.
- `POST /auth/login`: Authenticate and receive a JWT.
- `GET /auth/me`: Get current user info (requires auth).

## Settings (`/settings`)
- `GET /settings/get`: Retrieve user settings (requires auth).
- `PUT /settings/update`: Update user settings (requires auth).

## API Keys (`/apikeys`)
- `GET /apikeys/`: Get status of saved API keys (requires auth).
- `POST /apikeys/save`: Encrypt and store Binance API keys (requires auth).
- `POST /apikeys/test`: Test stored API keys (requires auth).
- `POST /apikeys/test-raw`: Test provided API keys without saving (requires auth).
- `DELETE /apikeys/delete`: Remove stored API keys (requires auth).

## Trading (`/trading`)
- `GET /trading/open-positions`: Get active positions (requires auth).
- `GET /trading/history`: Get trade history (requires auth).
- `GET /trading/wallet`: Get paper/live wallet data (requires auth).
- `POST /trading/place-order`: Execute a trade (requires auth).
- `POST /trading/close-position`: Close an existing position (requires auth).
- `PATCH /trading/modify-position`: Update SL/TP of a position (requires auth).
- `GET /trading/klines`: Get historical price data.
- `GET /trading/alerts`: Get system alerts (requires auth).
- `GET /trading/market-check`: Get AI market analysis.
- `GET /trading/ensemble-report`: Get detailed AI ensemble report.
- `POST /trading/control/pause`: Pause the trading engine.
- `POST /trading/control/resume`: Resume the trading engine.
- `POST /trading/control/kill`: Emergency stop for all trading.
- `GET /trading/control/status`: Get current engine status.
- `GET /trading/spectral-regime`: Get market regime analysis.
- `GET /trading/ticker-prices`: Get latest prices for symbols.
- `GET /trading/ticker-24hr`: Get 24hr ticker data.
- `POST /trading/hard-reset`: Reset paper trading account.

## Agent (`/agent`)
- `GET /agent/recommendation`: Get AI trade recommendation.
- `GET /agent/quantum/recommendation`: Get quantum-enhanced recommendation.
- `POST /agent/auto/enable`: Enable autonomous trading.
- `POST /agent/auto/disable`: Disable autonomous trading.
- `GET /agent/auto/status`: Get autonomous engine status.

## Wallet (`/wallet`)
- `GET /wallet/balance`: Get detailed wallet balance (Spot/Futures).
- `GET /wallet/transactions`: Get transaction history (requires auth).
- `POST /wallet/deposit/upi`: Initiate UPI deposit.
- `POST /wallet/withdraw/upi`: Initiate UPI withdrawal.
- `POST /wallet/withdraw/crypto`: Initiate crypto withdrawal.
- `GET /wallet/p2p/offers`: List P2P exchange offers.
- `POST /wallet/p2p/create`: Create a P2P offer.
- `POST /wallet/p2p/buy`: Buy from a P2P offer.
- `POST /wallet/init`: Initialize a new wallet (requires auth).

## Models (`/models`)
- `GET /models/`: List available AI models.
- `POST /models/:id/toggle`: Enable/disable a specific model.
- `POST /models/:id/weight`: Update the weight of a model.
- `POST /models/weights`: Bulk update model weights.
- `POST /models/health-check`: Run diagnostic on models.
- `POST /models/reset`: Reset model configuration to defaults.

## AQEA (Autonomous Quality Evaluation Agent)
- `/aqea-ui/dashboard`: Main AQEA dashboard data.
- `/aqea-ui/analytics`: Performance analytics.
- `/aqea-governance/summary`: Governance overview.
- `/aqea-attribution/outcomes`: Trade attribution results.

## Platform (`/platform`)
- `GET /platform/health`: System-wide health check.
- `GET /platform/audits`: Recent platform audits.
- `GET /health`: Basic health endpoint (defined in `index.ts`).
