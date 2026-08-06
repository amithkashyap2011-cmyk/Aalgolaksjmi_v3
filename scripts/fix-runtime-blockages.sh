#!/usr/bin/env bash
set -euo pipefail

CURRENT_REPO="${CURRENT_REPO:-/Users/amithks/aalgolakshmi_v3}"
LIVE_REPO="${LIVE_REPO:-/Users/amithks/aalgolakshmi_v2}"
SERVER_DIR="${SERVER_DIR:-$CURRENT_REPO/server}"
QUANT_DIR="${QUANT_DIR:-$LIVE_REPO/quant_engine}"
QUANT_VENV_PY="$QUANT_DIR/venv/bin/python"
MODEL_MANIFEST="$QUANT_DIR/models/MODEL_MANIFEST.json"
MODEL_VALIDATOR="$QUANT_DIR/models/model_validator.py"
QUANT_LOG="$QUANT_DIR/quant_live_restart.log"
QUANT_PORT_FILE="$QUANT_DIR/runtime/port.json"
SERVER_LOG="$SERVER_DIR/server_dev_restart.log"
BACKEND_PORT="${BACKEND_PORT:-}"
FRONTEND_PORT="${FRONTEND_PORT:-}"
USER_ID="${USER_ID:-}"

say() {
  printf '[fix-runtime] %s\n' "$*"
}

warn() {
  printf '[fix-runtime] WARNING: %s\n' "$*" >&2
}

fail() {
  say "ERROR: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_path() {
  [[ -e "$1" ]] || fail "Missing required path: $1"
}

need curl
need python3
need lsof
require_path "$QUANT_DIR"
require_path "$QUANT_VENV_PY"
require_path "$SERVER_DIR"

find_backend_port() {
  if [[ -n "$BACKEND_PORT" ]]; then
    echo "$BACKEND_PORT"
    return 0
  fi
  local port
  for port in 9991 9994 3001 3000 8080; do
    if curl -fsS "http://127.0.0.1:${port}/system/status" >/dev/null 2>&1; then
      echo "$port"
      return 0
    fi
  done
  while read -r port; do
    [[ -n "$port" ]] || continue
    if curl -fsS "http://127.0.0.1:${port}/system/status" >/dev/null 2>&1; then
      echo "$port"
      return 0
    fi
  done < <(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/node/ {split($9, a, ":"); print a[length(a)]}' | sort -u)
  return 1
}

find_frontend_port() {
  if [[ -n "$FRONTEND_PORT" ]]; then
    echo "$FRONTEND_PORT"
    return 0
  fi
  local port
  for port in 9993 9994 5173 4173; do
    if curl -fsS "http://127.0.0.1:${port}/" 2>/dev/null | grep -qi '<!doctype html>'; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

patch_manifest() {
  MODEL_MANIFEST="$MODEL_MANIFEST" python3 - <<'PY2'
from pathlib import Path
import json
import os
manifest_path = Path(os.environ['MODEL_MANIFEST'])
manifest = {
  'models': [
    {'name': 'cnn', 'checkpoint': 'models/cnn/checkpoints/cnn_1d_v1.pt', 'aliases': ['quant_engine/models/cnn/best_model.pth'], 'min_size': 10000, 'expected_schema': 'V8_INSTITUTIONAL'},
    {'name': 'ppo', 'checkpoint': 'models/ppo/checkpoints/ppo_execution_v1.pt', 'aliases': ['quant_engine/models/ppo/ppo_agent.zip'], 'min_size': 10000, 'expected_schema': 'V8_EXECUTION'},
    {'name': 'mamba', 'checkpoint': 'models/mamba/checkpoints/mamba-research-v1.pt', 'aliases': ['quant_engine/models/mamba/mamba_v1.pt'], 'min_size': 5000, 'expected_schema': 'V9_RESEARCH'},
    {'name': 'transformer', 'checkpoint': 'models/transformer/checkpoints/transformer_micro_v1.pt', 'aliases': ['quant_engine/models/transformer/transformer_v2.pt'], 'min_size': 5000, 'expected_schema': 'V10_RESEARCH'}
  ]
}
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
PY2
}

patch_validator() {
  cat > "$MODEL_VALIDATOR" <<'PY2FILE'
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("ModelValidator")


class ModelValidator:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.manifest_path = project_root / "quant_engine" / "models" / "MODEL_MANIFEST.json"

    def validate_all(self) -> dict:
        if not self.manifest_path.exists():
            logger.error(f"Manifest not found: {self.manifest_path}")
            return {"status": "ERROR", "message": "Manifest missing"}

        with self.manifest_path.open("r") as f:
            manifest = json.load(f)

        results = {}
        for model in manifest.get("models", []):
            results[model["name"]] = self.validate_model(model)

        return results

    def validate_model(self, model_config: dict) -> dict:
        checkpoint_rel_path = model_config["checkpoint"]
        checkpoint_path = self._resolve_checkpoint_path(checkpoint_rel_path, model_config.get("aliases", []))

        if checkpoint_path is None:
            return {"status": "DEGRADED", "reason": f"Checkpoint missing: {checkpoint_rel_path}"}

        size = checkpoint_path.stat().st_size
        if size < model_config.get("min_size", 0):
            return {"status": "DEGRADED", "reason": f"Checkpoint too small: {size} bytes"}

        if checkpoint_path.suffix == ".pt":
            try:
                import torch
                torch.load(checkpoint_path, map_location="cpu")
            except Exception as exc:
                return {"status": "DEGRADED", "reason": f"Torch load failed: {exc}"}

        return {
            "status": "HEALTHY",
            "size": size,
            "path": str(checkpoint_path.relative_to(self.project_root))
        }

    def _resolve_checkpoint_path(self, checkpoint_rel_path: str, aliases: list[str]) -> Optional[Path]:
        search_roots = [self.project_root, self.project_root / "quant_engine"]
        candidates = []
        for rel_path in [checkpoint_rel_path, *aliases]:
            for root in search_roots:
                candidates.append(root / rel_path)

        for candidate in candidates:
            if candidate.exists():
                return candidate

        return None


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent.parent
    validator = ModelValidator(root)
    print(json.dumps(validator.validate_all(), indent=2))
PY2FILE
}

read_quant_port() {
  QUANT_PORT_FILE="$QUANT_PORT_FILE" python3 - <<'PY2'
import json, os
from pathlib import Path
path = Path(os.environ['QUANT_PORT_FILE'])
if not path.exists():
    raise SystemExit(1)
print(json.loads(path.read_text())['port'])
PY2
}

wait_for_endpoint() {
  local url="$1"
  local tries="${2:-30}"
  while (( tries > 0 )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  return 1
}

wait_for_quant_port() {
  local tries=30
  while (( tries > 0 )); do
    if quant_port="$(read_quant_port 2>/dev/null)"; then
      echo "$quant_port"
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  return 1
}

system_has_quant() {
  local backend_port="$1"
  local expected_port="${2:-}"
  local payload
  payload="$(curl -fsS "http://127.0.0.1:${backend_port}/system/status")" || return 1
  STATUS_PAYLOAD="$payload" EXPECTED_PORT="$expected_port" python3 - <<'PY2'
import json, os
payload = json.loads(os.environ['STATUS_PAYLOAD'])
expected_port = os.environ.get('EXPECTED_PORT', '').strip()
for svc in payload.get('services', []):
    if svc.get('name') != 'quant_engine':
        continue
    if expected_port and not str(svc.get('url', '')).endswith(f':{expected_port}'):
        continue
    raise SystemExit(0)
raise SystemExit(1)
PY2
}

start_quant() {
  local backend_port="$1"
  rm -f "$QUANT_PORT_FILE"
  (
    cd "$QUANT_DIR"
    REGISTRY_URL="http://127.0.0.1:${backend_port}" nohup "$QUANT_VENV_PY" run.py > "$QUANT_LOG" 2>&1 < /dev/null &
  )
}

stop_server_watchers() {
  SERVER_DIR="$SERVER_DIR" python3 - <<'PY2'
import os, signal, subprocess, time
server_dir = os.environ['SERVER_DIR']
out = subprocess.check_output(['ps', '-axo', 'pid=,command='], text=True)
pids = []
for line in out.splitlines():
    if server_dir in line and ('tsx watch src/index.ts' in line or 'src/index.ts' in line):
        pid = line.strip().split(maxsplit=1)[0]
        if pid.isdigit():
            pids.append(int(pid))
for pid in sorted(set(pids), reverse=True):
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
if pids:
    time.sleep(3)
PY2
}

start_server() {
  (
    cd "$SERVER_DIR"
    nohup npm run dev > "$SERVER_LOG" 2>&1 < /dev/null &
  )
}

wait_for_backend() {
  local tries=40
  while (( tries > 0 )); do
    if port="$(find_backend_port 2>/dev/null)"; then
      echo "$port"
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  return 1
}

governance_needs_refresh() {
  local backend_port="$1"
  local quant_port="$2"
  local governance quant_health
  governance="$(curl -fsS "http://127.0.0.1:${backend_port}/aqea-governance/summary")" || return 1
  quant_health="$(curl -fsS "http://127.0.0.1:${quant_port}/health/models")" || return 1
  GOVERNANCE_PAYLOAD="$governance" QUANT_HEALTH_PAYLOAD="$quant_health" python3 - <<'PY2'
import json, os
summary = json.loads(os.environ['GOVERNANCE_PAYLOAD'])
q = json.loads(os.environ['QUANT_HEALTH_PAYLOAD'])
models = summary.get('models', {})
cnn_ready = models.get('CNN', {}).get('readiness') == 'READY'
ppo_ready = models.get('PPO', {}).get('readiness') == 'READY'
quant_ok = q.get('cnn') == 'HEALTHY' and q.get('ppo') == 'HEALTHY'
raise SystemExit(0 if (quant_ok and (not cnn_ready or not ppo_ready)) else 1)
PY2
}

check_header_consistency() {
  local backend_port="$1"
  local header
  header="$(curl -fsS "http://127.0.0.1:${backend_port}/aqea-ui/header")" || return 1
  HEADER_PAYLOAD="$header" python3 - <<'PY2'
import json, os, sys
items = json.loads(os.environ['HEADER_PAYLOAD'])
if not isinstance(items, list) or not items:
    print('WARNING: header payload empty')
    raise SystemExit(0)
all_hold = all(item.get('decision') == 'HOLD' for item in items)
all_50 = all(float(item.get('aqeaScore', 0)) == 50 for item in items)
if all_hold and all_50:
    print('WARNING: header has only HOLD/50 scores; runtime is healthy but there are no fresh decision attributions yet')
PY2
}

check_dashboard_summary() {
  local backend_port="$1"
  [[ -n "$USER_ID" ]] || return 0
  local payload
  payload="$(curl -fsS "http://127.0.0.1:${backend_port}/aqea-ui/dashboard?userId=${USER_ID}")" || return 0
  DASH_PAYLOAD="$payload" python3 - <<'PY2'
import json, os
payload = json.loads(os.environ['DASH_PAYLOAD'])
regime = payload.get('summary', {}).get('regime', {})
strength = regime.get('strength')
consensus = regime.get('consensus')
if strength == 0 and consensus == 0:
    print('WARNING: dashboard regime strength/consensus are 0 for this user response')
PY2
}

print_status() {
  local backend_port="$1"
  local quant_port="$2"
  say "Quant health"
  curl -fsS "http://127.0.0.1:${quant_port}/health"
  printf '\n'
  curl -fsS "http://127.0.0.1:${quant_port}/health/models"
  printf '\n'
  say "Governance summary"
  curl -fsS "http://127.0.0.1:${backend_port}/aqea-governance/summary"
  printf '\n'
  say "System status"
  curl -fsS "http://127.0.0.1:${backend_port}/system/status"
  printf '\n'
}

main() {
  local backend_port
  backend_port="$(find_backend_port)" || fail "Could not find backend port exposing /system/status"
  say "Backend port: $backend_port"
  local frontend_port=""
  frontend_port="$(find_frontend_port || true)"
  [[ -n "$frontend_port" ]] && say "Frontend port: $frontend_port"

  patch_manifest
  patch_validator

  say "Validating model checkpoints"
  "$QUANT_VENV_PY" "$MODEL_VALIDATOR"

  local quant_port=""
  if quant_port="$(read_quant_port 2>/dev/null)"; then
    if ! wait_for_endpoint "http://127.0.0.1:${quant_port}/health" 3 || ! system_has_quant "$backend_port" "$quant_port" >/dev/null 2>&1; then
      quant_port=""
    fi
  fi

  if [[ -z "$quant_port" ]]; then
    start_quant "$backend_port"
    quant_port="$(wait_for_quant_port)" || fail "Quant port file was not created"
    say "Quant port: $quant_port"
    wait_for_endpoint "http://127.0.0.1:${quant_port}/health" 40 || {
      say "Quant failed to boot; tailing log"
      tail -n 120 "$QUANT_LOG" || true
      fail "Quant health endpoint did not become ready"
    }
    wait_for_endpoint "http://127.0.0.1:${quant_port}/health/models" 20 || fail "Quant model health endpoint did not become ready"
    system_has_quant "$backend_port" "$quant_port" >/dev/null 2>&1 || fail "Quant did not register with backend registry"
  else
    say "Existing quant is already healthy on port ${quant_port}"
  fi

  if governance_needs_refresh "$backend_port" "$quant_port"; then
    warn "Governance cache is stale; restarting server watcher"
    stop_server_watchers
    start_server
    backend_port="$(wait_for_backend)" || fail "Backend did not come back after restart"
    say "Backend port after refresh: $backend_port"
    sleep 4
  fi

  print_status "$backend_port" "$quant_port"
  check_header_consistency "$backend_port"
  check_dashboard_summary "$backend_port"
  say "Repair completed"
}

main "$@"
