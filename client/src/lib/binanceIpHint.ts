/**
 * Binance appends "request ip: x.x.x.x" to -2015 key rejections — the address
 * it actually saw. On a mobile/carrier-NAT connection that changes between
 * connections, so hints show that IP instead of any fixed or locally detected
 * one (a hardcoded IP here sent the user to whitelist a stale address).
 */
export function binanceRequestIp(text: string): string | null {
  const m = /request ip:\s*([0-9a-fA-F.:]+)/i.exec(text || "");
  return m ? m[1] : null;
}

export function binanceIpHint(errMsg: string): string {
  const ip = binanceRequestIp(errMsg);
  return ip
    ? `• Binance saw this request from IP ${ip}. If your network changes IP between connections, one whitelisted IP won't hold — use a fixed IP or an Unrestricted key.`
    : `• Binance rejected the API key (wrong key, IP not whitelisted, or missing permission).`;
}
