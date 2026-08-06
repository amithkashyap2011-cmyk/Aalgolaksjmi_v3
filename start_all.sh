#!/bin/bash
# ─────────────────────────────────────────────────────────────
# AALGOLAKSHMI V3 — one-shot launcher
#
#   ./start_all.sh            start MongoDB + server + quant + client (via PM2)
#   ./start_all.sh stop       stop the PM2 apps (MongoDB keeps running)
#   ./start_all.sh stop-all   stop PM2 apps AND MongoDB
#   ./start_all.sh restart    restart the PM2 apps
#   ./start_all.sh status     show everything's state
#   ./start_all.sh logs       tail PM2 logs
#
# Uses PM2 + ecosystem.config.js — the one supported way to run the stack.
# Do NOT run `npm run dev` at the same time (duplicate engines cause
# flapping quant registration); this script checks for that.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✘${NC} $1"; exit 1; }

wait_for() { # wait_for <label> <check-command> <timeout-seconds>
  local label=$1 check=$2 timeout=${3:-60} waited=0
  until eval "$check" >/dev/null 2>&1; do
    sleep 2; waited=$((waited + 2))
    [ "$waited" -ge "$timeout" ] && fail "$label did not come up within ${timeout}s"
  done
  ok "$label is up"
}

start_mongo() {
  if mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017 >/dev/null 2>&1; then
    ok "MongoDB already running (:27017)"
  else
    echo "Starting MongoDB (brew services)..."
    brew services start mongodb-community >/dev/null
    wait_for "MongoDB (:27017)" "mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017" 60
  fi
}

guard_no_dev_duplicates() {
  # If something is already on :9991 that PM2 doesn't own (e.g. `npm run dev`),
  # starting a second server would duplicate the trading engine.
  local pid pm2_pids cur
  pid=$(lsof -tnP -iTCP:9991 -sTCP:LISTEN 2>/dev/null | head -1 || true)
  [ -z "$pid" ] && return 0
  # PM2 registers the tsx wrapper, but the port is held by its node child —
  # so walk the listener's ancestry and accept it if any ancestor is PM2-managed.
  pm2_pids=$(pm2 jlist 2>/dev/null | grep -o '"pid":[0-9]*' | cut -d: -f2 || true)
  cur=$pid
  while [ -n "$cur" ] && [ "$cur" -gt 1 ] 2>/dev/null; do
    if echo "$pm2_pids" | grep -qx "$cur"; then return 0; fi
    cur=$(ps -p "$cur" -o ppid= 2>/dev/null | tr -d ' ')
  done
  fail "Port 9991 is already used by PID $pid (probably 'npm run dev'). Stop it first: kill $pid"
}

case "${1:-start}" in
  start)
    start_mongo
    guard_no_dev_duplicates
    echo "Starting server + quant engine + client via PM2..."
    pm2 start ecosystem.config.js
    wait_for "Server (:9991)"       "curl -s -m 2 http://localhost:9991/health | grep -q '\"server\":true'" 90
    wait_for "Quant engine (READY)" "curl -s -m 2 http://localhost:9991/health | grep -qE '\"state\":\"(READY|DEGRADED)\"'" 300
    CLIENT_PORT=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/node/ && /:999[2-9]/ && !/:9991/ {sub(/.*:/,"",$9); print $9; exit}')
    wait_for "Client (Vite)"        "[ -n \"$CLIENT_PORT\" ] || lsof -nP -iTCP:9994 -sTCP:LISTEN" 60
    echo
    pm2 list
    echo
    ok "All services running:"
    echo "   Dashboard : http://localhost:${CLIENT_PORT:-9994}"
    echo "   Server    : http://localhost:9991/health"
    echo "   MongoDB   : mongodb://127.0.0.1:27017/aalgolakshmi"
    echo "   Quant     : port in quant_engine/runtime/port.json"
    ;;
  stop)
    pm2 stop ecosystem.config.js >/dev/null 2>&1 || true
    ok "PM2 apps stopped (MongoDB left running; use 'stop-all' to stop it too)"
    ;;
  stop-all)
    pm2 stop ecosystem.config.js >/dev/null 2>&1 || true
    brew services stop mongodb-community >/dev/null 2>&1 || true
    ok "PM2 apps and MongoDB stopped"
    ;;
  restart)
    pm2 restart ecosystem.config.js
    ;;
  status)
    echo "── MongoDB ──"
    mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017 >/dev/null 2>&1 \
      && ok "MongoDB up (:27017)" || warn "MongoDB DOWN"
    echo "── Server ──"
    curl -s -m 2 http://localhost:9991/health || warn "Server DOWN"
    echo; echo "── PM2 ──"
    pm2 list
    ;;
  logs)
    pm2 logs
    ;;
  *)
    echo "Usage: $0 [start|stop|stop-all|restart|status|logs]"; exit 1
    ;;
esac
