/*
 * ─── Alert model ───────────────────────────────────────
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IAlert extends Document {
  userId: Types.ObjectId;
  severity: "GREEN" | "AMBER" | "RED";
  symbol: string;
  title: string;
  message: string;
  createdAt: Date;
}

import { getIO } from "../services/socketService.js";

const AlertSchema = new Schema<IAlert>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    severity: { type: String, enum: ["GREEN", "AMBER", "RED"], required: true },
    symbol: { type: String, default: "" },
    title: { type: String, required: true },
    message: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AlertSchema.post("save", function (doc) {
  const io = getIO();
  if (io) {
    io.emit("alert", {
      level: doc.severity,
      text: `${doc.symbol ? `[${doc.symbol}] ` : ""}${doc.title} - ${doc.message}`
    });
  }

  // Was no external notification path at all — a RED alert (liquidation,
  // untracked exchange position, hedge-mode mismatch) was only visible to
  // someone with the dashboard open or tailing logs. This posts a generic
  // JSON payload to ALERT_WEBHOOK_URL if configured — points at Slack's
  // "Incoming Webhook" URL, a custom endpoint, anything that accepts a
  // POST. Deliberately generic rather than a Slack/email-specific
  // integration: those need the user's own credentials/API keys, which
  // aren't something to fabricate here. Fire-and-forget with a short
  // timeout — a slow or dead webhook must never delay or break alert
  // creation itself.
  if (doc.severity === "RED" && process.env.ALERT_WEBHOOK_URL) {
    const text = `🔴 ${doc.symbol ? `[${doc.symbol}] ` : ""}${doc.title} — ${doc.message}`;
    fetch(process.env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, severity: doc.severity, symbol: doc.symbol, title: doc.title, message: doc.message, createdAt: doc.createdAt }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => { /* best-effort — never let a dead webhook affect alert creation */ });
  }
});

export const Alert = mongoose.model<IAlert>("Alert", AlertSchema);
