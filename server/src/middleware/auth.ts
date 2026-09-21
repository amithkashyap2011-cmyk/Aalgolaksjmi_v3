/*
 * ─── JWT auth middleware ───────────────────────────────
 *
 * Attaches req.userId (ObjectId string) from a valid Bearer token.
 */
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
}

/** Seeded demo account used only outside production for anonymous access. */
export const DEMO_USER_ID = "6a39c0e7a5e2995ed257ca68";

export async function authGuard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    if (process.env.NODE_ENV !== "production") {
      req.userId = DEMO_USER_ID;
      req.user = { id: DEMO_USER_ID, role: "ADMIN" };
      return next();
    }
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice(7).trim();
  if (!token || token === "null" || token === "undefined") {
    if (process.env.NODE_ENV !== "production") {
      req.userId = DEMO_USER_ID;
      req.user = { id: DEMO_USER_ID, role: "ADMIN" };
      return next();
    }
    res.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub?: string; userId?: string; role?: string };
    req.userId = payload.sub || payload.userId;
    if (req.userId) {
      if (payload.role) {
        req.user = { id: req.userId, role: payload.role };
      }
      return next();
    }
    if (process.env.NODE_ENV !== "production") {
      req.userId = DEMO_USER_ID;
      req.user = { id: DEMO_USER_ID, role: "ADMIN" };
      return next();
    }
    res.status(401).json({ error: "Invalid token payload" });
  } catch {
    if (process.env.NODE_ENV !== "production") {
      req.userId = DEMO_USER_ID;
      req.user = { id: DEMO_USER_ID, role: "ADMIN" };
      return next();
    }
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * 🛡️ Admin-only middleware.
 * Must be placed AFTER authGuard in the route chain.
 */
export async function adminGuard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    let role = req.user?.role;
    if (!role) {
      const user = await User.findById(req.userId).select("role").lean();
      role = user?.role;
    }
    const upperRole = String(role || "").toUpperCase();
    if (upperRole !== "ADMIN") {
      console.warn(`[SECURITY] Unauthorized admin access attempt by userId: ${req.userId}`);
      res.status(403).json({ error: "Forbidden: Admin privileges required" });
      return;
    }
    next();
  } catch (err) {
    res.status(500).json({ error: "Security check failed" });
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { sub?: string; userId?: string; role?: string };
      req.userId = payload.sub || payload.userId;
      if (payload.role) {
        req.user = { id: req.userId, role: payload.role };
      }
      if (req.userId) return next();
    } catch {
      // ignore invalid tokens for optional auth
    }
  }
  // Outside production, fall back to the seeded demo account so the dashboard
  // is usable without a login. In production an anonymous/invalid-token request
  // must stay unauthenticated (req.userId undefined) so downstream guards 401
  // instead of silently transacting against a real account.
  if (!req.userId && process.env.NODE_ENV !== "production") {
    req.userId = DEMO_USER_ID;
  }
  next();
}

/** Helper to sign a token with an optional role */
export function signToken(userId: string, role?: string): string {
  const payload: any = { sub: userId, userId };
  if (role) payload.role = role;
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "7d" });
}
