import twilio from "twilio";
import { logger } from "./logger.js";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export async function sendRawMarketingWhatsApp(
  toPhone: string,
  body:    string,
  logTag:  string,
): Promise<{ sent: boolean; reason?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID   || "";
  const authToken  = process.env.TWILIO_AUTH_TOKEN    || "";
  const rawFrom    = process.env.TWILIO_WHATSAPP_FROM || "";
  const overrideTo = process.env.TWILIO_WHATSAPP_TO   || "";

  if (!accountSid || !authToken || !rawFrom) {
    logger.warn(`[marketing/${logTag}] Twilio not configured — skipping`);
    return { sent: false, reason: "Twilio not configured" };
  }

  const fromE164   = rawFrom.replace(/\D/g, "");
  const fromNumber = `whatsapp:+${fromE164}`;

  const resolvedTo = overrideTo || toPhone;
  if (!resolvedTo) return { sent: false, reason: "No destination phone" };

  const toE164    = formatPhone(resolvedTo);
  const toNumber  = `whatsapp:${toE164}`;

  logger.info(`[marketing/${logTag}] Sending → ${fromNumber} → ${toNumber}`);
  try {
    const client = twilio(accountSid, authToken);
    const res    = await client.messages.create({ from: fromNumber, to: toNumber, body });
    logger.info(`[marketing/${logTag}] Sent ✓ SID: ${res.sid}`);
    return { sent: true };
  } catch (e: any) {
    const hint =
      e.code === 63016 ? " — recipient not opted in to Twilio sandbox" :
      e.code === 63007 ? " — FROM not WhatsApp-enabled"                :
      e.code === 21211 ? " — TO number invalid"                        : "";
    logger.error(`[marketing/${logTag}] Error ${e.code ?? ""}:`, e.message, hint);
    return { sent: false, reason: `${e.message}${hint}` };
  }
}
