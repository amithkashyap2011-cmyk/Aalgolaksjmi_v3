import { extractBinanceRequestIp, getBinanceAuthStatus, handleRestError } from "../src/services/binanceService.js";

// 2026-09-27: the LIVE banner and close-error hints hardcoded stale IPs while
// Binance was rejecting requests from a different, rotating carrier-NAT IP.
// The server now records the IP Binance reports in its -2015 body.
describe("Binance API-key rejection tracking", () => {
  const futures401 = '{"code":-2015,"msg":"Invalid API-key, IP, or permissions for action, request ip: 157.35.5.186"}';

  test("extracts the IP Binance saw from a -2015 body", () => {
    expect(extractBinanceRequestIp(futures401)).toBe("157.35.5.186");
    expect(extractBinanceRequestIp('{"code":-2015,"msg":"Invalid API-key, IP, or permissions for action."}')).toBeNull();
    expect(extractBinanceRequestIp("request ip: 2409:408c:adc5::1")).toBe("2409:408c:adc5::1");
  });

  test("records -2015 per surface with code, message and request IP", () => {
    handleRestError(401, futures401, "futures");
    handleRestError(401, '{"code":-2015,"msg":"Invalid API-key, IP, or permissions for action."}', "spot");
    const s = getBinanceAuthStatus();
    expect(s.futures).toMatchObject({ surface: "futures", code: -2015, requestIp: "157.35.5.186" });
    expect(s.spot).toMatchObject({ surface: "spot", code: -2015, requestIp: null });
  });

  test("ignores non-auth errors (rate limits etc.)", () => {
    const before = JSON.stringify(getBinanceAuthStatus());
    handleRestError(400, '{"code":-1121,"msg":"Invalid symbol."}', "spot");
    expect(JSON.stringify(getBinanceAuthStatus())).toBe(before);
  });
});
