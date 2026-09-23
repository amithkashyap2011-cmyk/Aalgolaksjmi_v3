/**
 * Indian live-broker availability.
 *
 * No real Indian broker (Angel One SmartAPI / Zerodha Kite) is integrated yet:
 * the server's LIVE adapter refuses every order and the Angel One "test" call
 * reports NOT_INTEGRATED. Until a real adapter lands, the UI must not offer or
 * imply Indian LIVE trading. Flip this only together with the server adapter.
 */
export const INDIAN_LIVE_AVAILABLE = false;

export const INDIAN_LIVE_UNAVAILABLE_MESSAGE =
  "Indian LIVE trading isn't available yet.\n\nNo broker (Angel One / Kite) is connected — Indian trading is paper-only on simulated prices. Staying on PAPER.";
