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
    });
    isInitialized = true;
  }
  return Highcharts;
}
