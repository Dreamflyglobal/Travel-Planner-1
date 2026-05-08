/**
 * POST /api/verify-payment
 *
 * Two-stage payment verification:
 *   1. HMAC-SHA256 signature check  (Razorpay callback integrity)
 *   2. Live payment status fetch    (Razorpay API — confirms payment is not failed)
 *
 * Body:
 *   { razorpay_payment_id, razorpay_order_id, razorpay_signature, bookingContext? }
 *
 * Returns:
 *   { success: true, paymentId, paymentStatus }  — both checks passed
 *   { success: false, error }                    — either check failed
 */

import { Router } from "express";
import crypto     from "crypto";
import { getProviderConfig } from "../lib/provider-config.js";
import { logger }            from "../lib/logger.js";

const router = Router();

// ── HMAC signature verification ───────────────────────────────────────────────
/**
 * Shared HMAC verification — used by both /api/verify-payment and /api/book-flight.
 * Only checks cryptographic signature; does NOT call the Razorpay REST API.
 */
export async function verifyRazorpaySignature(
  razorpay_payment_id: string,
  razorpay_order_id:   string,
  razorpay_signature:  string,
): Promise<{ success: boolean; error?: string }> {
  const cfg     = await getProviderConfig();
  const KEY_SEC = cfg.paymentKeySecret;

  if (!KEY_SEC) {
    logger.error("[verify-payment] RAZORPAY_KEY_SECRET not configured");
    return { success: false, error: "Payment gateway not configured" };
  }

  const sign         = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSign = crypto.createHmac("sha256", KEY_SEC).update(sign).digest("hex");
  const valid        = expectedSign === razorpay_signature;

  if (!valid) {
    logger.warn(
      { razorpay_payment_id, razorpay_order_id },
      "[verify-payment] HMAC signature mismatch",
    );
    return { success: false, error: "Payment verification failed. Invalid signature." };
  }

  logger.info({ razorpay_payment_id, razorpay_order_id }, "[verify-payment] HMAC signature verified ✓");
  return { success: true };
}

// ── Live payment status check via Razorpay API ────────────────────────────────
/**
 * Fetches the payment from Razorpay REST API and validates its status.
 *
 * Accepted statuses: "authorized" | "captured"
 * Rejected:          "failed" | "created" | "refunded" | anything else
 *
 * Skips the API call for non-Razorpay payment IDs (wallet_, cred_, demo_).
 * On network error, fails safe (rejects the booking).
 */
export async function checkRazorpayPaymentLive(
  paymentId: string,
  keyId: string,
  keySecret: string,
): Promise<{ ok: boolean; status?: string; amountRupees?: number; method?: string; error?: string }> {
  // Non-Razorpay payment methods — skip live API check
  if (
    !keyId || !keySecret ||
    paymentId.startsWith("demo_")   ||
    paymentId.startsWith("wallet_") ||
    paymentId.startsWith("cred_")
  ) {
    logger.info({ paymentId }, "[verify-payment] non-Razorpay payment — skipping live status check");
    return { ok: true, status: "authorized" };
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const resp = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Basic ${auth}` } },
    );

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({})) as Record<string, any>;
      const errMsg  = errBody?.error?.description || errBody?.error?.reason || `HTTP ${resp.status}`;
      logger.error({ paymentId, httpStatus: resp.status, errMsg }, "[verify-payment] Razorpay payment fetch failed");
      return { ok: false, error: `Could not verify payment: ${errMsg}` };
    }

    const p            = await resp.json() as Record<string, any>;
    const status       = (p.status  as string) ?? "unknown";
    const amountRupees = Number(p.amount ?? 0) / 100;
    const method       = (p.method  as string) ?? "unknown";

    logger.info(
      { paymentId, status, amountRupees, method, orderId: p.order_id },
      "[verify-payment] Razorpay payment status fetched",
    );

    // Payment explicitly failed at bank / UPI / card processor
    if (status === "failed") {
      const reason = (p.error_description as string)
                  || (p.error_reason      as string)
                  || "Payment was declined";
      const code   = (p.error_code as string) || "PAYMENT_FAILED";
      logger.warn({ paymentId, status, reason, code }, "[verify-payment] payment is FAILED");
      return { ok: false, status, error: `Payment failed: ${reason}` };
    }

    // Valid completed payment states
    if (status === "authorized" || status === "captured") {
      return { ok: true, status, amountRupees, method };
    }

    // Any other state (created, refunded, etc.) — do not honour
    logger.warn({ paymentId, status }, "[verify-payment] unexpected payment status — rejecting");
    return { ok: false, status, error: `Payment not completed (status: ${status})` };

  } catch (err: any) {
    logger.error({ paymentId, err: err?.message }, "[verify-payment] exception during live status check");
    // Fail safe — do not allow bookings on unverifiable payments
    return { ok: false, error: `Payment status check failed: ${err?.message ?? "network error"}` };
  }
}

// ── POST /api/verify-payment ──────────────────────────────────────────────────
router.post("/verify-payment", async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body ?? {};

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({
      success: false,
      error:   "razorpay_payment_id, razorpay_order_id, and razorpay_signature are required",
    });
  }

  try {
    // Stage 1: HMAC signature check
    const hmacResult = await verifyRazorpaySignature(
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    );
    if (!hmacResult.success) {
      return res
        .status(hmacResult.error === "Payment gateway not configured" ? 503 : 400)
        .json({ success: false, error: hmacResult.error });
    }

    // Stage 2: Live payment status check
    const cfg         = await getProviderConfig();
    const statusCheck = await checkRazorpayPaymentLive(
      razorpay_payment_id,
      cfg.paymentKeyId,
      cfg.paymentKeySecret,
    );
    if (!statusCheck.ok) {
      logger.warn(
        { razorpay_payment_id, status: statusCheck.status, error: statusCheck.error },
        "[verify-payment] live status check REJECTED booking",
      );
      return res.status(400).json({ success: false, error: statusCheck.error });
    }

    logger.info(
      { razorpay_payment_id, status: statusCheck.status, amountRupees: statusCheck.amountRupees },
      "[verify-payment] payment fully verified ✓",
    );
    return res.json({
      success:       true,
      paymentId:     razorpay_payment_id,
      paymentStatus: statusCheck.status,
      message:       "Payment verified",
    });

  } catch (err: any) {
    logger.error({ err: err?.message }, "[verify-payment] unexpected error");
    res.status(500).json({ success: false, error: err?.message || "Verification failed" });
  }
});

export default router;
