/**
 * Indian live-broker availability.
 *
 * Angel One SmartAPI is integrated READ-ONLY (real prices, profile, funds,
 * holdings, positions); there is no order placement, and the server's LIVE
 * adapter refuses every order. Until real order routing lands, the UI must not
 * offer Indian LIVE trading. Flip this only together with the server adapter.
 */
export const INDIAN_LIVE_AVAILABLE = false;

export const INDIAN_LIVE_UNAVAILABLE_MESSAGE =
  "Indian LIVE trading isn't available yet.\n\nAngel One is connected read-only (real prices and account data), but order placement isn't enabled — Indian trading stays on PAPER.";
