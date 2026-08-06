#!/bin/bash
# ─────────────────────────────────────────────────────────────
# 🚀 AALGOLAKSHMI V3 — Master Terminal Application Launcher
# ─────────────────────────────────────────────────────────────
# Usage:
#   ./start_app.sh          -> Start full stack in production mode (PM2 / background)
#   ./start_app.sh dev      -> Run server & client concurrently in dev live-reload mode
#   ./start_app.sh stop     -> Stop all running services
#   ./start_app.sh status   -> Check running services status
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}=====================================================${NC}"
echo -e "${CYAN}      🚀 AALGOLAKSHMI V3 QUANT PLATFORM LAUNCHER     ${NC}"
echo -e "${CYAN}=====================================================${NC}"

# Helper function to check if port is in use
check_port() {
  lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

# 1. Start MongoDB if not already running
start_mongo() {
  echo -e "\n${YELLOW}Step 1: Checking MongoDB status...${NC}"
  if mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017 >/dev/null 2>&1; then
    echo -e "${GREEN}✔ MongoDB is running on port 27017${NC}"
  else
    echo -e "${YELLOW}Starting MongoDB Community Service...${NC}"
    brew services start mongodb-community >/dev/null 2>&1 || true
    sleep 3
    if mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017 >/dev/null 2>&1; then
      echo -e "${GREEN}✔ MongoDB started successfully!${NC}"
    else
      echo -e "${RED}⚠ Could not connect to local MongoDB on port 27017.${NC}"
      echo -e "${YELLOW}Ensure MongoDB is installed ('brew install mongodb-community').${NC}"
    fi
  fi
}

# Command: stop
if [ "${1:-}" = "stop" ]; then
  echo -e "\n${YELLOW}Stopping all Aalgolakshmi services...${NC}"
  npx pm2 stop ecosystem.config.js >/dev/null 2>&1 || true
  pkill -f "node.*server" >/dev/null 2>&1 || true
  pkill -f "vite" >/dev/null 2>&1 || true
  echo -e "${GREEN}✔ All application services stopped.${NC}"
  exit 0
fi

# Command: status
if [ "${1:-}" = "status" ]; then
  echo -e "\n${YELLOW}Checking Application Status...${NC}"
  echo "-----------------------------------------------------"
  if mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017 >/dev/null 2>&1; then
    echo -e "MongoDB     : ${GREEN}ONLINE (port 27017)${NC}"
  else
    echo -e "MongoDB     : ${RED}OFFLINE${NC}"
  fi

  if check_port 9991; then
    echo -e "Express Server: ${GREEN}ONLINE (port 9991)${NC}"
  else
    echo -e "Express Server: ${RED}OFFLINE${NC}"
  fi

  if check_port 5173 || check_port 9994; then
    echo -e "Vite UI     : ${GREEN}ONLINE${NC}"
  else
    echo -e "Vite UI     : ${RED}OFFLINE${NC}"
  fi
  echo "-----------------------------------------------------"
  exit 0
fi

# Command: dev (Development Live-Reload Mode)
if [ "${1:-}" = "dev" ]; then
  start_mongo
  echo -e "\n${YELLOW}Step 2: Verifying project build...${NC}"
  npm run build:server
  
  echo -e "\n${GREEN}🚀 Launching Concurrent Dev Mode (Server + Client)...${NC}"
  echo -e "${CYAN}Server : http://localhost:9991${NC}"
  echo -e "${CYAN}Client : http://localhost:5173 (or assigned port)${NC}"
  echo "-----------------------------------------------------"
  npm run dev
  exit 0
fi

# Default Mode: Production Stack (PM2 / start_all.sh)
start_mongo

echo -e "\n${YELLOW}Step 2: Checking Dependencies & Build Gates...${NC}"
npm run build

echo -e "\n${GREEN}Step 3: Launching All Application Services via PM2...${NC}"
chmod +x ./start_all.sh
./start_all.sh start

echo -e "\n${CYAN}=====================================================${NC}"
echo -e "${GREEN}🎉 AALGOLAKSHMI V3 APPLICATION RUNNING SUCCESSFULLY!${NC}"
echo -e "${CYAN}=====================================================${NC}"
echo -e "📍 Web Dashboard   : ${GREEN}http://localhost:9994${NC} (or assigned port)"
echo -e "📍 Backend API     : ${GREEN}http://localhost:9991${NC}"
echo -e "📍 Health Endpoint : ${GREEN}http://localhost:9991/health${NC}"
echo -e "📍 Database        : ${GREEN}mongodb://127.0.0.1:27017/aalgolakshmi${NC}"
echo -e "${CYAN}=====================================================${NC}"
echo -e "Useful Commands:"
echo -e "  To view logs   : ${YELLOW}./start_all.sh logs${NC}"
echo -e "  To check status: ${YELLOW}./start_app.sh status${NC}"
echo -e "  To stop app    : ${YELLOW}./start_app.sh stop${NC}"
echo -e "${CYAN}=====================================================${NC}\n"
