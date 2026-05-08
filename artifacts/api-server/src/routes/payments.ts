import { Router }  from "express";
import { logger } from "../lib/logger.js";
import crypto      from "crypto";
import Razorpay    from "razorpay";
import { sendAllBookingNotifications, type BookingNotificationData } from "../lib/notification-service.js";
import { scheduleBookingFollowUp }    from "../lib/marketing-scheduler.js";
import { getProviderConfig }          from "../lib/provider-config.js";

const router = Router();

type KeyMode = "test" | "live" | "demo";

function resolveKeyMode(keyId: string, keySecret: string): KeyMode {
  if (keyId.startsWith("rzp_test_") && keySecret) return "test";
  if (keyId.startsWith("rzp_live_") && keySecret) return "live";
  return "demo";
}

function buildRazorpayClient(keyId: string, keySecret: string): Razorpay | null {
  const mode = resolveKeyMode(keyId, keySecret);
  if (mode === "test" || mode === "live") {
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return null;
}

/**
 * POST /api/payments/create-order
 *
 * Body: { amount: number (rupees), currency?: string, receipt?: string, notes?: object }
 * Returns: { success, order, key, keyMode }
 */
router.post("/create-order", async (req, res) => {
  try {
    const { amount, currency = "INR", receipt, notes } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }

    const cfg     = await getProviderConfig();
    const KEY_ID  = cfg.paymentKeyId;
    const KEY_SEC = cfg.paymentKeySecret;
    const mode    = resolveKeyMode(KEY_ID, KEY_SEC);

    if (mode !== "test" && mode !== "live") {
      logger.error("[payments] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
      return res.status(503).json({
        success: false,
        error:   "Payment gateway is not configured. Please contact support.",
      });
    }

    const amountPaise = Math.round(Number(amount) * 100);
    const rzp   = buildRazorpayClient(KEY_ID, KEY_SEC)!;
    const order = await rzp.orders.create({
      amount:   amountPaise,
      currency,
      receipt:  receipt || `rcpt_${Date.now()}`,
      notes:    notes   || {},
    });
    logger.info(`[payments] Order created (${mode}) — ID: ${order.id}  Amount: ₹${amount}`);
    return res.json({ success: true, order, key: KEY_ID, keyMode: mode });

  } catch (err: any) {
    logger.error("[payments] create-order error:", err?.error?.description || err?.message || err);
    res.status(500).json({ success: false, error: err?.error?.description || err?.message || "Failed to create order" });
  }
});

/**
 * POST /api/payments/verify
 * Verifies the Razorpay payment signature.
 */
router.post("/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingContext,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const cfg     = await getProviderConfig();
    const KEY_SEC = cfg.paymentKeySecret;

    if (!KEY_SEC) {
      logger.error("[payments] RAZORPAY_KEY_SECRET not configured — cannot verify");
      return res.status(503).json({ success: false, error: "Payment gateway not configured" });
    }

    const sign         = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSign = crypto.createHmac("sha256", KEY_SEC).update(sign).digest("hex");
    const verified     = expectedSign === razorpay_signature;

    if (!verified) {
      logger.warn(`[payments] Signature mismatch — order: ${razorpay_order_id}  payment: ${razorpay_payment_id}`);
    }

    if (!verified) {
      return res.status(400).json({ success: false, error: "Payment verification failed. Invalid signature." });
    }

    logger.info(`[payments] Payment verified ✓ — ${razorpay_payment_id}`);

    return res.json({
      success:   true,
      message:   "Payment verified",
      paymentId: razorpay_payment_id,
    });

  } catch (err: any) {
    logger.error("[payments] verify error:", err.message);
    res.status(500).json({ success: false, error: err.message || "Verification failed" });
  }
});

/**
 * POST /api/payments/notify
 * Sends booking confirmation via Email + SMS + WhatsApp.
 */
router.post("/notify", async (req, res) => {
  const { bookingContext, frontendBaseUrl } = req.body;

  if (!bookingContext?.bookingId) {
    return res.status(400).json({ success: false, error: "bookingContext.bookingId is required" });
  }

  const invoiceUrl = `${frontendBaseUrl || "https://dreamflyglobal.in"}/invoice/${bookingContext.bookingId}`;
  logger.info(`[notify] Sending all channels — booking: ${bookingContext.bookingId}  invoiceUrl: ${invoiceUrl}`);

  const notifData: BookingNotificationData = {
    bookingId:      bookingContext.bookingId,
    bookingType:    bookingContext.bookingType || "flight",
    passengerName:  bookingContext.passengerName || "Traveller",
    passengerEmail: bookingContext.passengerEmail || undefined,
    passengerPhone: bookingContext.phone          || undefined,
    travelDate:     bookingContext.travelDate     || new Date().toISOString(),
    totalAmount:    bookingContext.totalAmount    || 0,
    paymentId:      bookingContext.paymentId      || "",
    passengers:     bookingContext.passengers     || 1,
    invoiceUrl,
    title:          bookingContext.title          || bookingContext.bookingId,
    from:           bookingContext.from || bookingContext.flightFrom || bookingContext.busFrom || bookingContext.hotelCity || "",
    to:             bookingContext.to   || bookingContext.flightTo   || bookingContext.busTo   || "",
    // Flight
    airline:         bookingContext.flightAirline,
    flightNumber:    bookingContext.flightNumber,
    flightDeparture: bookingContext.flightDeparture,
    flightArrival:   bookingContext.flightArrival,
    flightDuration:  bookingContext.flightDuration,
    // Bus
    busOperator:    bookingContext.busOperator,
    busType:        bookingContext.busType,
    boardingPoint:  bookingContext.busBoardingPoint,
    droppingPoint:  bookingContext.busDroppingPoint,
    busDeparture:   bookingContext.busDeparture,
    busArrival:     bookingContext.busArrival,
    // Hotel
    hotelName:      bookingContext.hotelName,
    hotelCity:      bookingContext.hotelCity,
    hotelNights:    bookingContext.hotelNights,
  };

  const { email, sms, whatsapp } = await sendAllBookingNotifications(notifData);

  // Schedule marketing follow-up
  if (bookingContext.phone) {
    const userId = bookingContext.userId || `guest_${Date.now()}`;
    scheduleBookingFollowUp({
      userId,
      name:        bookingContext.passengerName || "Traveller",
      phone:       bookingContext.phone,
      bookingId:   bookingContext.bookingId,
      bookingType: bookingContext.bookingType || "flight",
      from:        notifData.from || "",
      to:          notifData.to   || "",
    });
  }

  return res.json({
    success:      true,
    invoiceUrl,
    emailSent:    email.sent,
    smsSent:      sms.sent,
    whatsappSent: whatsapp.sent,
    ...(email.reason    ? { emailReason:    email.reason }    : {}),
    ...(sms.reason      ? { smsReason:      sms.reason }      : {}),
    ...(whatsapp.reason ? { whatsappReason: whatsapp.reason } : {}),
  });
});

/**
 * POST /api/payments/webhook
 */
router.post("/webhook", async (req, res) => {
  try {
    const sig  = req.headers["x-razorpay-signature"] as string;
    const body = JSON.stringify(req.body);

    const cfg     = await getProviderConfig();
    const KEY_SEC = cfg.paymentKeySecret;

    if (KEY_SEC) {
      const expected = crypto.createHmac("sha256", KEY_SEC).update(body).digest("hex");
      if (sig !== expected) {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }
    }

    const { event, payload } = req.body;
    logger.info(`[payments] Webhook: ${event}`, payload?.payment?.entity?.id ?? "");
    res.json({ success: true });
  } catch (err: any) {
    logger.error("[payments] webhook error:", err.message);
    res.status(500).json({ error: err.message || "Webhook error" });
  }
});

export default router;
