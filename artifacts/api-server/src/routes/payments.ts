import { Router }  from "express";
import { logger } from "../lib/logger.js";
import crypto      from "crypto";
import Razorpay    from "razorpay";
import { sendAllBookingNotifications, type BookingNotificationData } from "../lib/notification-service.js";
import { scheduleBookingFollowUp }    from "../lib/marketing-scheduler.js";
import { getProviderConfig }          from "../lib/provider-config.js";
import { requireAdmin }               from "../lib/admin-auth.js";

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

    // Log key loading so we can verify correct env vars are picked up.
    // Shows prefix + masked suffix — never logs the full secret.
    logger.info(
      {
        keyMode:       mode,
        keyIdPrefix:   KEY_ID   ? `${KEY_ID.slice(0, 14)}***`   : "(empty)",
        keySecLoaded:  KEY_SEC  ? `${KEY_SEC.slice(0, 6)}***`    : "(empty)",
        keyIdSource:   KEY_ID   ? (KEY_ID === process.env["RAZORPAY_KEY_ID"] ? "env" : "db") : "none",
      },
      "[payments] create-order — key check",
    );

    if (mode !== "test" && mode !== "live") {
      logger.error(
        { keyIdPrefix: KEY_ID ? `${KEY_ID.slice(0, 14)}***` : "(empty)", keySecLoaded: !!KEY_SEC },
        "[payments] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured or unrecognised prefix",
      );
      return res.status(503).json({
        success: false,
        error:   "Payment gateway is not configured. Please contact support.",
      });
    }

    const amountPaise = Math.round(Number(amount) * 100);

    logger.info(
      {
        url:        "https://api.razorpay.com/v1/orders",
        keyMode:    mode,
        amountINR:  amount,
        amountPaise,
        currency,
      },
      "[payments] calling Razorpay orders.create",
    );

    const rzp   = buildRazorpayClient(KEY_ID, KEY_SEC)!;
    const order = await rzp.orders.create({
      amount:   amountPaise,
      currency,
      receipt:  receipt || `rcpt_${Date.now()}`,
      notes:    notes   || {},
    });

    logger.info(
      { keyMode: mode, orderId: order.id, amountINR: amount },
      "[payments] Razorpay order created ✓",
    );
    return res.json({ success: true, order, key: KEY_ID, keyMode: mode });

  } catch (err: any) {
    // Razorpay SDK errors:
    //   err.statusCode  — HTTP status returned by Razorpay (e.g. 401, 400)
    //   err.error       — parsed Razorpay error body { code, description, source, step, reason }
    const rzpErr    = err?.error ?? {};
    const httpStatus = err?.statusCode ?? 500;

    logger.error(
      {
        httpStatus,
        url:         "https://api.razorpay.com/v1/orders",
        code:        rzpErr.code,
        description: rzpErr.description,
        source:      rzpErr.source,
        step:        rzpErr.step,
        reason:      rzpErr.reason,
        field:       rzpErr.field,
        rawMessage:  err?.message,
        fullError:   JSON.stringify(err?.error ?? err ?? null),
      },
      "[payments] create-order FAILED",
    );

    res.status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500).json({
      success:    false,
      error:      rzpErr.description || err?.message || "Failed to create order",
      razorpay: {
        httpStatus,
        code:        rzpErr.code        || null,
        description: rzpErr.description || null,
        source:      rzpErr.source      || null,
        step:        rzpErr.step        || null,
        reason:      rzpErr.reason      || null,
      },
    });
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
 *
 * IMPORTANT: Razorpay signs webhook payloads with a dedicated "Webhook Secret"
 * (configured separately in Razorpay Dashboard → Settings → Webhooks) — this is
 * NOT the same value as RAZORPAY_KEY_SECRET (the API key secret used for
 * order creation / payment verification). Using the wrong secret here always
 * produces a signature mismatch for real webhook deliveries.
 */
router.post("/webhook", async (req, res) => {
  try {
    const sig            = req.headers["x-razorpay-signature"] as string | undefined;
    const body            = JSON.stringify(req.body);
    const WEBHOOK_SECRET  = process.env["RAZORPAY_WEBHOOK_SECRET"];

    if (!WEBHOOK_SECRET) {
      logger.warn(
        "[payments] RAZORPAY_WEBHOOK_SECRET not configured — webhook signature is NOT being verified. " +
        "Set RAZORPAY_WEBHOOK_SECRET (from Razorpay Dashboard → Settings → Webhooks) to enable verification.",
      );
    } else {
      if (!sig) {
        logger.error("[payments] Webhook rejected — missing x-razorpay-signature header");
        return res.status(400).json({ error: "Missing webhook signature" });
      }
      const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
      if (sig !== expected) {
        logger.error(
          { event: req.body?.event },
          "[payments] Webhook rejected — signature mismatch (check RAZORPAY_WEBHOOK_SECRET matches the Dashboard value)",
        );
        return res.status(400).json({ error: "Invalid webhook signature" });
      }
    }

    const { event, payload } = req.body;
    logger.info(`[payments] Webhook verified: ${event}`, payload?.payment?.entity?.id ?? "");
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "[payments] webhook error");
    res.status(500).json({ error: err.message || "Webhook error" });
  }
});

/**
 * GET /api/payments/check-config
 *
 * Admin-only endpoint that verifies Razorpay credentials are loaded and
 * that they actually authenticate against the Razorpay API.
 *
 * Makes a minimal GET /v1/payments?count=1 call — read-only, no side effects.
 *
 * Returns:
 *   { keyMode, maskedKeyId, connected, httpStatus, razorpay: { code, description, ... }, warning }
 */
router.get("/check-config", requireAdmin, async (_req, res) => {
  const cfg     = await getProviderConfig();
  const KEY_ID  = cfg.paymentKeyId;
  const KEY_SEC = cfg.paymentKeySecret;
  const mode    = resolveKeyMode(KEY_ID, KEY_SEC);

  // Mask: show first 8 chars then "***" — e.g. "rzp_test***"
  const maskedKeyId = KEY_ID
    ? `${KEY_ID.slice(0, 8)}***`
    : "(not set)";

  // Warning: test key used but could be in production context
  const warning: string | null =
    mode === "test"
      ? "Test key detected — switch to a live key (rzp_live_…) before going to production."
      : mode === "demo"
      ? "No Razorpay keys configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
      : null;

  logger.info(
    {
      keyMode:      mode,
      maskedKeyId,
      keyIdSource:  KEY_ID ? (KEY_ID === process.env["RAZORPAY_KEY_ID"] ? "env" : "db") : "none",
      keySecLoaded: KEY_SEC ? `${KEY_SEC.slice(0, 6)}***` : "(empty)",
    },
    "[payments/check-config] key check",
  );

  if (mode === "demo") {
    return res.json({
      keyMode:    "demo",
      maskedKeyId,
      connected:  false,
      httpStatus: null,
      razorpay:   null,
      warning,
      error:      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set or have an unrecognised prefix.",
    });
  }

  // Make a lightweight read-only API call to verify credentials
  try {
    const auth = Buffer.from(`${KEY_ID}:${KEY_SEC}`).toString("base64");
    const resp = await fetch(
      "https://api.razorpay.com/v1/payments?count=1&skip=0",
      { headers: { Authorization: `Basic ${auth}` } },
    );

    const body = await resp.json().catch(() => ({})) as Record<string, any>;
    const rzpErr = body?.error ?? null;

    logger.info(
      {
        keyMode:    mode,
        maskedKeyId,
        httpStatus: resp.status,
        connected:  resp.ok,
        code:       rzpErr?.code        ?? null,
        description: rzpErr?.description ?? null,
        source:     rzpErr?.source      ?? null,
        step:       rzpErr?.step        ?? null,
        reason:     rzpErr?.reason      ?? null,
      },
      resp.ok
        ? "[payments/check-config] Razorpay connection verified ✓"
        : "[payments/check-config] Razorpay connection FAILED",
    );

    return res.json({
      keyMode:    mode,
      maskedKeyId,
      connected:  resp.ok,
      httpStatus: resp.status,
      razorpay:   rzpErr
        ? {
            code:        rzpErr.code        ?? null,
            description: rzpErr.description ?? null,
            source:      rzpErr.source      ?? null,
            step:        rzpErr.step        ?? null,
            reason:      rzpErr.reason      ?? null,
          }
        : null,
      warning,
      error: resp.ok ? null : (rzpErr?.description ?? `HTTP ${resp.status}`),
    });

  } catch (err: any) {
    logger.error(
      { keyMode: mode, maskedKeyId, err: err?.message },
      "[payments/check-config] network error reaching Razorpay",
    );
    return res.status(502).json({
      keyMode:    mode,
      maskedKeyId,
      connected:  false,
      httpStatus: null,
      razorpay:   null,
      warning,
      error:      `Network error: ${err?.message ?? "could not reach Razorpay API"}`,
    });
  }
});

export default router;
