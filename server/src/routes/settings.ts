/*
 * ─── Settings routes ───────────────────────────────────
 *
 * GET  /settings/get    – fetch user settings
 * PUT  /settings/update – partial update
 */
import { Router } from "express";
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import { Settings } from "../models/Settings.js";

const router = Router();

router.get("/get", authGuard, async (req: AuthRequest, res) => {
  try {
    let doc = await Settings.findOne({ userId: req.userId });
    if (!doc) doc = await Settings.create({ userId: req.userId });
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/update", authGuard, async (req: AuthRequest, res) => {
  try {
    const doc = await Settings.findOneAndUpdate(
      { userId: req.userId },
      { $set: req.body },
      { new: true, upsert: true, runValidators: true },
    );
    res.json(doc);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
