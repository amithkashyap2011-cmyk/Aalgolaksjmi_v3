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
    if (await User.findOne({ email })) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });

    // seed default settings
    await Settings.create({ userId: user._id });

    const token = signToken(user._id.toString());
    res.status(201).json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Bad request" });
  }
});

/* ── login ────────────────────────────────────────────── */

router.post("/login", async (req, res) => {
  try {
    const { email, password } = LoginBody.parse(req.body);
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signToken(user._id.toString());
    res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Bad request" });
  }
});

/* ── me ───────────────────────────────────────────────── */

router.get("/me", authGuard, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId).select("-passwordHash");
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
