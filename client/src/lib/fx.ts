/** Pick the INR-per-USD rate to display. Uses the live rate the server returned;
 *  otherwise the last live rate we saw; otherwise null (caller must show "—"
 *  rather than an invented constant). */
export function resolveFxRate(live: unknown, previous?: number | null): number | null {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (ok(live)) return live;
  if (ok(previous)) return previous;
  return null;
}
