/*
 * TOTP used for Angel One SmartAPI login, checked against the RFC 6238
 * Appendix B SHA-1 test vectors (secret = ASCII "12345678901234567890";
 * the RFC lists 8 digits, SmartAPI uses the last 6).
 */
import { generateTotp, base32Decode } from "../src/services/indianMarket/angelOne/totp.js";

const SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32("12345678901234567890")

describe("generateTotp (RFC 6238 SHA-1 vectors)", () => {
  test.each([
    [59, "287082"],          // 94287082
    [1111111109, "081804"],  // 07081804
    [1111111111, "050471"],  // 14050471
    [1234567890, "005924"],  // 89005924
    [2000000000, "279037"],  // 69279037
  ])("t=%is → %s", (t, expected) => {
    expect(generateTotp(SECRET_B32, t * 1000)).toBe(expected);
  });

  test("base32 decoding ignores spaces, padding and case", () => {
    expect(base32Decode("gezd gnbv====").toString("hex")).toBe(base32Decode("GEZDGNBV").toString("hex"));
  });

  test("rejects a non-base32 secret instead of generating a wrong code", () => {
    expect(() => generateTotp("not-base32!", 0)).toThrow(/base32/);
  });
});
