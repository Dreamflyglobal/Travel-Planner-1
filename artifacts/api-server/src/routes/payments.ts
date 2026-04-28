import { Router }  from "express";
import crypto      from "crypto";
import Razorpay    from "razorpay";
import { sendWhatsAppNotification }   from "../lib/whatsapp-service.js";
import { sendGeneralBookingEmail }     from "../lib/email-service.js";
import type { GeneralBookingEmailData } from "../lib/email-service.js";
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

    const amountPaise = Math.round(Number(amount) * 100);

    if (mode === "test" || mode === "live") {
      const rzp   = buildRazorpayClient(KEY_ID, KEY_SEC)!;
      const order = await rzp.orders.create({
        amount:   amountPaise,
        currency,
        receipt:  receipt || `rcpt_${Date.now()}`,
        notes:    notes   || {},
      });
      console.log(`[payments] Order created (${mode}) — ID: ${order.id}  Amount: ₹${amount}`);
      return res.json({ success: true, order, key: KEY_ID, keyMode: mode });
    }

    const mockOrder = {
      id:           `order_DEMO${Date.now()}`,
      entity:       "order",
      amount:       amountPaise,
      amount_paid:  0,
      amount_due:   amountPaise,
      currency,
      receipt:      receipt || `rcpt_${Date.now()}`,
      status:       "created",
      attempts:     0,
      notes:        notes || {},
      created_at:   Math.floor(Date.now() / 1000),
    };
    console.log(`[payments] Demo order created (no keys) — Amount: ₹${amount}`);
    return res.json({ success: true, order: mockOrder, key: "", keyMode: "demo", demoMode: true });

  } catch (err: any) {
    console.error("[payments] create-order error:", err?.error?.description || err?.message || err);
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

    let verified = false;

    if (razorpay_order_id.startsWith("order_DEMO") || razorpay_payment_id.startsWith("pay_DEMO")) {
      console.log(`[payments] Demo payment accepted — ${razorpay_payment_id}`);
      verified = true;
    } else {
      const cfg        = await getProviderConfig();
      const KEY_SEC    = cfg.paymentKeySecret;
      const sign       = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSign = crypto
        .createHmac("sha256", KEY_SEC)
        .update(sign)
        .digest("hex");
      verified = expectedSign === razorpay_signature;
      if (!verified) {
        console.warn(`[payments] Signature mismatch — order: ${razorpay_order_id}  payment: ${razorpay_payment_id}`);
      }
    }

    if (!verified) {
      return res.status(400).json({ success: false, error: "Payment verification failed. Invalid signature." });
    }

    console.log(`[payments] Payment verified ✓ — ${razorpay_payment_id}`);

    return res.json({
      success:   true,
      message:   "Payment verified",
      paymentId: razorpay_payment_id,
    });

  } catch (err: any) {
    console.error("[payments] verify error:", err.message);
    res.status(500).json({ success: false, error: err.message || "Verification failed" });
  }
});

/**
 * POST /api/payments/notify
 * Sends booking confirmation via Email + WhatsApp.
 */
router.post("/notify", async (req, res) => {
  const { bookingContext, frontendBaseUrl } = req.body;

  if (!bookingContext?.bookingId) {
    return res.status(400).json({ success: false, error: "bookingContext.bookingId is required" });
  }

  const invoiceUrl = `${frontendBaseUrl || "https://dreamflyglobal.in"}/invoice/${bookingContext.bookingId}`;
  console.log(`[notify] Invoice URL: ${invoiceUrl}`);

  let emailSent    = false;
  let emailReason  = "";

  if (bookingContext.passengerEmail) {
    const emailData: GeneralBookingEmailData = {
      bookingId:      bookingContext.bookingId,
      bookingType:    bookingContext.bookingType || "flight",
      passengerName:  bookingContext.passengerName || "Traveller",
      passengerEmail: bookingContext.passengerEmail,
      title:          bookingContext.title || bookingContext.bookingId,
      travelDate:     bookingContext.travelDate || new Date().toISOString(),
      passengers:     bookingContext.passengers || 1,
      totalAmount:    bookingContext.totalAmount || 0,
      paymentId:      bookingContext.paymentId   || "",
      invoiceUrl,
    };
    try {
      const result = await sendGeneralBookingEmail(emailData);
      emailSent    = result.sent;
      emailReason  = result.reason || "";
      if (!result.sent) console.warn(`[notify] Email not sent: ${result.reason}`);
    } catch (err: any) {
      emailReason = err.message;
      console.error(`[notify] Email error: ${err.message}`);
    }
  } else {
    emailReason = "No email address provided";
    console.warn("[notify] No passengerEmail — skipping email");
  }

  let whatsappSent   = false;
  let whatsappReason = "";

  if (bookingContext.phone) {
    console.log("WhatsApp triggered", { bookingId: bookingContext.bookingId, phone: bookingContext.phone });
    try {
      const travelDateStr = bookingContext.travelDate
        ? new Date(bookingContext.travelDate).toLocaleDateString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
          })
        : "";
      const result = await sendWhatsAppNotification({
        bookingId:      bookingContext.bookingId,
        passengerName:  bookingContext.passengerName || "Traveller",
        phone:          bookingContext.phone,
        bookingType:    bookingContext.bookingType,
        from:           bookingContext.from || bookingContext.flightFrom || bookingContext.busFrom || bookingContext.hotelCity || "",
        to:             bookingContext.to   || bookingContext.flightTo   || bookingContext.busTo   || "",
        date:           travelDateStr,
        amount:         bookingContext.totalAmount || 0,
        invoiceUrl,
        airline:        bookingContext.flightAirline,
        flightNum:      bookingContext.flightNumber,
        flightDeparture: bookingContext.flightDeparture,
        flightArrival:  bookingContext.flightArrival,
        flightDuration: bookingContext.flightDuration,
        busOperator:    bookingContext.busOperator,
        busType:        bookingContext.busType,
        boardingPoint:  bookingContext.busBoardingPoint,
        droppingPoint:  bookingContext.busDroppingPoint,
        busDeparture:   bookingContext.busDeparture,
        busArrival:     bookingContext.busArrival,
        hotelName:      bookingContext.hotelName,
        hotelCity:      bookingContext.hotelCity,
        hotelNights:    bookingContext.hotelNights,
      });
      whatsappSent   = result.sent;
      whatsappReason = result.reason || "";
      if (!result.sent) console.warn(`[notify] WhatsApp not sent: ${result.reason}`);
    } catch (err: any) {
      whatsappReason = err.message;
      console.error(`[notify] WhatsApp error: ${err.message}`);
    }
  } else {
    whatsappReason = "No phone number provided";
    console.warn("[notify] No phone — skipping WhatsApp");
  }

  if (bookingContext.phone) {
    const userId = bookingContext.userId || `guest_${Date.now()}`;
    scheduleBookingFollowUp({
      userId,
      name:        bookingContext.passengerName || "Traveller",
      phone:       bookingContext.phone,
      bookingId:   bookingContext.bookingId,
      bookingType: bookingContext.bookingType || "flight",
      from:        bookingContext.from || bookingContext.flightFrom || bookingContext.busFrom || "",
      to:          bookingContext.to   || bookingContext.flightTo   || bookingContext.busTo   || "",
    });
  }

  return res.json({
    success: true,
    invoiceUrl,
    emailSent,
    whatsappSent,
    ...(emailReason    ? { emailReason }    : {}),
    ...(whatsappReason ? { whatsappReason } : {}),
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
    console.log(`[payments] Webhook: ${event}`, payload?.payment?.entity?.id ?? "");
    res.json({ success: true });
  } catch (err: any) {
    console.error("[payments] webhook error:", err.message);
    res.status(500).json({ error: err.message || "Webhook error" });
  }
});

export default router;
