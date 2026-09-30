#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Binance fixed-IP tunnel
# ═══════════════════════════════════════════════════════════════════
#  Forwards a LOCAL port on this machine to a tiny HTTP proxy (tinyproxy) that runs
#  on a cloud VM with a stable public IP. The server sends every request that carries
#  the Binance API key through it (BINANCE_HTTP_PROXY=http://127.0.0.1:18888), so
#  Binance always sees the VM's IP instead of the rotating mobile-carrier address.
#
#      server ──> 127.0.0.1:18888 ══ssh══> VM 127.0.0.1:8888 (tinyproxy) ──> Binance
#
#  Run by PM2 (app "binance-tunnel"). Configuration is read from server/.env (never
#  committed) or from the environment:
#
#    BINANCE_TUNNEL_HOST         VM public IP or hostname            (required)
#    BINANCE_TUNNEL_USER         ssh user on the VM                  (default ubuntu)
#    BINANCE_TUNNEL_KEY          path to the PRIVATE key file        (optional; chmod 600)
#    BINANCE_TUNNEL_SSH_PORT     ssh port on the VM                  (default 22)
#    BINANCE_TUNNEL_LOCAL_PORT   local port to listen on             (default 18888)
#    BINANCE_TUNNEL_REMOTE_PORT  tinyproxy port on the VM            (default 8888)
#
#  Until BINANCE_TUNNEL_HOST is set it idles (and starts by itself once it appears).
#  The key file is only ever passed to ssh by path; this script never reads it.
#  BINANCE_TUNNEL_DRYRUN=1 prints the ssh command instead of running it (tests).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${BINANCE_TUNNEL_ENV_FILE:-$ROOT/server/.env}"
log() { echo "[binance-tunnel] $*"; }

# Read KEY from the environment first, else from the env file — WITHOUT sourcing the
# file (values may contain shell metacharacters).
val() {
  local name="$1" v=""
  if [ -n "${!name:-}" ]; then printf '%s' "${!name}"; return; fi
  v="$(grep -E "^[[:space:]]*${name}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2-)"
  v="${v%$'\r'}"; v="${v#\"}"; v="${v%\"}"; v="${v#\'}"; v="${v%\'}"
  printf '%s' "$v"
}

# ── wait for configuration ───────────────────────────────────────────
HOST="$(val BINANCE_TUNNEL_HOST)"
if [ -z "$HOST" ]; then
  if [ "${BINANCE_TUNNEL_DRYRUN:-}" = "1" ]; then echo "NOT_CONFIGURED"; exit 0; fi
  log "BINANCE_TUNNEL_HOST is not set in $ENV_FILE — idle. Add it and this starts within 30s."
  while [ -z "$HOST" ]; do sleep 30; HOST="$(val BINANCE_TUNNEL_HOST)"; done
  log "configuration found"
fi

USER_="$(val BINANCE_TUNNEL_USER)"; USER_="${USER_:-ubuntu}"
KEY="$(val BINANCE_TUNNEL_KEY)"; KEY="${KEY/#\~/$HOME}"
SSH_PORT="$(val BINANCE_TUNNEL_SSH_PORT)"; SSH_PORT="${SSH_PORT:-22}"
LOCAL_PORT="$(val BINANCE_TUNNEL_LOCAL_PORT)"; LOCAL_PORT="${LOCAL_PORT:-18888}"
REMOTE_PORT="$(val BINANCE_TUNNEL_REMOTE_PORT)"; REMOTE_PORT="${REMOTE_PORT:-8888}"

# ── validate (values end up on a command line) ────────────────────────
fail() { echo "[binance-tunnel] ERROR: $*" >&2; exit 2; }
[[ "$HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || fail "invalid BINANCE_TUNNEL_HOST '$HOST' (IPv4 address or hostname)"
[[ "$USER_" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "invalid BINANCE_TUNNEL_USER '$USER_'"
for p in "$SSH_PORT" "$LOCAL_PORT" "$REMOTE_PORT"; do
  [[ "$p" =~ ^[0-9]+$ ]] && [ "$p" -ge 1 ] && [ "$p" -le 65535 ] || fail "invalid port '$p'"
done
if [ -n "$KEY" ]; then
  [ -f "$KEY" ] || fail "BINANCE_TUNNEL_KEY '$KEY' does not exist"
  # Any group/other permission bit set => ssh would refuse the key anyway; fail early and clearly.
  mode="$(stat -f %Lp "$KEY" 2>/dev/null || stat -c %a "$KEY" 2>/dev/null || echo 777)"
  [[ "$mode" =~ ^[0-7]+$ ]] || mode=777
  [ $(( 8#$mode & 8#077 )) -eq 0 ] || fail "key '$KEY' is accessible by other users (mode $mode) — run: chmod 600 '$KEY'"
fi

# ── the tunnel ────────────────────────────────────────────────────────
# ExitOnForwardFailure + ServerAlive*: if the link or the VM goes away ssh EXITS
# (instead of hanging with a dead forward) and PM2 restarts it. The forward is bound
# to 127.0.0.1 only, so nothing else on the network can use it.
ARGS=(-N -T
  -o BatchMode=yes
  -o ExitOnForwardFailure=yes
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  -o ConnectTimeout=15
  -o StrictHostKeyChecking=accept-new
  -L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}"
  -p "$SSH_PORT")
[ -n "$KEY" ] && ARGS+=(-i "$KEY" -o IdentitiesOnly=yes)
ARGS+=("${USER_}@${HOST}")

if [ "${BINANCE_TUNNEL_DRYRUN:-}" = "1" ]; then echo "ssh ${ARGS[*]}"; exit 0; fi

log "127.0.0.1:${LOCAL_PORT} -> ${USER_}@${HOST}:${REMOTE_PORT}"
exec ssh "${ARGS[@]}"
