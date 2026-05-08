/**
 * Test communication endpoints — Email, SMS, WhatsApp
 * These are standalone test routes only. They do NOT affect any booking flow.
 *
 * GET /api/test-email      — sends a test email via SMTP (nodemailer)
 * GET /api/test-sms        — sends a test SMS via Twilio
 * GET /api/test-whatsapp   — sends a test WhatsApp message via Twilio
 *
 * Required env vars:
 *   Email:     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (optional), TEST_EMAIL
 *   SMS:       TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, TEST_PHONE
 *   WhatsApp:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TEST_PHONE
 */

import { Router } from "express";
import nodemailer from "nodemailer";
import twilio from "twilio";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function missingVars(keys: string[]): string[] {
  return keys.filter((k) => !process.env[k]?.trim());
}

function e164(raw: string): string {
  // Strip whitespace and any leading + signs, then re-prefix exactly one +
  const trimmed = raw.trim().replace(/^\++/, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

// ── GET /api/test-email ───────────────────────────────────────────────────────

router.get("/test-email", async (_req, res) => {
  const tag = "[test-email]";

  const missing = missingVars(["SMTP_USER", "SMTP_PASS"]);
  if (missing.length) {
    const reason = `Missing env vars: ${missing.join(", ")}`;
    logger.warn(`${tag} SKIP — ${reason}`);
    return res.status(503).json({ success: false, reason });
  }

  const user  = process.env.SMTP_USER!.trim();
  const pass  = process.env.SMTP_PASS!.trim();
  const from  = (process.env.SMTP_FROM || "bookings@dreamflyglobal.com").trim();
  const to    = (process.env.TEST_EMAIL || user).trim();
  const host  = (process.env.SMTP_HOST || "").trim();
  const port  = Number(process.env.SMTP_PORT || 465);

  if (!host) {
    logger.warn(`${tag} SMTP_HOST not configured`);
    return res.status(503).json({ success: false, reason: "SMTP_HOST not configured" });
  }

  logger.info(`${tag} Using SMTP: ${host}:${port} (secure=true)`);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });

  logger.info(`${tag} Sending test email → from: ${from}  to: ${to}`);

  try {
    const info = await transport.sendMail({
      from: `"Dream Fly Global (Test)" <${from}>`,
      to,
      subject: "✅ Test Email — Dream Fly Global",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px">
          <h2 style="color:#0f172a;margin-bottom:8px">📧 Test Email Successful</h2>
          <p style="color:#475569;margin-bottom:24px">This is a test email from the <strong>Dream Fly Global</strong> API server.</p>
          <div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:16px;color:#166534;font-size:13px">
            ✓ SMTP configuration is working correctly.
          </div>
          <p style="color:#94a3b8;font-size:11px;margin-top:24px">Sent at: ${new Date().toISOString()}</p>
        </div>
      `,
    });
    logger.info(`${tag} SUCCESS — messageId: ${info.messageId}  to: ${to}`);
    return res.json({ success: true, message: `Test email sent to ${to}`, messageId: info.messageId });
  } catch (err: any) {
    logger.error(`${tag} FAILED — ${err.message}`);
    return res.status(500).json({ success: false, reason: err.message });
  }
});

// ── GET /api/test-sms ─────────────────────────────────────────────────────────

router.get("/test-sms", async (_req, res) => {
  const tag = "[test-sms]";

  const missing = missingVars(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TEST_PHONE"]);
  if (missing.length) {
    const reason = `Missing env vars: ${missing.join(", ")}`;
    logger.warn(`${tag} SKIP — ${reason}`);
    return res.status(503).json({ success: false, reason });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const authToken  = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from       = e164(process.env.TWILIO_SMS_FROM!.trim());
  const to         = e164(process.env.TEST_PHONE!.trim());
  const body       = `[Dream Fly Global] Test SMS sent at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST. Your SMS integration is working!`;

  logger.info(`${tag} Sending test SMS → from: ${from}  to: ${to}`);

  try {
    const client  = twilio(accountSid, authToken);
    const message = await client.messages.create({ from, to, body });
    logger.info(`${tag} SUCCESS — SID: ${message.sid}  status: ${message.status}  to: ${to}`);
    return res.json({ success: true, message: `Test SMS sent to ${to}`, sid: message.sid, status: message.status });
  } catch (err: any) {
    const hint =
      err.code === 21211 ? " — Invalid 'to' number, check TEST_PHONE format" :
      err.code === 21214 ? " — 'to' number cannot receive SMS" :
      err.code === 21608 ? " — 'from' number not SMS-capable, check TWILIO_SMS_FROM" :
      "";
    logger.error(`${tag} FAILED — Code: ${err.code ?? "N/A"} | ${err.message}${hint}`);
    return res.status(500).json({ success: false, reason: `${err.message}${hint}`, code: err.code });
  }
});

// ── GET /api/test-whatsapp ────────────────────────────────────────────────────

router.get("/test-whatsapp", async (_req, res) => {
  const tag = "[test-whatsapp]";

  const missing = missingVars(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "TEST_PHONE"]);
  if (missing.length) {
    const reason = `Missing env vars: ${missing.join(", ")}`;
    logger.warn(`${tag} SKIP — ${reason}`);
    return res.status(503).json({ success: false, reason });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const authToken  = process.env.TWILIO_AUTH_TOKEN!.trim();
  const rawFrom    = process.env.TWILIO_WHATSAPP_FROM!.trim();
  const rawTo      = process.env.TEST_PHONE!.trim();

  const fromNumber = rawFrom.startsWith("whatsapp:") ? rawFrom : `whatsapp:${e164(rawFrom)}`;
  const toNumber   = `whatsapp:${e164(rawTo)}`;

  const body =
    `✅ *Test WhatsApp — Dream Fly Global*\n\n` +
    `This is a test message from the API server.\n` +
    `Your WhatsApp integration is working correctly! 🎉\n\n` +
    `_Sent at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST_`;

  logger.info(`${tag} Sending test WhatsApp → from: ${fromNumber}  to: ${toNumber}`);

  try {
    const client  = twilio(accountSid, authToken);
    const message = await client.messages.create({ from: fromNumber, to: toNumber, body });
    logger.info(`${tag} SUCCESS — SID: ${message.sid}  status: ${message.status}  to: ${toNumber}`);
    return res.json({ success: true, message: `Test WhatsApp sent to ${toNumber}`, sid: message.sid, status: message.status });
  } catch (err: any) {
    const hint =
      err.code === 63007 ? " — FROM not WhatsApp-enabled (sandbox: use +14155238886)" :
      err.code === 63016 ? " — Recipient has not opted in to Twilio sandbox (send 'join <keyword>' to +1 415 523 8886)" :
      err.code === 21211 ? " — Invalid 'to' number, check TEST_PHONE format" :
      "";
    logger.error(`${tag} FAILED — Code: ${err.code ?? "N/A"} | ${err.message}${hint}`);
    return res.status(500).json({ success: false, reason: `${err.message}${hint}`, code: err.code });
  }
});

export default router;
