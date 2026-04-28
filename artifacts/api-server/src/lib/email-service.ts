import nodemailer from "nodemailer";
import { logger } from "./logger.js";
import type { FlightTicketData } from "./ticket-pdf.js";
import { APP_NAME, APP_TAGLINE_LONG, APP_SUPPORT_PHONE, APP_SUPPORT_EMAIL, APP_DEFAULT_FROM, APP_INITIALS } from "./app-config.js";

function createTransport() {
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();

  if (!user || !pass) {
    console.info("[email] SMTP_USER or SMTP_PASS not set — email disabled");
    return null;
  }

  // Detect provider from the sender's email domain
  const domain = user.split("@")[1]?.toLowerCase() || "";

  // ── Known providers: always use their native service config ──────────────
  // This bypasses any SMTP_HOST env var, so a typo there won't break delivery.
  if (domain === "gmail.com") {
    // Gmail requires a 16-char App Password (not your regular password).
    // Generate one at: https://myaccount.google.com/apppasswords
    console.info("[email] Using Gmail service config (App Password)");
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") {
    console.info("[email] Using Outlook/Office365 config");
    return nodemailer.createTransport({
      host:   "smtp.office365.com",
      port:   587,
      secure: false,
      auth:   { user, pass },
      tls:    { rejectUnauthorized: false, ciphers: "SSLv3" },
    });
  }

  if (domain === "yahoo.com" || domain === "yahoo.in") {
    console.info("[email] Using Yahoo service config");
    return nodemailer.createTransport({
      service: "yahoo",
      auth: { user, pass },
    });
  }

  // ── Custom domain: honour SMTP_HOST if provided ──────────────────────────
  if (process.env.SMTP_HOST) {
    const host   = process.env.SMTP_HOST.trim();
    const port   = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = port === 465;
    console.info(`[email] Using custom SMTP host: ${host}:${port}`);
    return nodemailer.createTransport({
      host, port, secure,
      auth: { user, pass },
      tls:  { rejectUnauthorized: false },
    });
  }

  // ── Generic fallback: guess smtp.<domain> ────────────────────────────────
  console.info(`[email] Guessing SMTP host: smtp.${domain}`);
  return nodemailer.createTransport({
    host:   `smtp.${domain}`,
    port:   587,
    secure: false,
    auth:   { user, pass },
    tls:    { rejectUnauthorized: false },
  });
}

// ── Legacy flight-specific email ─────────────────────────────────────────────

function bookingEmailHTML(ticket: FlightTicketData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmation — ${APP_NAME}</title>
  <style>
    body { margin: 0; padding: 0; background: #f1f5f9; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; }
    .wrapper { max-width: 620px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .header  { background: #1e40af; padding: 32px 40px; }
    .header h1 { color: #fff; margin: 0 0 4px; font-size: 22px; }
    .header p  { color: #93c5fd; margin: 0; font-size: 13px; }
    .hero { background: #eff6ff; padding: 28px 40px; border-bottom: 3px solid #f97316; }
    .route { display: flex; align-items: center; gap: 0; }
    .city { font-size: 38px; font-weight: 800; color: #1e40af; }
    .arrow { flex: 1; text-align: center; color: #94a3b8; font-size: 22px; }
    .arrow span { display: block; font-size: 10px; color: #94a3b8; }
    .section { padding: 24px 40px; border-bottom: 1px solid #e2e8f0; }
    .section h3 { margin: 0 0 16px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .item label { display: block; font-size: 11px; color: #94a3b8; margin-bottom: 2px; text-transform: uppercase; }
    .item p { margin: 0; font-size: 14px; font-weight: 600; color: #1e293b; }
    .amount { color: #f97316 !important; font-size: 20px !important; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 700; }
    .footer { background: #1e40af; padding: 20px 40px; text-align: center; color: #93c5fd; font-size: 11px; }
    .footer p { margin: 4px 0; }
    .cta { text-align: center; padding: 28px 40px; }
    .btn { display: inline-block; background: #1e40af; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>✈ ${APP_NAME}</h1>
    <p>Your flight ticket is confirmed!</p>
  </div>
  <div class="hero">
    <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Booking ID: ${ticket.bookingId}</p>
    <div class="route">
      <div class="city">${ticket.from}</div>
      <div class="arrow">
        <span>${ticket.duration}</span>
        →
        <span>Non-stop</span>
      </div>
      <div class="city">${ticket.to}</div>
    </div>
    <div style="margin-top:12px;">
      <span class="badge">✓ Confirmed</span>
      &nbsp;
      <span style="font-size:13px;color:#64748b;margin-left:8px;">${ticket.airline} · ${ticket.flightNum}</span>
    </div>
  </div>
  <div class="section">
    <h3>Flight Details</h3>
    <div class="grid">
      <div class="item"><label>Date</label><p>${ticket.date}</p></div>
      <div class="item"><label>Duration</label><p>${ticket.duration}</p></div>
      <div class="item"><label>Departure</label><p>${ticket.departure}</p></div>
      <div class="item"><label>Arrival</label><p>${ticket.arrival}</p></div>
      <div class="item"><label>Flight</label><p>${ticket.flightNum}</p></div>
      <div class="item"><label>Class</label><p>${ticket.class || "Economy"}</p></div>
    </div>
  </div>
  <div class="section">
    <h3>Passenger & Payment</h3>
    <div class="grid">
      <div class="item"><label>Passenger</label><p>${ticket.passengerName}</p></div>
      <div class="item"><label>Passengers</label><p>${ticket.passengers}</p></div>
      <div class="item"><label>Total Amount</label><p class="amount">₹${ticket.amount.toLocaleString("en-IN")}</p></div>
      ${ticket.paymentId ? `<div class="item"><label>Payment Ref</label><p style="font-size:11px;color:#64748b;">${ticket.paymentId}</p></div>` : ""}
    </div>
  </div>
  <div class="cta">
    <p style="margin:0 0 16px;color:#64748b;font-size:13px;">Your e-ticket PDF is attached to this email. Please carry a valid photo ID at the airport.</p>
  </div>
  <div class="footer">
    <p>${APP_NAME} — ${APP_TAGLINE_LONG}</p>
    <p>This is an automated message. For support, reply to this email.</p>
  </div>
</div>
</body>
</html>`;
}

export async function sendBookingConfirmationEmail(
  ticket: FlightTicketData,
  pdfBuffer: Buffer,
): Promise<{ sent: boolean; reason?: string }> {
  const transport = createTransport();
  if (!transport) {
    console.info("[email] SMTP not configured — skipping email delivery");
    return { sent: false, reason: "SMTP not configured" };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "${APP_DEFAULT_FROM}";

  try {
    await transport.sendMail({
      from: `"${APP_NAME} Tickets" <${from}>`,
      to:   ticket.passengerEmail,
      subject: `✈ Booking Confirmed: ${ticket.from} → ${ticket.to} · ${ticket.bookingId}`,
      html: bookingEmailHTML(ticket),
      attachments: [
        {
          filename:    `${APP_NAME}-Ticket-${ticket.bookingId}.pdf`,
          content:     pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    logger.info(`[email] Email sent successfully to ${ticket.passengerEmail} (Booking: ${ticket.bookingId})`);
    return { sent: true };
  } catch (err: any) {
    logger.error(`[email] Failed to send booking confirmation email: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

// ── General booking confirmation email (all types) ─────────────────────────

export interface GeneralBookingEmailData {
  bookingId:      string;
  bookingType:    "flight" | "bus" | "hotel" | "package";
  passengerName:  string;
  passengerEmail: string;
  title:          string;
  travelDate:     string;
  passengers:     number;
  totalAmount:    number;
  paymentId:      string;
  invoiceUrl:     string;
}

const SERVICE_EMOJI: Record<string, string> = {
  flight:  "✈️",
  bus:     "🚌",
  hotel:   "🏨",
  package: "🌴",
};

function generalBookingEmailHTML(data: GeneralBookingEmailData): string {
  const emoji   = SERVICE_EMOJI[data.bookingType] ?? "📋";
  const dateStr = new Date(data.travelDate).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const amount = `₹${data.totalAmount.toLocaleString("en-IN")}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmation — ${APP_NAME}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #f1f5f9; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.10); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 40px; display: flex; align-items: center; gap: 16px; }
    .logo-circle { width: 52px; height: 52px; background: #f97316; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .logo-text { color: #fff; font-weight: 900; font-size: 16px; }
    .header-info h1 { color: #fff; margin: 0 0 2px; font-size: 20px; font-weight: 800; }
    .header-info p  { color: #94a3b8; margin: 0; font-size: 12px; }
    .hero { background: #fff7ed; border-bottom: 3px solid #f97316; padding: 28px 40px; }
    .confirmed-badge { display: inline-flex; align-items: center; gap: 6px; background: #dcfce7; color: #166534; padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-bottom: 12px; }
    .service-title { font-size: 22px; font-weight: 800; color: #1e293b; margin: 0 0 4px; }
    .booking-id { font-size: 12px; color: #64748b; font-family: monospace; }
    .section { padding: 24px 40px; border-bottom: 1px solid #e2e8f0; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .row:last-child { border-bottom: none; }
    .row label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; }
    .row span { font-size: 13px; font-weight: 600; color: #1e293b; text-align: right; }
    .amount-highlight { font-size: 18px !important; color: #f97316 !important; }
    .cta { text-align: center; padding: 32px 40px; background: #f8fafc; }
    .cta p { color: #64748b; font-size: 13px; margin: 0 0 20px; line-height: 1.6; }
    .btn { display: inline-block; background: #f97316; color: #fff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 15px; letter-spacing: 0.02em; }
    .payment-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 18px; margin-top: 12px; }
    .payment-box p { margin: 0; font-size: 11px; color: #166534; font-family: monospace; }
    .footer { background: #0f172a; padding: 24px 40px; text-align: center; }
    .footer p { margin: 4px 0; color: #64748b; font-size: 11px; }
    .footer .brand { color: #94a3b8; font-weight: 600; font-size: 13px; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo-circle">
      <span class="logo-text">${APP_INITIALS}</span>
    </div>
    <div class="header-info">
      <h1>${APP_NAME}</h1>
      <p>Your Ultimate Travel Companion</p>
    </div>
  </div>

  <div class="hero">
    <div class="confirmed-badge">✓ Booking Confirmed</div>
    <p class="service-title">${emoji} ${data.title}</p>
    <p class="booking-id">Booking ID: ${data.bookingId}</p>
  </div>

  <div class="section">
    <div class="row">
      <label>Passenger</label>
      <span>${data.passengerName}</span>
    </div>
    <div class="row">
      <label>Service</label>
      <span style="text-transform:capitalize">${data.bookingType}</span>
    </div>
    <div class="row">
      <label>Travel Date</label>
      <span>${dateStr}</span>
    </div>
    <div class="row">
      <label>${data.bookingType === "hotel" ? "Rooms" : "Passengers"}</label>
      <span>${data.passengers}</span>
    </div>
    <div class="row">
      <label>Total Paid</label>
      <span class="amount-highlight">${amount}</span>
    </div>
    <div class="payment-box">
      <p>✓ Payment ID: ${data.paymentId}</p>
    </div>
  </div>

  <div class="cta">
    <p>
      Hi ${data.passengerName.split(" ")[0]}, your booking is confirmed!<br />
      Click below to view or download your invoice.
    </p>
    <a href="${data.invoiceUrl}" class="btn">📄 View Invoice &amp; Ticket</a>
    <p style="margin-top:16px;font-size:11px;color:#94a3b8;">
      Or copy this link: <a href="${data.invoiceUrl}" style="color:#f97316;text-decoration:none;">${data.invoiceUrl}</a>
    </p>
  </div>

  <div class="footer">
    <p class="brand">${APP_NAME} — ${APP_TAGLINE_LONG}</p>
    <p>${APP_SUPPORT_PHONE} · ${APP_SUPPORT_EMAIL}</p>
    <p>This is an automated confirmation. Do not reply to this email.</p>
  </div>
</div>
</body>
</html>`;
}

export async function sendGeneralBookingEmail(
  data: GeneralBookingEmailData,
): Promise<{ sent: boolean; reason?: string }> {
  const transport = createTransport();

  if (!transport) {
    console.info("[email] SMTP not configured — skipping general booking email. Set SMTP_USER and SMTP_PASS secrets.");
    return { sent: false, reason: "SMTP not configured" };
  }

  const from    = process.env.SMTP_FROM || process.env.SMTP_USER || "${APP_DEFAULT_FROM}";
  const emoji   = SERVICE_EMOJI[data.bookingType] ?? "📋";
  const subject = `${emoji} Booking Confirmed – ${APP_NAME} | ${data.bookingId}`;

  try {
    await transport.sendMail({
      from: `"${APP_NAME}" <${from}>`,
      to:   data.passengerEmail,
      subject,
      html: generalBookingEmailHTML(data),
    });
    logger.info(`[email] General booking email sent to ${data.passengerEmail} (${data.bookingId})`);
    return { sent: true };
  } catch (err: any) {
    logger.error(`[email] Failed to send general booking email: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}
