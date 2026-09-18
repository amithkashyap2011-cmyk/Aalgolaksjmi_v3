/*
 * ─── Authoritative Role-Based Access Control (RBAC) ───────────
 *
 * Implements authoritative authorization for AALGOLAKSHMI V3.
 * Eliminates Warning #1 with explicit roles and 15 defined permissions.
 */
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.js";
import { User } from "../models/User.js";

export type Role =
  | "VIEWER"
  | "ANALYST"
  | "TRADER"
  | "OPERATOR"
  | "ADMIN"
  | "SYSTEM";

export type Permission =
  | "VIEW_DASHBOARD"
  | "VIEW_POSITIONS"
  | "VIEW_ORDERS"
  | "CREATE_ORDER"
  | "CANCEL_ORDER"
  | "APPROVE_AI_PROPOSAL"
  | "ENABLE_AUTONOMOUS"
  | "DISABLE_AUTONOMOUS"
  | "CHANGE_RISK_LIMIT"
  | "CHANGE_STRATEGY"
  | "CHANGE_BROKER"
  | "VIEW_SECRETS"
  | "MANAGE_USERS"
  | "EMERGENCY_STOP"
  | "RESET_SYSTEM";

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  VIEWER: new Set<Permission>([
    "VIEW_DASHBOARD",
    "VIEW_POSITIONS",
    "VIEW_ORDERS",
  ]),

  ANALYST: new Set<Permission>([
    "VIEW_DASHBOARD",
    "VIEW_POSITIONS",
    "VIEW_ORDERS",
  ]),

  TRADER: new Set<Permission>([
    "VIEW_DASHBOARD",
    "VIEW_POSITIONS",
    "VIEW_ORDERS",
    "CREATE_ORDER",
    "CANCEL_ORDER",
    "APPROVE_AI_PROPOSAL",
    "ENABLE_AUTONOMOUS",
    "DISABLE_AUTONOMOUS",
    "EMERGENCY_STOP",
  ]),

  OPERATOR: new Set<Permission>([
    "VIEW_DASHBOARD",
    "VIEW_POSITIONS",
    "VIEW_ORDERS",
    "CREATE_ORDER",
    "CANCEL_ORDER",
    "APPROVE_AI_PROPOSAL",
    "ENABLE_AUTONOMOUS",
    "DISABLE_AUTONOMOUS",
    "CHANGE_STRATEGY",
    "EMERGENCY_STOP",
  ]),

  ADMIN: new Set<Permission>([
    "VIEW_DASHBOARD",
    "VIEW_POSITIONS",
    "VIEW_ORDERS",
    "CREATE_ORDER",
    "CANCEL_ORDER",
    "APPROVE_AI_PROPOSAL",
    "ENABLE_AUTONOMOUS",
    "DISABLE_AUTONOMOUS",
    "CHANGE_RISK_LIMIT",
    "CHANGE_STRATEGY",
    "CHANGE_BROKER",
    "VIEW_SECRETS",
    "MANAGE_USERS",
    "EMERGENCY_STOP",
    "RESET_SYSTEM",
  ]),

  SYSTEM: new Set<Permission>([
    "VIEW_DASHBOARD",
    "VIEW_POSITIONS",
    "VIEW_ORDERS",
    "CREATE_ORDER",
    "CANCEL_ORDER",
    "APPROVE_AI_PROPOSAL",
    "ENABLE_AUTONOMOUS",
    "DISABLE_AUTONOMOUS",
    "CHANGE_RISK_LIMIT",
    "CHANGE_STRATEGY",
    "EMERGENCY_STOP",
    "RESET_SYSTEM",
  ]),
};

/**
 * Normalizes legacy database role strings ("user", "admin") into authoritative Role enums.
 */
export function normalizeRole(rawRole?: string): Role {
  if (!rawRole) return "VIEWER";
  const upper = rawRole.toUpperCase();
  if (upper === "ADMIN") return "ADMIN";
  if (upper === "USER") return "TRADER";
  if (upper === "VIEWER") return "VIEWER";
  if (upper === "ANALYST") return "ANALYST";
  if (upper === "TRADER") return "TRADER";
  if (upper === "OPERATOR") return "OPERATOR";
  if (upper === "SYSTEM") return "SYSTEM";
  return "VIEWER";
}

/**
 * Checks whether a given role holds a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permSet = ROLE_PERMISSIONS[role];
  return permSet ? permSet.has(permission) : false;
}

/**
 * Express middleware to enforce a required permission on an authenticated endpoint.
 */
export function requirePermission(permission: Permission) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Check for authenticated user ID
      if (!req.userId) {
        res.status(401).json({
          success: false,
          error: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required to access this endpoint",
        });
        return;
      }

      // 2. Fetch user and determine role
      let userRole: Role = "VIEWER";
      if (req.user && req.user.role) {
        userRole = normalizeRole(req.user.role);
      } else {
        const dbUser = await User.findById(req.userId).select("role").lean();
        if (!dbUser) {
          res.status(401).json({
            success: false,
            error: "USER_NOT_FOUND",
            message: "Authenticated identity does not exist in ledger authority",
          });
          return;
        }
        userRole = normalizeRole(dbUser.role);
      }

      // 3. Verify permission
      if (!hasPermission(userRole, permission)) {
        console.warn(
          `[RBAC_DENIED] userId=${req.userId} role=${userRole} attempted unauthorized action=${permission} path=${req.originalUrl || req.path}`
        );
        res.status(403).json({
          success: false,
          error: "FORBIDDEN",
          requiredPermission: permission,
          userRole,
          message: `Role ${userRole} is not authorized for permission ${permission}`,
        });
        return;
      }

      // 4. Attach resolved role to request
      req.user = { ...(req.user || {}), role: userRole };
      next();
    } catch (err: any) {
      console.error("[RBAC_ERROR]", err);
      res.status(500).json({ success: false, error: "AUTHORIZATION_INTERNAL_ERROR" });
    }
  };
}

/**
 * Express middleware requiring at least one of the specified permissions.
 */
export function requireAnyPermission(permissions: Permission[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        res.status(401).json({
          success: false,
          error: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required",
        });
        return;
      }

      let userRole: Role = "VIEWER";
      if (req.user && req.user.role) {
        userRole = normalizeRole(req.user.role);
      } else {
        const dbUser = await User.findById(req.userId).select("role").lean();
        if (!dbUser) {
          res.status(401).json({ success: false, error: "USER_NOT_FOUND" });
          return;
        }
        userRole = normalizeRole(dbUser.role);
      }

      const isAllowed = permissions.some((p) => hasPermission(userRole, p));
      if (!isAllowed) {
        res.status(403).json({
          success: false,
          error: "FORBIDDEN",
          requiredPermissions: permissions,
          userRole,
        });
        return;
      }

      req.user = { ...(req.user || {}), role: userRole };
      next();
    } catch (err: any) {
      res.status(500).json({ success: false, error: "AUTHORIZATION_INTERNAL_ERROR" });
    }
  };
}
