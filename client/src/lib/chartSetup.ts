import Highcharts from "highcharts";

let isInitialized = false;

/**
 * Initializes global Highcharts configuration lazily when chart components mount,
 * preventing Highcharts from bloat-loading into root entrypoint chunks.
 */
export function ensureHighchartsConfigured() {
  if (!isInitialized) {
    Highcharts.setOptions({
      accessibility: { enabled: false },
      // Label time axes in the viewer's local time (IST), not Highcharts' UTC
      // default, which put the latest candle 5.5h "behind" the clock.
      time: { useUTC: false },
    });
    isInitialized = true;
  }
  return Highcharts;
}
