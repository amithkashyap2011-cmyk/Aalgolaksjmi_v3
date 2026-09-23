/*
 * Regression: Angel One secrets encrypted at rest and never returned (2026-09-23).
 *
 * The API key, PIN and TOTP secret sat in plaintext in Settings and
 * GET /settings/get returned them to the browser.
 */
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a".repeat(64);

import {
  sealSecret,
  openSecret,
  isSealed,
  redactAngelSecrets,
  sealIncomingAngelSecrets,
  readAngelOneCredentials,
} from "../src/services/indianMarket/angelOneCredentials.js";

describe("Angel One credential sealing", () => {
  test("sealed values round-trip and don't contain the plaintext", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP");
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(openSecret(sealed)).toBe("JBSWY3DPEHPK3PXP");
  });

  test("legacy plaintext is still readable (pre-migration)", () => {
    expect(openSecret("1234")).toBe("1234");
    expect(openSecret("")).toBe("");
  });

  test("redaction removes every secret and exposes only flags + masked key", () => {
    const out: any = redactAngelSecrets({
      angelOneApiKey: sealSecret("AbCdWXYZ"),
      angelOneClientCode: "A123456",
      angelOnePin: sealSecret("9071"),
      angelOneTotpSecret: "",
      allowedSymbols: ["BTCUSDT"],
    });
    expect(out.angelOneApiKey).toBeUndefined();
    expect(out.angelOnePin).toBeUndefined();
    expect(out.angelOneTotpSecret).toBeUndefined();
    expect(out).toMatchObject({ angelOneApiKeySet: true, angelOnePinSet: true, angelOneTotpSecretSet: false, angelOneApiKeyMasked: "••••WXYZ", angelOneClientCode: "A123456" });
    expect(JSON.stringify(out)).not.toContain("9071");
  });

  test("incoming update: blank keeps, null clears, text is sealed", () => {
    const u: Record<string, unknown> = { angelOneApiKey: "", angelOnePin: null, angelOneTotpSecret: "SECRET", angelOneClientCode: "A1" };
    sealIncomingAngelSecrets(u);
    expect("angelOneApiKey" in u).toBe(false);
    expect(u.angelOnePin).toBe("");
    expect(isSealed(u.angelOneTotpSecret)).toBe(true);
    expect(openSecret(u.angelOneTotpSecret)).toBe("SECRET");
    expect(u.angelOneClientCode).toBe("A1");
  });

  test("readAngelOneCredentials decrypts for server-side use", () => {
    const creds = readAngelOneCredentials({ angelOneApiKey: sealSecret("key1"), angelOneClientCode: "A1", angelOnePin: sealSecret("9876"), angelOneTotpSecret: "legacyTOTP" });
    expect(creds).toMatchObject({ apiKey: "key1", clientCode: "A1", pin: "9876", totpSecret: "legacyTOTP", disabled: false });
  });
});
