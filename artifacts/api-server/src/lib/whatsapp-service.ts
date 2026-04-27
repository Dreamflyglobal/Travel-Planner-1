import twilio from "twilio";
import { APP_NAME, APP_TAGLINE_LONG, APP_SUPPORT_PHONE, APP_SUPPORT_EMAIL } from "./app-config.js";

export interface WhatsAppBookingData {
  bookingId:      string;
  passengerName:  string;
  phone:          string;
  from:           string;
  to:             string;
  date:           string;
  amount:         number;
  bookingType?:   "flight" | "bus" | "hotel" | "package";
  // Flight
  airline?:       string;
  flightNum?:     string;
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
  // Common
  referralCode?:  string;
  invoiceUrl?:    string;
}

function formatPhone(raw: string): string {
  // Strip everything except digits — gives a clean numeric-only string
  const digits = raw.replace(/\D/g, "");
  // Already has country code 91 → +91XXXXXXXXXX
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  // Plain 10-digit Indian mobile → prefix +91
  if (digits.length === 10) return `+91${digits}`;
  // Any other length — prepend + and hope for the best
  return `+${digits}`;
}

function toWhatsApp(phone: string): string {
  const e164 = formatPhone(phone);
  return `whatsapp:${e164}`;
}

function buildMessage(data: WhatsAppBookingData): string {
  const amount    = data.amount.toLocaleString("en-IN");
  const firstName = data.passengerName.split(" ")[0];
  const pdfLink   = data.invoiceUrl || "";

  // Type-specific service info block
  let serviceBlock = "";
  const type = data.bookingType;

  if (type === "flight") {
    const airline  = data.airline   ? `✈️ *Airline:* ${data.airline}${data.flightNum ? ` (${data.flightNum})` : ""}\n` : "";
    const route    = data.from && data.to ? `📍 *Route:* ${data.from} → ${data.to}\n` : "";
    const dep      = data.flightDeparture ? `🕐 *Departure:* ${data.flightDeparture}\n` : "";
    const arr      = data.flightArrival   ? `🕑 *Arrival:* ${data.flightArrival}\n`    : "";
    serviceBlock   = airline + route + dep + arr;
  } else if (type === "bus") {
    const operator = data.busOperator ? `🚌 *Operator:* ${data.busOperator}${data.busType ? ` (${data.busType})` : ""}\n` : "";
    const route    = data.from && data.to ? `📍 *Route:* ${data.from} → ${data.to}\n` : "";
    const boarding = data.boardingPoint ? `🟢 *Boarding:* ${data.boardingPoint}${data.busDeparture ? ` at ${data.busDeparture}` : ""}\n` : "";
    const dropping = data.droppingPoint ? `🔴 *Dropping:* ${data.droppingPoint}${data.busArrival   ? ` at ${data.busArrival}`   : ""}\n` : "";
    serviceBlock   = operator + route + boarding + dropping;
  } else if (type === "hotel") {
    const hotel    = data.hotelName  ? `🏨 *Hotel:* ${data.hotelName}\n`          : "";
    const city     = data.hotelCity  ? `📍 *City:* ${data.hotelCity}\n`           : "";
    const nights   = data.hotelNights ? `🌙 *Nights:* ${data.hotelNights}\n`      : "";
    serviceBlock   = hotel + city + nights;
  } else {
    serviceBlock   = data.from && data.to ? `📍 *Route:* ${data.from} → ${data.to}\n` : "";
  }

  const downloadLine = pdfLink
    ? `\n📥 *Download Ticket:*\n${pdfLink}`
    : "";

  return (
    `🎉 *Booking Confirmed!*\n\n` +
    `Hi ${firstName}! 👋\n\n` +
    `🆔 *Booking ID:* ${data.bookingId}\n` +
    serviceBlock +
    `📅 *Travel Date:* ${data.date}\n` +
    `💰 *Amount Paid:* ₹${amount}\n` +
    downloadLine +
    `\n\nThank you for booking with *${APP_NAME}* ✈️\nSupport: ${APP_SUPPORT_PHONE}`
  );
}

export async function sendWhatsAppNotification(
  data: WhatsAppBookingData,
): Promise<{ sent: boolean; reason?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID   || "";
  const authToken  = process.env.TWILIO_AUTH_TOKEN    || "";
  const rawFrom    = process.env.TWILIO_WHATSAPP_FROM || "";
  // TWILIO_WHATSAPP_TO: sandbox override — message always goes to the opted-in number.
  // Leave unset in production so the actual booking phone is used.
  const overrideTo = process.env.TWILIO_WHATSAPP_TO   || "";

  if (!accountSid || !authToken) {
    console.warn("[whatsapp] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — skipping");
    return { sent: false, reason: "Twilio credentials not configured" };
  }
  if (!rawFrom) {
    console.warn("[whatsapp] TWILIO_WHATSAPP_FROM not set — skipping (use +14155238886 for sandbox)");
    return { sent: false, reason: "TWILIO_WHATSAPP_FROM not configured" };
  }

  // Build FROM — always whatsapp:+E164 format
  const fromE164   = rawFrom.replace(/\D/g, "");
  const fromNumber = `whatsapp:+${fromE164}`;

  // Resolve destination phone
  const rawTo = overrideTo || data.phone || "";
  if (!rawTo) {
    console.warn("[whatsapp] No destination phone number — skipping");
    return { sent: false, reason: "No phone number" };
  }
  if (overrideTo) {
    console.log(`[whatsapp] Using TWILIO_WHATSAPP_TO override: ${overrideTo}`);
  }

  // Convert to whatsapp:+91XXXXXXXXXX format
  const toNumber = toWhatsApp(rawTo);
  const body     = buildMessage(data);

  console.log(`[whatsapp] Sending — From: ${fromNumber}  To: ${toNumber}  Booking: ${data.bookingId}`);

  try {
    const client = twilio(accountSid, authToken);
    const res    = await client.messages.create({ from: fromNumber, to: toNumber, body });
    console.log("WhatsApp response:", { sid: res.sid, status: res.status, to: res.to, from: res.from });
    console.log("WhatsApp sent");
    return { sent: true };
  } catch (e: any) {
    const hint = e.code === 63007
      ? " — FROM not WhatsApp-enabled (use Twilio sandbox +14155238886)"
      : e.code === 21211
      ? " — TO number invalid, check phone format"
      : e.code === 63016
      ? " — recipient has not opted in to Twilio sandbox (send 'join <keyword>' to +1 415 523 8886)"
      : "";
    console.error("WhatsApp error:", e);
    console.error(`[whatsapp] Failed — Code: ${e.code ?? "N/A"} | ${e.message}${hint}`);
    return { sent: false, reason: `${e.message}${hint}` };
  }
}

// ── Holiday WhatsApp ──────────────────────────────────────────────────────────

export interface HolidayWhatsAppData {
  customerName:   string;
  phone:          string;
  destination:    string;
  duration?:      string;
  people?:        number;
  travelDate?:    string;
  packageName?:   string;
  pricePerPerson?: number;
  totalPrice?:    number;
  trigger:        "lead" | "booking";
  bookingId?:     string;
}

function buildHolidayMessage(data: HolidayWhatsAppData, pdfUrl: string): string {
  const name   = data.customerName;
  const dest   = data.destination;
  const dur    = data.duration ? ` | ${data.duration}` : "";
  const people = data.people   ? ` | ${data.people} traveller${data.people > 1 ? "s" : ""}` : "";
  const price  = data.totalPrice
    ? `\n💰 *Package Price:* ₹${data.totalPrice.toLocaleString("en-IN")}`
    : "";

  if (data.trigger === "booking") {
    return (
      `🎉 *Booking Confirmed!*\n\n` +
      `Hi *${name}*,\n\n` +
      `Your *${dest}* holiday package is booked! 🌴\n` +
      `📅 *Trip:* ${dest}${dur}${people}` +
      price + "\n\n" +
      `📥 *Download Your Itinerary:*\n${pdfUrl}\n\n` +
      `Our travel expert will call you within 24 hours.\n\n` +
      `_${APP_NAME} ✈️ — ${APP_TAGLINE_LONG}_`
    );
  }

  // lead trigger
  return (
    `👋 Hi *${name}*,\n\n` +
    `Thanks for your interest in *${dest}*! 🌴\n\n` +
    `We've prepared a personalised itinerary for you:\n` +
    `🗓️ *Destination:* ${dest}${dur}${people}` +
    "\n\n" +
    `📥 *Download Your Itinerary PDF:*\n${pdfUrl}\n\n` +
    `Our travel expert will call you within *24 hours* with the best package options.\n\n` +
    `_${APP_NAME} ✈️ — ${APP_TAGLINE_LONG}_`
  );
}

// ── CRM Lead Notifications ───────────────────────────────────────────────────

export interface LeadNotificationData {
  leadId:  string;
  name:    string;
  phone:   string;
  type:    string;
  email?:  string;
  source?: string;
}

function buildLeadAdminAlertMessage(lead: LeadNotificationData): string {
  const typeLabel = lead.type.charAt(0).toUpperCase() + lead.type.slice(1);
  const time = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit", minute: "2-digit",
    day: "2-digit", month: "short", year: "numeric",
  });
  return (
    `🔔 *New Lead Alert — ${APP_NAME}*\n\n` +
    `👤 *Name:* ${lead.name}\n` +
    `📱 *Phone:* ${lead.phone}\n` +
    `🔍 *Looking for:* ${typeLabel}\n` +
    (lead.email ? `📧 *Email:* ${lead.email}\n` : "") +
    `🆔 *Lead ID:* ${lead.leadId}\n` +
    `⏱️ *Received:* ${time} IST\n\n` +
    `Reply quickly to increase conversion! 🚀\n` +
    `_CRM: dreamflyglobal.com/crm_`
  );
}

function buildLeadCustomerConfirmationMessage(lead: LeadNotificationData): string {
  const typeLabel = lead.type.charAt(0).toUpperCase() + lead.type.slice(1);
  const firstName = lead.name.split(" ")[0];
  return (
    `👋 Hi *${firstName}*!\n\n` +
    `✅ We've received your enquiry for a *${typeLabel}* booking.\n\n` +
    `Our travel expert will contact you within *30 minutes*.\n\n` +
    `📞 Support: ${APP_SUPPORT_PHONE}\n` +
    `📧 ${APP_SUPPORT_EMAIL}\n\n` +
    `_${APP_NAME} ✈️ — ${APP_TAGLINE_LONG}_`
  );
}

function buildAbandonedLeadMessage(lead: LeadNotificationData): string {
  const typeLabel = lead.type === "flight" ? "flights" : lead.type === "hotel" ? "hotels" : lead.type + "s";
  const firstName = lead.name.split(" ")[0];
  return (
    `👋 Hi *${firstName}*!\n\n` +
    `🔍 You were searching for *${typeLabel}* on ${APP_NAME}.\n\n` +
    `Did you find what you were looking for? Our experts can help you find the *best deals* tailored to your needs!\n\n` +
    `📞 Call us: *+91 9000978856*\n` +
    `💬 Or reply to this message\n\n` +
    `_${APP_NAME} ✈️ — Don't miss out on great deals!_`
  );
}

function buildStaffFollowUpMessage(lead: LeadNotificationData): string {
  const typeLabel = lead.type.charAt(0).toUpperCase() + lead.type.slice(1);
  return (
    `⏰ *30-Min Follow-Up Reminder*\n\n` +
    `Lead *${lead.name}* (📱 ${lead.phone}) has *NOT been contacted* in 30 minutes!\n\n` +
    `🔍 *Service:* ${typeLabel}\n` +
    `🆔 *Lead ID:* ${lead.leadId}\n\n` +
    `Please reach out now to increase conversion! 🎯\n` +
    `_${APP_NAME} CRM_`
  );
}

async function sendRawWhatsApp(toPhone: string, body: string, logTag: string): Promise<{ sent: boolean; reason?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID   || "";
  const authToken  = process.env.TWILIO_AUTH_TOKEN    || "";
  const rawFrom    = process.env.TWILIO_WHATSAPP_FROM || "";
  const overrideTo = process.env.TWILIO_WHATSAPP_TO   || "";

  if (!accountSid || !authToken || !rawFrom) {
    console.warn(`[${logTag}] Twilio not fully configured — skipping`);
    return { sent: false, reason: "Twilio not configured" };
  }

  // Build FROM — always whatsapp:+E164 format (strip any non-digit chars)
  const fromE164   = rawFrom.replace(/\D/g, "");
  const fromNumber = `whatsapp:+${fromE164}`;

  const resolvedTo = overrideTo || toPhone;
  if (!resolvedTo) return { sent: false, reason: "No destination phone" };
  const toNumber = toWhatsApp(resolvedTo);

  console.log(`[${logTag}] Sending → From: ${fromNumber}  To: ${toNumber}`);
  try {
    const client = twilio(accountSid, authToken);
    const res    = await client.messages.create({ from: fromNumber, to: toNumber, body });
    console.log(`[${logTag}] Sent ✓ SID: ${res.sid}  Status: ${res.status}`);
    return { sent: true };
  } catch (e: any) {
    console.error(`[${logTag}] WhatsApp error:`, e);
    console.error(`[${logTag}] Failed — Code: ${e.code ?? "N/A"} | ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

export async function sendLeadAdminAlert(lead: LeadNotificationData): Promise<{ sent: boolean; reason?: string }> {
  const adminPhone = process.env.TWILIO_WHATSAPP_TO || "";
  if (!adminPhone) {
    console.info("[lead-admin-alert] TWILIO_WHATSAPP_TO not set — skipping admin alert");
    return { sent: false, reason: "Admin phone not configured" };
  }
  const body = buildLeadAdminAlertMessage(lead);
  return sendRawWhatsApp(adminPhone, body, "lead-admin-alert");
}

export async function sendLeadCustomerConfirmation(lead: LeadNotificationData): Promise<{ sent: boolean; reason?: string }> {
  if (!lead.phone) return { sent: false, reason: "No customer phone" };
  const body = buildLeadCustomerConfirmationMessage(lead);
  return sendRawWhatsApp(lead.phone, body, "lead-customer-confirm");
}

export async function sendAbandonedLeadReminder(lead: LeadNotificationData): Promise<{ sent: boolean; reason?: string }> {
  if (!lead.phone) return { sent: false, reason: "No customer phone" };
  const body = buildAbandonedLeadMessage(lead);
  return sendRawWhatsApp(lead.phone, body, "abandoned-reminder");
}

export async function sendStaffFollowUpReminder(lead: LeadNotificationData): Promise<{ sent: boolean; reason?: string }> {
  const adminPhone = process.env.TWILIO_WHATSAPP_TO || "";
  if (!adminPhone) {
    console.info("[staff-followup] TWILIO_WHATSAPP_TO not set — skipping staff reminder");
    return { sent: false, reason: "Admin phone not configured" };
  }
  const body = buildStaffFollowUpMessage(lead);
  return sendRawWhatsApp(adminPhone, body, "staff-followup");
}

// ── Holiday WhatsApp ──────────────────────────────────────────────────────────

export async function sendHolidayWhatsApp(
  data: HolidayWhatsAppData,
): Promise<{ sent: boolean; pdfUrl?: string; reason?: string }> {
  // Build the PDF URL using the public Replit domain (or fallback)
  const domain    = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const baseUrl   = domain === "localhost" ? `http://localhost:${process.env.PORT || 3000}` : `https://${domain}`;
  const pdfParams = new URLSearchParams({
    name:     data.customerName,
    phone:    data.phone,
    dest:     data.destination,
    duration: data.duration || "4D/3N",
    people:   String(data.people || 2),
    ...(data.travelDate     ? { date:  data.travelDate }           : {}),
    ...(data.packageName    ? { pkg:   data.packageName }          : {}),
    ...(data.pricePerPerson ? { price: String(data.pricePerPerson) } : {}),
    ...(data.totalPrice     ? { total: String(data.totalPrice) }   : {}),
  });
  const pdfUrl = `${baseUrl}/api/itinerary-pdf?${pdfParams.toString()}`;

  console.log(`[holiday-whatsapp] PDF URL: ${pdfUrl}`);

  const accountSid = process.env.TWILIO_ACCOUNT_SID    || "";
  const authToken  = process.env.TWILIO_AUTH_TOKEN     || "";
  const rawFrom    = process.env.TWILIO_WHATSAPP_FROM  || "+14155238886";
  const overrideTo = process.env.TWILIO_WHATSAPP_TO    || "";

  const fromNumber = rawFrom.startsWith("whatsapp:") ? rawFrom : `whatsapp:${rawFrom}`;

  if (!accountSid || !authToken) {
    console.info("[holiday-whatsapp] Twilio credentials not configured — skipping message send");
    return { sent: false, pdfUrl, reason: "Twilio not configured" };
  }

  const resolvedPhone = overrideTo || data.phone;
  if (!resolvedPhone) {
    return { sent: false, pdfUrl, reason: "No phone number" };
  }

  const toNumber = toWhatsApp(resolvedPhone);
  const body     = buildHolidayMessage(data, pdfUrl);

  console.log(`[holiday-whatsapp] Sending to: ${toNumber}`);

  try {
    const client  = twilio(accountSid, authToken);
    const message = await client.messages.create({ from: fromNumber, to: toNumber, body });
    console.log(`[holiday-whatsapp] Sent — SID: ${message.sid}`);
    return { sent: true, pdfUrl };
  } catch (err: any) {
    console.error(`[holiday-whatsapp] Failed: ${err.message}`);
    return { sent: false, pdfUrl, reason: err.message };
  }
}
