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

export function authGuard(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed token" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
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
    const user = await User.findById(req.userId).select("role").lean();
    if (!user || user.role !== "admin") {
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
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { sub: string };
    req.userId = payload.sub;
  } catch {
    // ignore invalid tokens for optional auth
  }
  next();
}

/** Helper to sign a token */
export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}
