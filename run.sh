#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  AALGOLAKSHMI V3 — one-command stack control
#
#  Usage:
#    ./run.sh            start everything (MongoDB + PM2 apps) and health-check
#    ./run.sh dev        start MongoDB, then run client+server in dev mode
#                        (foreground, hot reload — Ctrl+C to stop)
#    ./run.sh stop       stop the PM2 apps (leaves MongoDB running)
#    ./run.sh stop-all   stop PM2 apps AND MongoDB
#    ./run.sh status     show status of every component
#    ./run.sh logs       tail all PM2 logs
#
#  Components:
#    MongoDB          :27017  (homebrew service: mongodb-community)
#    aqea-server      :9991   (Express API, compiled JS via PM2)
#    aqea-quant       dynamic (Python FastAPI — port in quant_engine/qport.tmp)
#    aqea-client      :9994   (Vite dev server via PM2)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✔${NC} $1"; }
bad()  { echo -e "  ${RED}✘${NC} $1"; }
info() { echo -e "  ${YELLOW}…${NC} $1"; }

need() {
  command -v "$1" >/dev/null 2>&1 || { bad "'$1' not found — $2"; exit 1; }
}

wait_for() { # wait_for <name> <check-command> <timeout-seconds>
  local name="$1" check="$2" timeout="${3:-60}" waited=0
  until eval "$check" >/dev/null 2>&1; do
    sleep 2; waited=$((waited + 2))
    if [ "$waited" -ge "$timeout" ]; then bad "$name did not become healthy within ${timeout}s"; return 1; fi
  done
  ok "$name healthy"
}

start_mongo() {
  if mongosh --quiet --eval 'db.runCommand({ping:1}).ok' mongodb://127.0.0.1:27017 2>/dev/null | grep -q 1; then
    ok "MongoDB already running (:27017)"
  else
    info "starting MongoDB (brew service)..."
    brew services start mongodb-community >/dev/null
    wait_for "MongoDB (:27017)" "mongosh --quiet --eval 'db.runCommand({ping:1}).ok' mongodb://127.0.0.1:27017 | grep -q 1" 45
  fi
}

check_deps() {
  need brew   "install from https://brew.sh"
  need node   "brew install node"
  need mongosh "brew install mongosh"
  [ -d server/node_modules ] && [ -d client/node_modules ] || {
    info "node_modules missing — running npm run install:all..."
    npm run install:all
  }
  # Quant engine runs on the interpreter pinned in ecosystem.config.js
  [ -x /opt/homebrew/bin/python3.12 ] || bad "python3.12 missing (brew install python@3.12) — quant engine won't start"
  [ -f server/.env ] || bad "server/.env missing — Binance/AQEA config lives there (see CLAUDE.md)"
}

quant_port() { # discover the quant engine's dynamically allocated port
  local pid
  pid=$(pm2 pid aqea-quant 2>/dev/null | tr -d '[:space:]')
  [ -n "$pid" ] && [ "$pid" != "0" ] || return 1
  lsof -iTCP -sTCP:LISTEN -a -p "$pid" 2>/dev/null | awk 'NR==2 {split($9,a,":"); print a[2]}'
}

start_stack() {
  echo "── dependencies ──"
  check_deps
  echo "── MongoDB ──"
  start_mongo
  echo "── application (PM2) ──"
  need pm2 "npm install -g pm2"
  if [ ! -d server/dist ] || [ -z "$(ls -A server/dist 2>/dev/null)" ]; then
    info "server/dist missing — building server..."
    npm run build:server
  fi
  pm2 start ecosystem.config.js >/dev/null 2>&1 || pm2 restart ecosystem.config.js >/dev/null
  wait_for "aqea-server (:9991)" "curl -s -m 3 http://localhost:9991/health | grep -q '\"status\":\"ok\"'" 90
  wait_for "aqea-client (:9994)" "curl -s -m 3 -o /dev/null -w '%{http_code}' http://localhost:9994/ | grep -q 200" 90
  local qp
  if qp=$(quant_port) && [ -n "$qp" ]; then
    wait_for "aqea-quant (:$qp)" "curl -s -m 3 http://localhost:$qp/health | grep -q Online" 90 || true
  else
    info "aqea-quant port not discoverable yet (it self-registers with the server; check ./run.sh status shortly)"
  fi
  echo
  echo -e "${GREEN}All services up.${NC}  Open the app:  http://localhost:9994"
  echo "Manage with: pm2 ls | pm2 logs | ./run.sh status | ./run.sh stop"
}

start_dev() {
  echo "── dependencies ──"
  check_deps
  echo "── MongoDB ──"
  start_mongo
  # Don't run dev servers while the PM2 copies hold the same ports.
  if pm2 pid aqea-server 2>/dev/null | grep -qE '^[1-9]'; then
    info "stopping PM2 apps first (they hold ports 9991/9994)..."
    pm2 stop aqea-server aqea-client aqea-quant >/dev/null 2>&1 || true
  fi
  echo "── dev mode (hot reload, Ctrl+C to stop) ──"
  echo "   NOTE: the quant engine is NOT part of 'npm run dev' — start it separately:"
  echo "   cd quant_engine && /opt/homebrew/bin/python3.12 run.py"
  exec npm run dev
}

status() {
  echo "── MongoDB ──"
  mongosh --quiet --eval 'db.runCommand({ping:1}).ok' mongodb://127.0.0.1:27017 2>/dev/null | grep -q 1 \
    && ok "MongoDB (:27017)" || bad "MongoDB (:27017)"
  echo "── PM2 apps ──"
  pm2 ls
  echo "── health ──"
  curl -s -m 3 http://localhost:9991/health 2>/dev/null | grep -q '"status":"ok"' \
    && ok "server API (:9991)" || bad "server API (:9991)"
  curl -s -m 3 -o /dev/null -w '%{http_code}' http://localhost:9994/ 2>/dev/null | grep -q 200 \
    && ok "client UI  (:9994)" || bad "client UI  (:9994)"
  local qp
  if qp=$(quant_port) && curl -s -m 3 "http://localhost:$qp/health" 2>/dev/null | grep -q Online; then
    ok "quant engine (:$qp)"
    curl -s -m 3 "http://localhost:$qp/health/training" 2>/dev/null \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); c=d.get("cnn_train_state",{}); print("    continuous learning: enabled=%s, last CNN F1=%s" % (d.get("enabled"), c.get("last_attempt_f1")))' 2>/dev/null || true
  else
    bad "quant engine (port unknown or not responding)"
  fi
}

case "${1:-start}" in
  start)    start_stack ;;
  dev)      start_dev ;;
  stop)     pm2 stop aqea-server aqea-client aqea-quant soak-monitor 2>/dev/null; ok "PM2 apps stopped (MongoDB left running)" ;;
  stop-all) pm2 stop aqea-server aqea-client aqea-quant soak-monitor 2>/dev/null
            brew services stop mongodb-community >/dev/null; ok "everything stopped" ;;
  status)   status ;;
  logs)     pm2 logs ;;
  *) echo "usage: ./run.sh [start|dev|stop|stop-all|status|logs]"; exit 1 ;;
esac
