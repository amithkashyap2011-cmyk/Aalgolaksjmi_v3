/**
 * Angel One instrument tokens for the symbols the app trades.
 *
 * Resolved 2026-09-23 from Angel's public scrip master
 * (margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json).
 * Tokens are stable exchange identifiers; the quote API needs them instead of
 * names. TATAMOTORS' token 3456 now trades as TMPV (Tata Motors Passenger
 * Vehicles) after the 2025 demerger.
 */
export interface AngelInstrument {
  exchange: "NSE" | "BSE";
  token: string;
  tradingSymbol: string;
}

export const ANGEL_INSTRUMENTS: Record<string, AngelInstrument> = {
  NIFTY50:    { exchange: "NSE", token: "99926000", tradingSymbol: "Nifty 50" },
  BANKNIFTY:  { exchange: "NSE", token: "99926009", tradingSymbol: "Nifty Bank" },
  FINNIFTY:   { exchange: "NSE", token: "99926037", tradingSymbol: "Nifty Fin Service" },
  SENSEX:     { exchange: "BSE", token: "99919000", tradingSymbol: "SENSEX" },
  RELIANCE:   { exchange: "NSE", token: "2885",     tradingSymbol: "RELIANCE-EQ" },
  TCS:        { exchange: "NSE", token: "11536",    tradingSymbol: "TCS-EQ" },
  HDFCBANK:   { exchange: "NSE", token: "1333",     tradingSymbol: "HDFCBANK-EQ" },
  INFY:       { exchange: "NSE", token: "1594",     tradingSymbol: "INFY-EQ" },
  ICICIBANK:  { exchange: "NSE", token: "4963",     tradingSymbol: "ICICIBANK-EQ" },
  TATASTEEL:  { exchange: "NSE", token: "3499",     tradingSymbol: "TATASTEEL-EQ" },
  SBIN:       { exchange: "NSE", token: "3045",     tradingSymbol: "SBIN-EQ" },
  AXISBANK:   { exchange: "NSE", token: "5900",     tradingSymbol: "AXISBANK-EQ" },
  KOTAKBANK:  { exchange: "NSE", token: "1922",     tradingSymbol: "KOTAKBANK-EQ" },
  BHARTIARTL: { exchange: "NSE", token: "10604",    tradingSymbol: "BHARTIARTL-EQ" },
  TATAMOTORS: { exchange: "NSE", token: "3456",     tradingSymbol: "TMPV-EQ" },
};

/** Reverse lookup: "NSE:2885" → "RELIANCE". */
export const SYMBOL_BY_EXCHANGE_TOKEN: Record<string, string> = Object.fromEntries(
  Object.entries(ANGEL_INSTRUMENTS).map(([sym, i]) => [`${i.exchange}:${i.token}`, sym]),
);
