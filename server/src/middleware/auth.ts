/*
 * ─── JWT auth middleware ───────────────────────────────
 *
 * Attaches req.userId (ObjectId string) from a valid Bearer token.
 */
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: string;
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

/** Helper to sign a token */
export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}
