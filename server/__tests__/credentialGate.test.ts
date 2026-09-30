import { jest } from "@jest/globals";
const gate = await import("../src/services/credentialGate.js");
const { binanceSignedFetch } = await import("../src/services/binanceProxy.js");

afterEach(() => { gate.setGateForTesting({}); jest.restoreAllMocks(); });

test("a disabled Binance gate stops key-carrying requests before anything is sent", async () => {
  const spy = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  gate.setGateForTesting({ binance: true });
  await expect(binanceSignedFetch("https://api.binance.com/api/v3/account")).rejects.toThrow(/BINANCE_CREDENTIALS_DISABLED/);
  expect(spy).not.toHaveBeenCalled();
});

test("enabled = requests go out as before", async () => {
  const spy = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await binanceSignedFetch("https://api.binance.com/api/v3/account");
  expect(spy).toHaveBeenCalledTimes(1);
});

test("integrations are independent", () => {
  gate.setGateForTesting({ indmoney: true });
  expect(gate.isDisabled("indmoney")).toBe(true);
  expect(gate.isDisabled("binance")).toBe(false);
  expect(() => gate.assertEnabled("angelOne")).not.toThrow();
  expect(() => gate.assertEnabled("indmoney")).toThrow(gate.CredentialsDisabledError);
});

test("each integration maps to a persisted Settings field the route allows", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/routes/settings.ts", import.meta.url), "utf8");
  for (const f of Object.values(gate.GATE_FIELDS)) expect(src).toContain(`"${f}"`);
});
