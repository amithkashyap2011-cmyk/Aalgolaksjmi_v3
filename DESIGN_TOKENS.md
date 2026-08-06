# Design Tokens — AALGOLAKSHMI

Single source of truth for the UI. Implemented as CSS custom properties in
`client/src/styles/design-tokens.css` (imported **last** in `main.tsx`, so it
normalises Bootstrap + Tailwind + legacy styles). Theme switches via the
`html.dark` class toggled by `useAppStore.setTheme`.

> Rule: **never hardcode hex in components.** Use a token (`var(--ds-…)`) or the
> existing theme-aware Tailwind classes (`text-secondary`, `border-financial`, …).

---

## 1. Color tokens

### Brand / semantic (identical in both themes — trading convention)
| Token | Value | Use |
|-------|-------|-----|
| `--ds-primary` | `#3b82f6` | primary actions, links, active nav |
| `--ds-primary-strong` | `#2563eb` | hover/pressed primary |
| `--ds-accent` | `#06b6d4` | secondary accent, info bars |
| `--ds-buy` | `#10b981` | LONG / BUY / positive P&L |
| `--ds-sell` | `#f43f5e` | SHORT / SELL / negative P&L |
| `--ds-hold` | `#38bdf8` | HOLD / neutral signal |
| `--ds-warning` | `#f59e0b` | caution, elevated risk |
| `--ds-info` | `#3b82f6` | informational |

### Surfaces & text (flip per theme)
| Token | Light | Dark |
|-------|-------|------|
| `--ds-bg` | `#f8fafc` | `#060b14` |
| `--ds-surface` | `#ffffff` | `#0b1220` |
| `--ds-surface-2` | `#f1f5f9` | `#1e293b` |
| `--ds-border` | `#e2e8f0` | `rgba(148,163,184,.14)` |
| `--ds-text` | `#0f172a` | `#f1f5f9` |
| `--ds-text-muted` | `#64748b` | `#94a3b8` |
| `--ds-text-faint` | `#94a3b8` | `#64748b` |

Legacy vars (`--app-bg`, `--app-card-bg`, `--app-border`, `--text-primary/secondary/muted`)
and Bootstrap vars (`--bs-body-bg`, `--bs-body-color`, `--bs-border-color`,
`--bs-success/danger/primary/warning/info`, dark `--bs-table-*`) are **mapped onto these
tokens** so existing components inherit theme-correct values with no edits.

## 2. Spacing (4px base)
`--ds-space-1`=4px · `-2`=8px · `-3`=12px · `-4`=16px · `-5`=24px · `-6`=32px

## 3. Radii
`--ds-radius-sm`=6px · `--ds-radius`=8px · `--ds-radius-lg`=12px · `--ds-radius-pill`=999px

## 4. Elevation
`--ds-shadow-sm` · `--ds-shadow` · `--ds-shadow-lg` (darker, stronger in dark theme)

## 5. Typography
- Sans: `--ds-font` → Inter / system stack
- Mono: `--ds-font-mono` → for prices, scores, hashes
- Headings clamp on mobile (`h1` 1.5rem, `h2` 1.25rem < 576px)

## 6. Normalised component classes (theme-aware)
`.card-modern` / `.card-financial` / `.ds-card` · `.border-financial` · `.bg-financial`
· `.table-modern` (header/hover/borders) · Bootstrap `.table` (dark vars) · `.form-control`
/ `.form-select` (uniform focus ring) · `.dropdown-menu` / `.offcanvas` (dark surfaces)
· `.btn` (radius + focus-visible ring) · `.custom-scrollbar` / `.no-scrollbar`.

## 7. Usage examples
```tsx
<div style={{ background: 'var(--ds-surface)', border: '1px solid var(--ds-border)' }} />
<span style={{ color: 'var(--ds-buy)' }}>+2.4%</span>
// preferred: existing theme-aware classes
<div className="card-modern p-3"><span className="text-secondary">Label</span></div>
```
