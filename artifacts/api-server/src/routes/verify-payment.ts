/**
 * POST /api/verify-payment
 *
 * Verifies a Razorpay payment signature using HMAC-SHA256.
 * Must be called after Razorpay's handler fires with the payment response.
 *
 * Body:
 *   { razorpay_payment_id, razorpay_order_id, razorpay_signature, bookingContext? }
 *
 * Returns:
 *   { success: true, paymentId }  — signature valid
 *   { success: false, error }     — invalid or gateway not configured
 */

import { Router } from "express";
import crypto     from "crypto";
import { getProviderConfig } from "../lib/provider-config.js";
import { logger }            from "../lib/logger.js";

const router = Router();

/**
 * Shared verification logic — also used by /api/payments/verify.
 * Returns { success, paymentId, error? }.
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
      "[verify-payment] signature mismatch",
    );
    return { success: false, error: "Payment verification failed. Invalid signature." };
  }

  logger.info({ razorpay_payment_id, razorpay_order_id }, "[verify-payment] signature verified ✓");
  return { success: true };
}

router.post("/verify-payment", async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body ?? {};

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: "razorpay_payment_id, razorpay_order_id, and razorpay_signature are required" });
  }

  try {
    const result = await verifyRazorpaySignature(
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    );

    if (!result.success) {
      return res.status(result.error === "Payment gateway not configured" ? 503 : 400)
        .json({ success: false, error: result.error });
    }

    return res.json({ success: true, paymentId: razorpay_payment_id, message: "Payment verified" });
  } catch (err: any) {
    logger.error({ err: err?.message }, "[verify-payment] unexpected error");
    res.status(500).json({ success: false, error: err?.message || "Verification failed" });
  }
});

export default router;
