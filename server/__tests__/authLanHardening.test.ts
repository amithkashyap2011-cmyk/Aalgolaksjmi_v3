process.env.JWT_SECRET = "test-secret-for-jwt-unit-tests-1234567890";
import { jest } from "@jest/globals";
import { optionalAuth, enforceOwnUserId, authAndAdminMutations, signToken, type AuthRequest } from "../src/middleware/auth";

const lan = (extra: any = {}): any => ({ headers: {}, socket: { remoteAddress: "192.168.1.50" }, method: "GET", query: {}, body: {}, ...extra });
const local = (extra: any = {}): any => ({ headers: {}, socket: { remoteAddress: "127.0.0.1" }, method: "GET", query: {}, body: {}, ...extra });
const mkRes = (): any => ({ status(c: number) { this.code = c; return this; }, json() { return this; } });

describe("LAN hardening", () => {
  test("optionalAuth gives no demo identity to LAN peers", () => {
    const req = lan(); const next = jest.fn();
    optionalAuth(req, {} as any, next as any);
    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
  test("optionalAuth still gives loopback operator the demo identity", () => {
    const req = local();
    optionalAuth(req, {} as any, jest.fn() as any);
    expect(req.userId).toBeDefined();
  });
  test("enforceOwnUserId pins non-admin userId in query and body", () => {
    const req: AuthRequest = lan({ userId: "me", user: { id: "me", role: "user" }, query: { userId: "victim" }, body: { userId: "victim" } });
    enforceOwnUserId(req, {} as any, jest.fn() as any);
    expect((req.query as any).userId).toBe("me");
    expect(req.body.userId).toBe("me");
  });
  test("mutation guard rejects anonymous LAN POST with 401", async () => {
    const res = mkRes(); const next = jest.fn();
    await (authAndAdminMutations[0] as any)(lan({ method: "POST" }), res, next);
    expect(res.code).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
  test("non-admin JWT POST gets 403", async () => {
    const token = signToken("507f1f77bcf86cd799439011", "TRADER");
    const req = lan({ method: "POST", headers: { authorization: `Bearer ${token}` } });
    const res = mkRes(); const next = jest.fn();
    await (authAndAdminMutations[0] as any)(req, res, next);
    await (authAndAdminMutations[1] as any)(req, res, next);
    expect(res.code).toBe(403);
  });
});
