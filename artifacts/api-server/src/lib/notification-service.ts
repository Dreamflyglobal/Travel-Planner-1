/**
 * Unified booking notification service.
 *
 * Exposes three reusable functions:
 *   sendBookingEmail()     — GoDaddy SMTP via email-service
 *   sendBookingSMS()       — Twilio SMS
 *   sendBookingWhatsApp()  — Twilio WhatsApp via whatsapp-service
 *
 * Use sendAllBookingNotifications() to fire all three concurrently.
 * Individual failures never affect the others or the booking status.
 */

import twilio from "twilio";
import { logger } from "./logger.js";
import { sendGeneralBookingEmail, type GeneralBookingEmailData } from "./email-service.js";
import { sendWhatsAppNotification, type WhatsAppBookingData } from "./whatsapp-service.js";
import { APP_NAME, APP_SUPPORT_PHONE } from "./app-config.js";

// ── Shared data shape ─────────────────────────────────────────────────────────

export interface BookingNotificationData {
  bookingId:      string;
  bookingType:    "flight" | "bus" | "hotel" | "package";
  passengerName:  string;
  passengerEmail?: string;
  passengerPhone?: string;
  travelDate:     string;
  totalAmount:    number;
  paymentId:      string;
  passengers?:    number;
  invoiceUrl?:    string;
  title?:         string;
  from?:          string;
  to?:            string;
  // Flight
  airline?:         string;
  flightNumber?:    string;
  flightDeparture?: string;
  flightArrival?:   string;
  flightDuration?:  string;
  // Bus
  busOperator?:   string;
  busType?:       string;
  boardingPoint?: string;
  droppingPoint?: string;
  busDeparture?:  string;
  busArrival?:    string;
  // Hotel
  hotelName?:     string;
  hotelCity?:     string;
  hotelNights?:   number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function buildSmsBody(data: BookingNotificationData): string {
  const typeLabel = data.bookingType.charAt(0).toUpperCase() + data.bookingType.slice(1);
  const dateStr = (() => {
    try {
      return new Date(data.travelDate).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch {
      return data.travelDate;
    }
  })();
  const amount = `Rs.${data.totalAmount.toLocaleString("en-IN")}`;

  let detail = "";
  if ((data.bookingType === "flight" || data.bookingType === "bus") && data.from && data.to) {
    detail = ` | ${data.from} to ${data.to}`;
  } else if (data.bookingType === "hotel" && data.hotelName) {
    detail = ` | ${data.hotelName}`;
  }

  return (
    `Your ${typeLabel} booking with ${APP_NAME} is confirmed${detail}. ` +
    `Booking ID: ${data.bookingId} | Date: ${dateStr} | Amount: ${amount}. ` +
    `Support: ${APP_SUPPORT_PHONE}`
  );
}

// ── sendBookingEmail ──────────────────────────────────────────────────────────

export async function sendBookingEmail(
  data: BookingNotificationData,
): Promise<{ sent: boolean; reason?: string }> {
  if (!data.passengerEmail) {
    logger.warn(`[notification/email] No email address — skipping (booking: ${data.bookingId})`);
    return { sent: false, reason: "No passenger email address" };
  }

  const emailData: GeneralBookingEmailData = {
    bookingId:      data.bookingId,
    bookingType:    data.bookingType,
    passengerName:  data.passengerName,
    passengerEmail: data.passengerEmail,
    title:          data.title || data.bookingId,
    travelDate:     data.travelDate,
    passengers:     data.passengers ?? 1,
    totalAmount:    data.totalAmount,
    paymentId:      data.paymentId,
    invoiceUrl:     data.invoiceUrl || "",
  };

  try {
    const result = await sendGeneralBookingEmail(emailData);
    if (result.sent) {
      logger.info(`[notification/email] Sent ✓ — booking: ${data.bookingId}  to: ${data.passengerEmail}`);
    } else {
      logger.warn(`[notification/email] Not sent — booking: ${data.bookingId}  reason: ${result.reason}`);
    }
    return result;
  } catch (err: any) {
    logger.error(`[notification/email] Error: ${err.message}  booking: ${data.bookingId}`);
    return { sent: false, reason: err.message };
  }
}

// ── sendBookingSMS ────────────────────────────────────────────────────────────

export async function sendBookingSMS(
  data: BookingNotificationData,
): Promise<{ sent: boolean; reason?: string }> {
  if (!data.passengerPhone) {
    logger.warn(`[notification/sms] No phone number — skipping (booking: ${data.bookingId})`);
    return { sent: false, reason: "No passenger phone number" };
  }

  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken  = (process.env.TWILIO_AUTH_TOKEN  || "").trim();
  const fromNumber = (process.env.TWILIO_SMS_FROM    || "").trim();

  if (!accountSid || !authToken || !fromNumber) {
    logger.warn(`[notification/sms] Twilio SMS not fully configured — skipping (booking: ${data.bookingId})`);
    return { sent: false, reason: "Twilio SMS credentials not configured" };
  }

  const toNumber = formatPhone(data.passengerPhone);
  const body     = buildSmsBody(data);

  logger.info(`[notification/sms] Sending → ${toNumber}  booking: ${data.bookingId}`);

  try {
    const client  = twilio(accountSid, authToken);
    const message = await client.messages.create({ from: fromNumber, to: toNumber, body });
    logger.info(`[notification/sms] Sent ✓ SID: ${message.sid}  Status: ${message.status}  booking: ${data.bookingId}`);
    return { sent: true };
  } catch (err: any) {
    const hint =
      err.code === 21211 ? " — Invalid 'to' number format" :
      err.code === 21214 ? " — Number cannot receive SMS" :
      err.code === 21608 ? " — 'from' number not SMS-capable" : "";
    logger.error(`[notification/sms] Failed — Code: ${err.code ?? "N/A"} | ${err.message}${hint}  booking: ${data.bookingId}`);
    return { sent: false, reason: `${err.message}${hint}` };
  }
}

// ── sendBookingWhatsApp ───────────────────────────────────────────────────────

export async function sendBookingWhatsApp(
  data: BookingNotificationData,
): Promise<{ sent: boolean; reason?: string }> {
  if (!data.passengerPhone) {
    logger.warn(`[notification/whatsapp] No phone number — skipping (booking: ${data.bookingId})`);
    return { sent: false, reason: "No passenger phone number" };
  }

  const dateStr = (() => {
    try {
      return new Date(data.travelDate).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch {
      return data.travelDate;
    }
  })();

  const waData: WhatsAppBookingData = {
    bookingId:       data.bookingId,
    passengerName:   data.passengerName,
    phone:           data.passengerPhone,
    bookingType:     data.bookingType,
    from:            data.from || "",
    to:              data.to   || "",
    date:            dateStr,
    amount:          data.totalAmount,
    invoiceUrl:      data.invoiceUrl,
    airline:         data.airline,
    flightNum:       data.flightNumber,
    flightDeparture: data.flightDeparture,
    flightArrival:   data.flightArrival,
    flightDuration:  data.flightDuration,
    busOperator:     data.busOperator,
    busType:         data.busType,
    boardingPoint:   data.boardingPoint,
    droppingPoint:   data.droppingPoint,
    busDeparture:    data.busDeparture,
    busArrival:      data.busArrival,
    hotelName:       data.hotelName,
    hotelCity:       data.hotelCity,
    hotelNights:     data.hotelNights,
  };

  try {
    const result = await sendWhatsAppNotification(waData);
    if (result.sent) {
      logger.info(`[notification/whatsapp] Sent ✓ — booking: ${data.bookingId}`);
    } else {
      logger.warn(`[notification/whatsapp] Not sent — booking: ${data.bookingId}  reason: ${result.reason}`);
    }
    return result;
  } catch (err: any) {
    logger.error(`[notification/whatsapp] Error: ${err.message}  booking: ${data.bookingId}`);
    return { sent: false, reason: err.message };
  }
}

// ── sendAllBookingNotifications ───────────────────────────────────────────────
// Fires Email + SMS + WhatsApp concurrently. Each channel is independent —
// a failure in one never blocks or invalidates the others.

export async function sendAllBookingNotifications(data: BookingNotificationData): Promise<{
  email:    { sent: boolean; reason?: string };
  sms:      { sent: boolean; reason?: string };
  whatsapp: { sent: boolean; reason?: string };
}> {
  logger.info(`[notification] Sending all channels — booking: ${data.bookingId}  type: ${data.bookingType}`);

  const [emailResult, smsResult, whatsappResult] = await Promise.allSettled([
    sendBookingEmail(data),
    sendBookingSMS(data),
    sendBookingWhatsApp(data),
  ]);

  const email    = emailResult.status    === "fulfilled" ? emailResult.value    : { sent: false, reason: String((emailResult as PromiseRejectedResult).reason) };
  const sms      = smsResult.status      === "fulfilled" ? smsResult.value      : { sent: false, reason: String((smsResult as PromiseRejectedResult).reason) };
  const whatsapp = whatsappResult.status === "fulfilled" ? whatsappResult.value : { sent: false, reason: String((whatsappResult as PromiseRejectedResult).reason) };

  logger.info(
    `[notification] Done — booking: ${data.bookingId}  ` +
    `email:${email.sent} sms:${sms.sent} whatsapp:${whatsapp.sent}`,
  );

  return { email, sms, whatsapp };
}
