/*
 * ─── Auth routes ───────────────────────────────────────
 *
 * POST /auth/register – create account
 * POST /auth/login    – get JWT
 * GET  /auth/me       – whoami (requires token)
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User.js";
import { Settings } from "../models/Settings.js";
import { authGuard, signToken, type AuthRequest } from "../middleware/auth.js";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import * as autoEngine from "../services/autoTradeEngine.js";

const router = Router();

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

/* ── register ─────────────────────────────────────────── */

router.post("/register", async (req, res) => {
  try {
    const { email, password } = RegisterBody.parse(req.body);

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database disconnected. Service unavailable." });
    }

    if (await User.findOne({ email })) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });

    // seed default settings
    await Settings.create({ userId: user._id });

    const token = signToken(user._id.toString());
    res.status(201).json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err: any) {
    console.error("[auth] Register error:", err);
    res.status(400).json({ error: err.message ?? "Registration failed" });
  }
});

/* ── login ────────────────────────────────────────────── */

router.post("/login", async (req, res) => {
  try {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const { email, password } = parsed.data;

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database disconnected. Service unavailable." });
    }

    // Live DB Auth
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signToken(user._id.toString());
    res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/* ── me ───────────────────────────────────────────────── */

router.get("/me", authGuard, async (req: AuthRequest, res) => {
  try {
    try {
      fs.appendFileSync(path.join(process.cwd(), "auto_trade.log"), `[api] /auth/me called. User is connected: ${req.userId}\n`);
    } catch {}
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database disconnected. Service unavailable." });
    }

    const user = await User.findById(req.userId).select("-passwordHash").lean();
    if (!user) {
      res.status(401).json({ error: "Invalid token or user not found" });
      return;
    }
    
    // 🛠️ Debug Fix: Force enable auto-trading on the backend instantly.
    // Enables whichever leg(s) the user actually has configured —
    // autoTradeFutures defaults true (legacy single-account-type
    // behavior), autoTradeSpot is opt-in — so this can now re-arm either
    // or both independently instead of collapsing onto one accountType.
    // Only trigger engine processing when DB is available (processUser queries Settings)
    try {
      const settings = await Settings.findOne({ userId: req.userId! });
      const wantSpot = settings?.autoTradeSpot === true;
      const wantFutures = settings?.autoTradeFutures !== false; // default true
      if (wantSpot) autoEngine.enableUser(req.userId!, "SPOT");
      if (wantFutures) autoEngine.enableUser(req.userId!, "FUTURES");
      if (mongoose.connection.readyState === 1) {
        if (wantSpot) autoEngine.processUser(req.userId!, "SPOT").catch(console.error);
        if (wantFutures) autoEngine.processUser(req.userId!, "FUTURES").catch(console.error);
      }
    } catch (engineErr: any) {
      console.warn("[auth] Engine activation failed:", engineErr.message);
    }

    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
