#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
#  AALGOLAKSHMI V3 — PRODUCTION_GATE AUTHORIZATION COMMAND
# ═══════════════════════════════════════════════════════════════════
# Authoritative production gate verifying:
#  - Financial Truth & Provenance (₹20,000 NSE INR baseline, no fallback)
#  - Authoritative Accounting & Independent Oracle
#  - Deterministic Risk & Hard Safety Invariants
#  - Order Lifecycle & Duplicate Defense (Idempotency)
#  - Market Isolation (India INR / Crypto USDT strictly segregated)
#  - Paper/Live Boundary & Zero Leakage
#  - Broker Routing & Tripartite Reconciliation
#  - Agent Kernel Governance & Autonomy Barriers
#  - Transport Security, RBAC & Authentication
#  - Kill Switch, Market Data Quality & Time/Calendar
# ═══════════════════════════════════════════════════════════════════

echo "================================================================="
echo "  AALGOLAKSHMI V3 — EXECUTING PRODUCTION_GATE AUTHORIZATION SUITE"
echo "================================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/usr/local/n/versions/node/22.21.1/bin:$PATH"

cd "${ROOT_DIR}/server"
npm run production-gate

echo "================================================================="
echo "  ✅ PRODUCTION_GATE PASSED — ALL SAFETY INVARIANTS CERTIFIED"
echo "================================================================="
