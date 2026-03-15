/*
 * ─── Auth Middleware Unit Tests ────────────────────────
 *
 * Tests signToken, authGuard (JWT verify), and edge cases.
 */

process.env.JWT_SECRET = "test-secret-for-jwt-unit-tests-1234567890";

import jwt from "jsonwebtoken";
import { jest } from "@jest/globals";
import { signToken, authGuard, type AuthRequest } from "../src/middleware/auth";
import type { Response, NextFunction } from "express";

/** Create a minimal mock request */
function mockReq(headers: Record<string, string> = {}): AuthRequest {
  return { headers } as AuthRequest;
}

/** Create a mock response with status/json spy */
function mockRes(): Response & { _status: number; _json: unknown } {
  const res: any = { _status: 0, _json: null };
  res.status = (code: number) => { res._status = code; return res; };
  res.json = (body: unknown) => { res._json = body; return res; };
  return res;
}

describe("signToken", () => {
  test("TC-F1: returns a valid JWT string", () => {
    const token = signToken("abc123");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  test("TC-F2: payload contains sub claim", () => {
    const token = signToken("user42");
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
    expect(decoded.sub).toBe("user42");
  });

  test("TC-F3: token has expiry", () => {
    const token = signToken("user42");
    const decoded = jwt.decode(token) as { exp: number };
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });
});

describe("authGuard", () => {
  test("TC-F4: sets req.userId and calls next on valid token", () => {
    const token = signToken("myUserId");
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    authGuard(req, res as Response, next);
    expect(req.userId).toBe("myUserId");
    expect(next).toHaveBeenCalled();
  });

  test("TC-F5: returns 401 when no Authorization header", () => {
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    authGuard(req, res as Response, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("TC-F6: returns 401 when header is not Bearer", () => {
    const req = mockReq({ authorization: "Basic abc123" });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    authGuard(req, res as Response, next);
    expect(res._status).toBe(401);
    expect((res._json as any).error).toMatch(/Missing|malformed/i);
  });

  test("TC-F7: returns 401 on invalid/expired token", () => {
    const fakeToken = jwt.sign({ sub: "x" }, "wrong-secret", { expiresIn: "1s" });
    const req = mockReq({ authorization: `Bearer ${fakeToken}` });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    authGuard(req, res as Response, next);
    expect(res._status).toBe(401);
    expect((res._json as any).error).toMatch(/Invalid|expired/i);
    expect(next).not.toHaveBeenCalled();
  });

  test("TC-F8: returns 401 on malformed JWT", () => {
    const req = mockReq({ authorization: "Bearer not.a.jwt" });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    authGuard(req, res as Response, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
