#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AQEA Sleep Mode Guardian CLI Controller
# ─────────────────────────────────────────────────────────────────────────────

set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ACTION="${1:-status}"

case "$ACTION" in
  start)
    echo "🌙 Starting AQEA Sleep Mode Guardian under PM2..."
    npx pm2 start ecosystem.config.js --only aqea-sleep-guardian
    echo "✅ Sleep Mode Guardian is active. (Logs: logs/sleep-mode-agent.log)"
    ;;
  stop)
    echo "⏹️ Stopping AQEA Sleep Mode Guardian..."
    npx pm2 stop aqea-sleep-guardian || true
    echo "✅ Sleep Mode Guardian stopped."
    ;;
  restart)
    echo "🔄 Restarting AQEA Sleep Mode Guardian..."
    npx pm2 restart aqea-sleep-guardian
    ;;
  status)
    npx pm2 status aqea-sleep-guardian || echo "Agent not running under PM2."
    if [ -f logs/sleep-mode-agent.log ]; then
      echo -e "\nRecent logs from logs/sleep-mode-agent.log:"
      tail -n 10 logs/sleep-mode-agent.log
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
