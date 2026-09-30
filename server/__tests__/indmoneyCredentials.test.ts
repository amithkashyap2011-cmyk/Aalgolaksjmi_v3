import { jest } from "@jest/globals";
process.env.ENCRYPTION_KEY ||= "0".repeat(64);
const { redactIndmoneySecrets, sealIncomingIndmoneySecrets, readIndmoneyToken, fetchIndmoneyProfile } =
  await import("../src/services/indianMarket/indmoneyCredentials.js");

describe("INDmoney token handling", () => {
  test("sealed at rest, strips a Bearer prefix, and round-trips", () => {
    const u: Record<string, unknown> = { indmoneyAccessToken: "  Bearer abc123def456  " };
    sealIncomingIndmoneySecrets(u);
    expect(String(u.indmoneyAccessToken)).toMatch(/^enc:v1:/);
    expect(String(u.indmoneyAccessToken)).not.toContain("abc123");
    expect(readIndmoneyToken(u)).toBe("abc123def456");
  });
  test("blank keeps the stored value, null clears it", () => {
    const blank: Record<string, unknown> = { indmoneyAccessToken: "   " };
    sealIncomingIndmoneySecrets(blank);
    expect("indmoneyAccessToken" in blank).toBe(false);
    const clear: Record<string, unknown> = { indmoneyAccessToken: null };
    sealIncomingIndmoneySecrets(clear);
    expect(clear.indmoneyAccessToken).toBe("");
  });
  test("the browser copy has no token, only a flag and a masked tail", () => {
    const u: Record<string, unknown> = { indmoneyAccessToken: "abc123def456", other: 1 };
    sealIncomingIndmoneySecrets(u);
    const out: any = redactIndmoneySecrets(u);
    expect(out.indmoneyAccessToken).toBeUndefined();
    expect(out.indmoneyAccessTokenSet).toBe(true);
    expect(out.indmoneyAccessTokenMasked).toBe("••••f456");
    expect(JSON.stringify(out)).not.toContain("abc123");
    expect(out.other).toBe(1);
  });
  test("profile check sends the token as Authorization and explains a rejection", async () => {
    const ok = jest.fn(async (_u: any, init: any) => {
      expect(init.headers.Authorization).toBe("tok");
      return new Response(JSON.stringify({ data: { first_name: "A" } }), { status: 200 });
    });
    expect(await fetchIndmoneyProfile("tok", ok as any)).toEqual({ first_name: "A" });
    const bad = jest.fn(async () => new Response("{}", { status: 401 }));
    await expect(fetchIndmoneyProfile("tok", bad as any)).rejects.toThrow(/expired/);
  });
});
