/*
 * ─── RazorpayX Payouts ─────────────────────────────────
 *
 * Real INR bank/UPI payouts via the RazorpayX Payouts API.
 * https://razorpay.com/docs/x/apis/
 *
 * This moves money OUT of your funded RazorpayX account balance — it does
 * NOT pull from Binance. You must have off-ramped crypto → INR into the
 * RazorpayX account first (RazorpayX has no crypto leg).
 *
 * Config (server/.env):
 *   RAZORPAYX_KEY_ID          – API key id      (starts with "rzp_live_" / "rzp_test_")
 *   RAZORPAYX_KEY_SECRET      – API key secret
 *   RAZORPAYX_ACCOUNT_NUMBER  – the RazorpayX account number to debit (the source)
 *   RAZORPAYX_MAX_INR         – optional per-payout hard cap (rupees); 0/unset = no cap
 */
import { log } from "../utils/logger.js";

const API_BASE = "https://api.razorpay.com/v1";
const REQ_TIMEOUT_MS = 20_000;

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  accountNumber: string;
  maxInr: number; // 0 = no cap
}

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAYX_KEY_ID;
  const keySecret = process.env.RAZORPAYX_KEY_SECRET;
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!keyId || !keySecret || !accountNumber) return null;
  const maxInr = Number(process.env.RAZORPAYX_MAX_INR) || 0;
  return { keyId, keySecret, accountNumber, maxInr };
}

function authHeader(cfg: RazorpayConfig): string {
  return "Basic " + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
}

async function rzpPost<T>(cfg: RazorpayConfig, path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: authHeader(cfg),
    "Content-Type": "application/json",
  };
  // RazorpayX honours X-Payout-Idempotency on payout creation so a retried
  // request never creates a duplicate payout.
  if (idempotencyKey) headers["X-Payout-Idempotency"] = idempotencyKey;

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    // RazorpayX error bodies look like { error: { code, description, ... } }
    let desc = text;
    try { desc = JSON.parse(text)?.error?.description || text; } catch { /* keep raw */ }
    throw new Error(`RazorpayX ${res.status}: ${desc}`);
  }
  return JSON.parse(text) as T;
}

export interface PayoutResult {
  id: string;
  status: string; // queued | pending | processing | processed | reversed | ...
  amountInr: number;
  fundAccountId: string;
  raw: any;
}

/**
 * Pay INR to a UPI VPA. Runs the full RazorpayX chain:
 *   contact → fund_account (vpa) → payout (mode UPI).
 *
 * `amountInr` is in rupees; RazorpayX is called in paise.
 * `referenceId` is your own txn ref, echoed back on the payout for reconciliation.
 */
export async function payoutToUpi(opts: {
  upiId: string;
  amountInr: number;
  name: string;
  referenceId: string;
  narration?: string;
}): Promise<PayoutResult> {
  const cfg = getRazorpayConfig();
  if (!cfg) {
    throw new Error(
      "RazorpayX is not configured. Set RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET and RAZORPAYX_ACCOUNT_NUMBER in server/.env.",
    );
  }
  if (!(opts.amountInr > 0)) throw new Error("Payout amount must be positive.");
  if (cfg.maxInr > 0 && opts.amountInr > cfg.maxInr) {
    throw new Error(`Payout ₹${opts.amountInr} exceeds the configured per-payout cap of ₹${cfg.maxInr} (RAZORPAYX_MAX_INR).`);
  }
  if (!opts.upiId.includes("@")) throw new Error("A valid UPI VPA (name@bank) is required.");

  const amountPaise = Math.round(opts.amountInr * 100);

  // 1. Contact
  const contact = await rzpPost<{ id: string }>(cfg, "/contacts", {
    name: opts.name || "AALGOLAKSHMI Withdrawal",
    type: "customer",
    reference_id: opts.referenceId,
  });

  // 2. Fund account (UPI VPA)
  const fundAccount = await rzpPost<{ id: string }>(cfg, "/fund_accounts", {
    contact_id: contact.id,
    account_type: "vpa",
    vpa: { address: opts.upiId },
  });

  // 3. Payout — idempotent on referenceId so a retry can't double-pay
  const payout = await rzpPost<any>(
    cfg,
    "/payouts",
    {
      account_number: cfg.accountNumber,
      fund_account_id: fundAccount.id,
      amount: amountPaise,
      currency: "INR",
      mode: "UPI",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: opts.referenceId,
      narration: (opts.narration || "AALGOLAKSHMI").slice(0, 30),
    },
    opts.referenceId,
  );

  log(`[razorpayx] payout ${payout.id} status=${payout.status} ₹${opts.amountInr} → ${opts.upiId} (ref ${opts.referenceId})`);

  return {
    id: payout.id,
    status: payout.status,
    amountInr: opts.amountInr,
    fundAccountId: fundAccount.id,
    raw: payout,
  };
}
