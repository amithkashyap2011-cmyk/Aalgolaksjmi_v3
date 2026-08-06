#!/bin/bash
# ─── AALGOLAKSHMI V3 — MongoDB backup ──────────────────────────────
#
# Before this script, the only backup that existed was one manual,
# uncommitted `mongodump` snapshot — nothing scheduled, nothing rotated.
# If the data directory were lost, everything since that one snapshot
# (trade history, wallet balances) would be gone permanently.
#
# Usage: run directly, or via cron (see setup_backup_cron.sh in this dir).
# Keeps the last $RETAIN_DAYS daily backups, deletes older ones.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
RETAIN_DAYS=14
DB_URI="mongodb://127.0.0.1:27017/aalgolakshmi?replicaSet=rs0"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/auto-$STAMP"

mkdir -p "$BACKUP_DIR"

if ! mongodump --uri="$DB_URI" --out="$DEST" --gzip >>"$BACKUP_DIR/backup.log" 2>&1; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] BACKUP FAILED — see $BACKUP_DIR/backup.log" >> "$BACKUP_DIR/backup.log"
  exit 1
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup OK: $DEST" >> "$BACKUP_DIR/backup.log"

# Rotate: delete auto-* backups older than RETAIN_DAYS. Manual/pre-existing
# backups (e.g. pre-replset-*) are never touched by this rotation.
find "$BACKUP_DIR" -maxdepth 1 -type d -name "auto-*" -mtime +"$RETAIN_DAYS" -exec rm -rf {} \;
