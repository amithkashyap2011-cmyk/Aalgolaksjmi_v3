import Highcharts from "highcharts";

let isInitialized = false;

/**
 * Initializes global Highcharts configuration lazily when chart components mount,
 * preventing Highcharts from bloat-loading into root entrypoint chunks.
 */
// Highcharts 12+ deprecates time.useUTC in favour of time.timezone. Using the
// browser's own IANA zone keeps "the viewer's local time" (including DST).
export const VIEWER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function ensureHighchartsConfigured() {
  if (!isInitialized) {
    Highcharts.setOptions({
      accessibility: { enabled: false },
      // Label time axes in the viewer's local time (IST), not Highcharts' UTC
      // default, which put the latest candle 5.5h "behind" the clock.
      time: { timezone: VIEWER_TIMEZONE },
    });
    isInitialized = true;
  }
  return Highcharts;
}
