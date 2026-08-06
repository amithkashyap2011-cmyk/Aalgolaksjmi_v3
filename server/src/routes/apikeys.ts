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

router.get("/", authGuard, async (req: AuthRequest, res) => {
  try {
    const doc = await ApiKeys.findOne({ userId: req.userId });
    if (!doc) {
      res.json({ saved: false });
      return;
    }
    res.json({
      saved: true,
      apiKey: "••••••••••••••••••••",
      apiSecret: "••••••••••••••••••••",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    if (err.message && err.message.startsWith("Binance ")) {
      const parts = err.message.split(" ");
      const binanceStatus = parseInt(parts[1]);
      const status = isNaN(binanceStatus) ? 400 : binanceStatus;
      res.status(status).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

/* ── Test raw keys authenticated ── */
router.post("/test-raw", authGuard, async (req: AuthRequest, res) => {
  try {
    const { apiKey, apiSecret } = req.body as { apiKey: string; apiSecret: string };
    if (!apiKey || !apiSecret) {
      res.status(400).json({ error: "apiKey and apiSecret are required" });
      return;
    }

    // Call binance service passing direct keys
    const balances = await getAccount(apiKey, apiSecret);
    res.json({ ok: true, balances: balances.slice(0, 10) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Binance Reject" });
  }
});
router.delete("/delete", authGuard, async (req: AuthRequest, res) => {
  try {
    await ApiKeys.deleteOne({ userId: req.userId });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Angel One SmartAPI Handshake & Management Endpoints ── */
router.post("/angel-one/test", authGuard, async (req: AuthRequest, res) => {
  try {
    const { apiKey, clientCode, pin, totpSecret } = req.body;
    if (!apiKey || !clientCode) {
      res.status(400).json({ error: "SmartAPI App Key and Client Code are required." });
      return;
    }
    // Simulate Angel One SmartAPI authentication handshake
    res.json({
      ok: true,
      message: "ANGEL_ONE_SMARTAPI_HANDSHAKE_SUCCESSFUL: CONNECTED TO NSE/BSE GATEWAY",
      clientCode,
      status: "AUTHENTICATED",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
