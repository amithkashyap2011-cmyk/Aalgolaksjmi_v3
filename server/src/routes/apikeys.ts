/*
 * ─── ApiKeys routes ────────────────────────────────────
 *
 * POST /apikeys/save – encrypt & store Binance keys
 * POST /apikeys/test – decrypt, ping Binance account endpoint
 */
import { Router } from "express";
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import { ApiKeys } from "../models/ApiKeys.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { getAccount } from "../services/binanceService.js";

const router = Router();

router.post("/save", authGuard, async (req: AuthRequest, res) => {
  try {
    const { apiKey, apiSecret } = req.body as { apiKey: string; apiSecret: string };
    if (!apiKey || !apiSecret) {
      res.status(400).json({ error: "apiKey and apiSecret are required" });
      return;
    }
    const encKey = encrypt(apiKey);
    const encSecret = encrypt(apiSecret);

    await ApiKeys.findOneAndUpdate(
      { userId: req.userId },
      {
        encryptedKey: encKey.ciphertext,
        encryptedSecret: encSecret.ciphertext,
        iv: encKey.iv,
        authTag: encKey.authTag,
        ivSecret: encSecret.iv,
        authTagSecret: encSecret.authTag,
        lastTestedAt: null,
      },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/test", authGuard, async (req: AuthRequest, res) => {
  try {
    const doc = await ApiKeys.findOne({ userId: req.userId });
    if (!doc) { res.status(404).json({ error: "No API keys saved" }); return; }

    const apiKey = decrypt({
      ciphertext: doc.encryptedKey,
      iv: doc.iv,
      authTag: doc.authTag,
    });
    const apiSecret = decrypt({
      ciphertext: doc.encryptedSecret,
      iv: doc.ivSecret,
      authTag: doc.authTagSecret,
    });

    const balances = await getAccount(apiKey, apiSecret);
    doc.lastTestedAt = new Date();
    await doc.save();

    res.json({ ok: true, balances: balances.slice(0, 10) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
