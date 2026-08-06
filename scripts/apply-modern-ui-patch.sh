#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/Users/amithks/aalgolakshmi_v3}"
CLIENT_DIR="$REPO_ROOT/client"
MAIN_TSX="$CLIENT_DIR/src/main.tsx"
PATCH_CSS="$CLIENT_DIR/src/styles/ui-modern-patch.css"

say() {
  printf '[modern-ui] %s
' "$*"
}

require_path() {
  [[ -e "$1" ]] || {
    echo "[modern-ui] ERROR: missing path: $1" >&2
    exit 1
  }
}

require_path "$CLIENT_DIR"
require_path "$MAIN_TSX"

say "Writing advanced Material-style UI patch stylesheet"
PATCH_CSS="$PATCH_CSS" python3 - <<'PY2'
from pathlib import Path
import os
Path(os.environ['PATCH_CSS']).write_text(""":root {
  --ui-radius-xl: 28px;
  --ui-radius-lg: 22px;
  --ui-radius-md: 16px;
  --ui-radius-sm: 12px;
  --ui-shadow-soft: 0 18px 48px rgba(15, 23, 42, 0.08);
  --ui-shadow-card: 0 10px 30px rgba(15, 23, 42, 0.08);
  --ui-shadow-elevated: 0 24px 64px rgba(15, 23, 42, 0.16);
  --ui-border-soft: rgba(148, 163, 184, 0.18);
  --ui-surface-strong: rgba(255, 255, 255, 0.94);
  --ui-surface-soft: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96));
  --ui-primary: #2563eb;
  --ui-text: #0f172a;
}

html, body, #root {
  background: linear-gradient(180deg, #f3f7fb 0%, #eef4ff 100%);
}

.workspace-panel,
.container-fluid {
  color: var(--ui-text);
}

.app-shell {
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.10), transparent 22%),
    radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.08), transparent 20%),
    linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
}

.app-workspace { background: transparent !important; }
.app-main-content { padding: 1.25rem 1.5rem 5rem !important; }

.card-modern,
.card,
.card-phi {
  border-radius: var(--ui-radius-lg) !important;
  border: 1px solid var(--ui-border-soft) !important;
  background: var(--ui-surface-strong) !important;
  box-shadow: var(--ui-shadow-card) !important;
  overflow: hidden;
  backdrop-filter: blur(14px);
}

.card-header {
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94)) !important;
  border-bottom: 1px solid var(--ui-border-soft) !important;
}

.bg-light.rounded-financial,
.bg-light.rounded-financial.border,
.card-body .bg-light,
.dropdown-menu .bg-light {
  background: var(--ui-surface-soft) !important;
  border-color: var(--ui-border-soft) !important;
}

.rounded-financial,
.rounded-lg,
.btn,
button,
.dropdown-menu { border-radius: var(--ui-radius-md); }
.btn, button { transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease, background-color 160ms ease; }
.btn:hover, button:hover { transform: translateY(-1px); }
.badge { border-radius: 9999px; font-weight: 700; letter-spacing: 0.06em; }

.sidebar-modern {
  background: linear-gradient(180deg, #0c1528 0%, #0f1b31 100%) !important;
  border-right: 1px solid rgba(148, 163, 184, 0.14) !important;
  box-shadow: inset -1px 0 0 rgba(255,255,255,0.04), 18px 0 40px rgba(15, 23, 42, 0.22);
}

.app-sidebar-brand { border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.app-sidebar-logo {
  border-radius: 18px !important;
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.28);
}
.app-sidebar-toggle { width: 2.5rem; min-width: 2.5rem; min-height: 2.5rem; border-radius: 9999px !important; }
.app-sidebar-status { border-top-color: rgba(255,255,255,0.08) !important; }

.nav-link-modern,
.offcanvas .nav-link-modern {
  border-radius: 18px;
  padding: 0.95rem 1rem !important;
  color: #aeb9cc !important;
  border: 1px solid transparent;
}
.nav-link-modern:hover,
.offcanvas .nav-link-modern:hover {
  color: #ffffff !important;
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.06);
}
.nav-link-modern.active {
  color: #ffffff !important;
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  border-color: rgba(96, 165, 250, 0.22) !important;
  box-shadow: 0 16px 28px rgba(37, 99, 235, 0.26);
}

.market-ribbon {
  background: linear-gradient(90deg, #08111f 0%, #0d1b2f 52%, #08111f 100%) !important;
  border-bottom-color: rgba(148, 163, 184, 0.14) !important;
  box-shadow: 0 6px 20px rgba(2, 6, 23, 0.24);
}
.market-ribbon-label { min-width: 156px; color: #b6c2d7; background: rgba(255,255,255,0.03); letter-spacing: 0.18em; }
.market-ribbon-track { mask-image: linear-gradient(to right, transparent, black 6%, black 94%, transparent); }
.market-ribbon-item { min-width: 360px; border-right: 1px solid rgba(148,163,184,0.12); }
.market-ribbon-item:hover { background: rgba(255,255,255,0.04); }
.market-ribbon-symbol { color: #e2e8f0; letter-spacing: 0.08em; }
.market-ribbon-price { color: #f8fafc; font-variant-numeric: tabular-nums; }
.market-ribbon-inr { color: #94a3b8; }
.market-ribbon-badge { border: 1px solid transparent; border-radius: 9999px !important; }
.market-ribbon-badge.signal-long { background: rgba(16,185,129,0.14); color: #6ee7b7; border-color: rgba(16,185,129,0.22); }
.market-ribbon-badge.signal-short { background: rgba(239,68,68,0.14); color: #fda4af; border-color: rgba(239,68,68,0.22); }
.market-ribbon-badge.signal-hold { background: rgba(245,158,11,0.14); color: #fcd34d; border-color: rgba(245,158,11,0.22); }
.market-ribbon-badge.signal-sync { background: rgba(56,189,248,0.14); color: #7dd3fc; border-color: rgba(56,189,248,0.22); }
.animate-marquee { animation-duration: 78s !important; }

.app-topbar {
  background: rgba(248, 250, 252, 0.78) !important;
  backdrop-filter: blur(18px);
  border-bottom-color: rgba(148, 163, 184, 0.18) !important;
}
.app-topbar-shell { gap: 1rem; }
.app-status-cluster { gap: 1rem; }
.app-regime-card {
  background: rgba(255,255,255,0.86) !important;
  border-radius: 20px !important;
  padding: 0.65rem 0.85rem !important;
  box-shadow: inset 0 0 0 1px rgba(148,163,184,0.08);
}
.app-metrics-rail {
  background: rgba(255,255,255,0.88) !important;
  border-radius: 24px !important;
  padding: 0.35rem !important;
  box-shadow: var(--ui-shadow-soft);
}
.app-metric-card { min-width: 132px; }
.app-metric-card > .d-flex { min-height: 3.25rem; justify-content: center; }
.app-topbar-actions .btn { min-height: 2.75rem; font-size: 0.68rem; letter-spacing: 0.14em; }
.btn-material-warn { background: linear-gradient(135deg, #facc15, #f59e0b) !important; color: #111827 !important; border: none !important; box-shadow: 0 16px 28px rgba(245,158,11,0.18) !important; }
.btn-material-danger { background: linear-gradient(135deg, #f43f5e, #ef4444) !important; color: #ffffff !important; border: none !important; box-shadow: 0 16px 28px rgba(239,68,68,0.22) !important; }
.app-icon-button { min-width: 2.75rem; min-height: 2.75rem; background: rgba(255,255,255,0.82) !important; }
.app-avatar-badge { background: linear-gradient(135deg, #3b82f6, #2563eb) !important; box-shadow: 0 14px 30px rgba(37,99,235,0.24); }
.dropdown-menu { background: rgba(255,255,255,0.94) !important; border: 1px solid var(--ui-border-soft) !important; box-shadow: 0 24px 64px rgba(15,23,42,0.16) !important; backdrop-filter: blur(18px); }
.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
.custom-scrollbar::-webkit-scrollbar-track { background: rgba(148,163,184,0.10); border-radius: 9999px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.36); border-radius: 9999px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(71,85,105,0.48); }

@media (max-width: 1399px) {
  .app-topbar-shell { height: auto !important; min-height: 84px; padding: 0.75rem 0; }
  .app-metric-card { min-width: 118px; }
}

@media (max-width: 991px) {
  .app-main-content { padding: 1rem 1rem 4rem !important; }
  .market-ribbon-label { min-width: 128px; }
  .market-ribbon-item { min-width: 300px; }
  .animate-marquee { animation-duration: 96s !important; }
  .app-topbar { top: 56px !important; }
}
""")
PY2

say "Ensuring patch stylesheet is imported"
MAIN_TSX="$MAIN_TSX" python3 - <<'PY2'
from pathlib import Path
import os
path = Path(os.environ['MAIN_TSX'])
text = path.read_text()
import_line = 'import "./styles/ui-modern-patch.css";\n'
anchor = 'import "./styles/modern.css";\n'
if import_line not in text:
    if anchor not in text:
        raise SystemExit('Could not find modern.css import anchor')
    text = text.replace(anchor, anchor + import_line)
    path.write_text(text)
PY2

say "Advanced UI patch applied"
