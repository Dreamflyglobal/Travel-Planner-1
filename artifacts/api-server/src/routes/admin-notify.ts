import { Router } from "express";
import nodemailer from "nodemailer";
import { APP_NAME } from "../lib/app-config.js";

const router = Router();

// ── POST /api/admin/notify ────────────────────────────────────────────────────
// Sends a notification email using admin-supplied SMTP creds (from settings UI,
// stored client-side in localStorage). Falls back to env SMTP_USER/SMTP_PASS
// if no creds are sent. Used for booking & payment success notifications.
//
// Body: { to, subject, html, smtpUser?, smtpPass?, from? }
// Returns: { success, message?, reason? }

interface NotifyBody {
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  smtpUser?: string;
  smtpPass?: string;
  from?: string;
}

function buildTransport(user: string, pass: string) {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });
}

router.post("/admin/notify", async (req, res) => {
  const { to, subject, html, text, smtpUser, smtpPass, from } = (req.body ?? {}) as NotifyBody;

  if (!to?.trim() || !subject?.trim() || (!html?.trim() && !text?.trim())) {
    return res.status(400).json({ success: false, reason: "Missing 'to', 'subject', or message body" });
  }

  const user = (smtpUser || process.env.SMTP_USER || "").trim();
  const pass = (smtpPass || process.env.SMTP_PASS || "").trim();

  if (!user || !pass) {
    return res.status(200).json({ success: false, reason: "SMTP not configured" });
  }

  try {
    const transport = buildTransport(user, pass);
    await transport.sendMail({
      from: from?.trim() || `"${APP_NAME}" <bookings@dreamflyglobal.com>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });
    return res.json({ success: true, message: "Email sent" });
  } catch (err: any) {
    console.error("[admin/notify] sendMail failed:", err.message);
    return res.status(200).json({ success: false, reason: err.message || "Send failed" });
  }
});

export default router;
