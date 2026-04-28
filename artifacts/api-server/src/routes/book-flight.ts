import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, bookingsTable, bookingRefundsTable } from "@workspace/db";
import { extractTripJackError } from "../lib/tripjack-auth.js";
import { tjPostWithRetry } from "../lib/tj-retry.js";
import { logger } from "../lib/logger.js";
import { verifyRazorpaySignature } from "./verify-payment.js";

const router = Router();

// ── Razorpay refund (server-side, no admin auth required) ─────────────────
async function doRazorpayRefund(
  paymentId: string,
  amountINR: number,
  bookingId: number,
  bookingRef: string,
): Promise<{ initiated: boolean; refundId?: string; error?: string }> {
  const keyId     = process.env["RAZORPAY_KEY_ID"]     ?? "";
  const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";

  logger.info({ paymentId, amountINR, bookingId }, "[book-flight] initiating Razorpay refund");

  // Track the refund attempt in the DB
  const [refundRow] = await db
    .insert(bookingRefundsTable)
    .values({
      bookingId,
      paymentId,
      amount:      amountINR.toFixed(2),
      currency:    "INR",
      status:      "processing",
      initiatedBy: "system_auto",
    })
    .returning();

  const isDemo =
    !keyId ||
    !keySecret ||
    paymentId.startsWith("demo_") ||
    paymentId.startsWith("wallet_") ||
    paymentId.startsWith("cred_");

  let finalStatus: "completed" | "failed" = "completed";
  let providerRefundId: string | null = null;
  let errorMessage: string | null = null;

  if (isDemo) {
    providerRefundId = `rfnd_demo_${Date.now()}`;
    logger.info({ paymentId, amountINR }, "[book-flight] demo refund (no live creds)");
  } else {
    try {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const resp = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`,
        {
          method:  "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Math.round(amountINR * 100), // paise
            speed:  "normal",
            notes:  { booking_id: String(bookingId), booking_ref: bookingRef, initiated_by: "system_auto" },
          }),
        },
      );
      const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
      if (!resp.ok) {
        const errObj = (json?.error as Record<string, unknown> | undefined) ?? {};
        errorMessage =
          (errObj?.description as string) ||
          (errObj?.reason     as string) ||
          `Razorpay error ${resp.status}`;
        finalStatus = "failed";
        logger.error({ status: resp.status, json }, "[book-flight] razorpay refund failed");
      } else {
        providerRefundId = (json?.id as string) ?? null;
        finalStatus = (json?.status as string) === "failed" ? "failed" : "completed";
        logger.info({ paymentId, refundId: providerRefundId }, "[book-flight] Razorpay refund response");
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Refund request failed";
      finalStatus  = "failed";
      logger.error({ err }, "[book-flight] razorpay refund threw");
    }
  }

  // Persist final refund status
  await db
    .update(bookingRefundsTable)
    .set({ status: finalStatus, refundId: providerRefundId, errorMessage, updatedAt: new Date() })
    .where(eq(bookingRefundsTable.id, refundRow.id));

  return {
    initiated: finalStatus === "completed",
    refundId:  providerRefundId ?? undefined,
    error:     errorMessage    ?? undefined,
  };
}

// ── POST /api/refund ─────────────────────────────────────────────────────────
// Public endpoint (no admin auth required) to refund a Razorpay payment.
// Used by the frontend when the booking API call fails entirely (network error)
// and the backend auto-refund inside /api/book-flight did not run.
//
// Body: { paymentId: string, amount?: number }
// Returns: { success: true, refundId? } | { success: false, error }
router.post("/refund", async (req, res): Promise<void> => {
  const { paymentId, amount } = req.body ?? {};

  if (!paymentId || typeof paymentId !== "string") {
    res.status(400).json({ success: false, error: "paymentId is required" });
    return;
  }

  logger.info({ paymentId, amount }, "[refund] standalone refund requested");

  const keyId     = process.env["RAZORPAY_KEY_ID"]     ?? "";
  const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";

  const isDemo =
    !keyId ||
    !keySecret ||
    paymentId.startsWith("pay_DEMO") ||
    paymentId.startsWith("demo_") ||
    paymentId.startsWith("wallet_") ||
    paymentId.startsWith("cred_");

  if (isDemo) {
    const refundId = `rfnd_demo_${Date.now()}`;
    logger.info({ paymentId, refundId }, "[refund] demo refund — no live credentials");
    res.json({ success: true, refundId, demo: true });
    return;
  }

  try {
    const auth    = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const payload: Record<string, unknown> = { speed: "normal" };
    if (amount && Number(amount) > 0) {
      payload.amount = Math.round(Number(amount) * 100); // paise
    }

    const resp = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`,
      {
        method:  "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      },
    );
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;

    if (!resp.ok) {
      const errObj  = (json?.error as Record<string, unknown> | undefined) ?? {};
      const errMsg  = (errObj?.description as string) || (errObj?.reason as string) || `Razorpay ${resp.status}`;
      logger.error({ paymentId, status: resp.status }, "[refund] Razorpay refund failed");
      res.status(502).json({ success: false, error: errMsg });
      return;
    }

    const refundId = json?.id as string | undefined;
    logger.info({ paymentId, refundId }, "[refund] Razorpay refund initiated");
    res.json({ success: true, refundId });
  } catch (err: any) {
    logger.error({ paymentId, err: err?.message }, "[refund] network error calling Razorpay");
    res.status(500).json({ success: false, error: err?.message ?? "Refund request failed" });
  }
});

// ── POST /api/book-flight ──────────────────────────────────────────────────
// Body: {
//   paymentId:   string                          — Razorpay payment ID
//   orderId:     string                          — Razorpay order ID (for server-side signature verification)
//   signature:   string                          — Razorpay signature (HMAC-SHA256)
//   amount:      number                          — total charged (INR)
//   fareData: {
//     bookingId:   string                        — TripJack booking ID from fareQuote step
//     traceId?:    string
//     resultIndex?: string
//   }
//   passengers: [{ name, email, phone, gender?, seatCode?, baggageCode? }]
//   bookingMeta: {
//     bookingRef:    string
//     passengerName:  string
//     passengerEmail: string
//     passengerPhone: string
//     travelDate:     string
//     totalPrice:     number
//     details:        object    — full details blob already built by frontend
//   }
// }
router.post("/book-flight", async (req, res): Promise<void> => {
  const { paymentId, orderId, signature, amount, fareData, passengers, bookingMeta } = req.body ?? {};

  // ── Validate required fields ─────────────────────────────────────────────
  if (!paymentId || typeof paymentId !== "string") {
    res.status(400).json({ success: false, error: "paymentId is required" });
    return;
  }
  if (!Array.isArray(passengers) || passengers.length === 0) {
    res.status(400).json({ success: false, error: "passengers array is required" });
    return;
  }

  // ── STEP 0: Verify Razorpay payment signature ────────────────────────────
  // orderId + signature must be present for all Razorpay payments.
  // This prevents booking without a verified payment.
  logger.info({ paymentId, orderId: orderId ?? "(missing)" }, "[book-flight] STEP 0: verifying payment signature");
  if (!orderId || !signature) {
    logger.warn({ paymentId }, "[book-flight] missing orderId or signature — rejecting");
    res.status(400).json({ success: false, error: "Payment details incomplete. Please retry payment." });
    return;
  }

  const verifyResult = await verifyRazorpaySignature(paymentId, orderId, signature);
  if (!verifyResult.success) {
    logger.warn({ paymentId, orderId, error: verifyResult.error }, "[book-flight] payment verification failed");
    res.status(400).json({ success: false, error: verifyResult.error ?? "Payment verification failed" });
    return;
  }
  logger.info({ paymentId, orderId }, "[book-flight] payment verified ✓ — proceeding to booking");

  // fareData.bookingId is optional — empty means a non-TripJack fare (synthetic / Booking.com).
  // In that case we skip the TripJack AirBook call and save the booking as confirmed
  // (Razorpay payment was already verified by the frontend).
  const isTjBooking = !!(fareData?.bookingId);
  logger.info(
    { paymentId, bookingId: fareData?.bookingId || "(non-TJ)", isTjBooking },
    "[book-flight] fareData received",
  );

  const totalPrice     = Number(amount) || Number(fareData?.fare) || Number(bookingMeta?.totalPrice) || 0;
  const bookingRef     = String(bookingMeta?.bookingRef     ?? `BK-${Date.now().toString(36).toUpperCase()}`);
  const travelDate     = String(bookingMeta?.travelDate     ?? new Date().toISOString().split("T")[0]);
  const passengerName  = String(bookingMeta?.passengerName  ?? passengers[0]?.name  ?? "Unknown");
  const passengerEmail = String(bookingMeta?.passengerEmail ?? passengers[0]?.email ?? "");
  const passengerPhone = String(bookingMeta?.passengerPhone ?? passengers[0]?.phone ?? "");

  // ── STEP 1: Idempotency — prevent duplicate processing ───────────────────
  logger.info({ paymentId, bookingRef }, "[book-flight] STEP 1: duplicate check");
  const existing = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.paymentId, paymentId))
    .limit(1);

  if (existing.length > 0) {
    const b = existing[0];
    logger.info({ paymentId, bookingId: b.id, status: b.status }, "[book-flight] duplicate paymentId — returning existing");
    res.json({
      success:    b.status === "confirmed",
      duplicate:  true,
      bookingRef: b.bookingRef,
      pnr:        (b.details as any)?.pnr ?? undefined,
    });
    return;
  }

  // ── STEP 2 + 3: Call TripJack AirBook (skipped for non-TJ fares) ──────────
  // Non-TJ fare (synthetic / Booking.com): payment verified by Razorpay → confirm directly.
  if (!isTjBooking) {
    logger.info({ paymentId, bookingRef }, "[book-flight] non-TJ fare — skipping TripJack, saving as confirmed");
    const [savedBooking] = await db
      .insert(bookingsTable)
      .values({
        bookingRef,
        bookingType:    "flight",
        passengerName,
        passengerEmail,
        passengerPhone,
        travelDate,
        totalPrice:    String(totalPrice),
        passengers:    passengers.length,
        status:        "confirmed",
        paymentStatus: "paid",
        paymentId,
        details:       {
          ...(typeof bookingMeta?.details === "object" && bookingMeta?.details !== null
            ? (bookingMeta.details as Record<string, unknown>)
            : {}),
          paymentId,
          bookingRef,
          nonTjFare: true,
        },
      })
      .returning();
    logger.info({ paymentId, bookingRef, bookingId: savedBooking.id }, "[book-flight] non-TJ booking CONFIRMED");
    res.json({ success: true, bookingRef, bookingId: savedBooking.id });
    return;
  }

  const tjPayload = {
    bookingId: fareData.bookingId,
    ...(fareData.traceId     && { traceId:     fareData.traceId }),
    ...(fareData.resultIndex && { resultIndex: fareData.resultIndex }),
    paymentInfos: [{
      paymentMode: "ONLINE_PAYMENT",
      amount:      totalPrice,
      currency:    "INR",
    }],
    travellerInfo: (passengers as any[]).map((p) => ({
      fn:  (p.name ?? "").split(" ")[0]                 || p.name || "Guest",
      ln:  (p.name ?? "").split(" ").slice(1).join(" ") || ".",
      ti:  "MR",
      dob: "",
      pNum: p.phone  ?? "",
      eml:  p.email  ?? "",
      pt:   "ADULT",
      ssrSeatInfos:    p.seatCode    ? [{ key: p.seatCode,    code: p.seatCode    }] : [],
      ssrBaggageInfos: p.baggageCode ? [{ key: p.baggageCode, code: p.baggageCode }] : [],
    })),
    deliveryInfo: {
      emails:  [passengers[0]?.email ?? passengerEmail],
      mobiles: [{ countryCode: "91", number: passengers[0]?.phone ?? passengerPhone }],
    },
  };

  logger.info(
    {
      paymentId,
      tjBookingId:  fareData.bookingId,
      traceId:      fareData.traceId     ?? null,
      resultIndex:  fareData.resultIndex ?? null,
      finalPrice:   totalPrice,
      passengerCount: passengers.length,
      seats:        passengers.map((p: any) => p.seatCode).filter(Boolean),
      baggage:      passengers.map((p: any) => p.baggageCode).filter(Boolean),
    },
    "[book-flight] STEP 2+3: calling TripJack /fms/v1/air/book (with retry)",
  );

  let tjSuccess        = false;
  let tjSandboxPending = false;   // true when TripJack returned 405 (test sandbox)
  let pnr: string | undefined;
  let tjBookingRef: string | undefined;
  let tjError: string | undefined;

  try {
    const data = await tjPostWithRetry("/fms/v1/air/book", tjPayload, {
      context:    "book-flight/airbook",
      timeoutMs:  30_000,
      maxRetries: 2,
    });

    if (data?.status?.success === false || (data?.errors?.length ?? 0) > 0) {
      tjError = extractTripJackError(data, "TripJack booking failed");
      logger.warn({ paymentId, tjError }, "[book-flight] TripJack returned failure in body");
    } else {
      tjSuccess    = true;
      pnr          = data?.data?.pnr      || undefined;
      tjBookingRef = data?.data?.bookingId || undefined;
      logger.info({ paymentId, pnr, tjBookingRef }, "[book-flight] TripJack AirBook SUCCESS");
    }
  } catch (err: any) {
    const httpStatus = (err?.status ?? err?.response?.status ?? 0) as number;
    const errBody    = err?.response?.data;

    if (httpStatus === 405) {
      // 405 = Method Not Allowed — the test sandbox does not support /fms/v1/air/book.
      // Payment is already Razorpay-verified; confirm booking without PNR and skip the refund.
      tjSuccess        = true;
      tjSandboxPending = true;
      logger.warn(
        { paymentId },
        "[book-flight] TripJack returned 405 (sandbox — AirBook unavailable) — confirming without PNR",
      );
    } else {
      tjError = err.isTransient
        ? "Temporary airline issue. Please try again."
        : (errBody ? extractTripJackError(errBody, err.message) : err.message);
      logger.error({ paymentId, error: tjError }, "[book-flight] TripJack AirBook failed after retries");
    }
  }

  // ── STEP 4: Persist booking ──────────────────────────────────────────────
  const bookingDetails: Record<string, unknown> = {
    ...(typeof bookingMeta?.details === "object" && bookingMeta?.details !== null
      ? (bookingMeta.details as Record<string, unknown>)
      : {}),
    pnr:          pnr          ?? null,
    tjBookingRef: tjBookingRef ?? null,
    paymentId,
    bookingRef,
    ...(tjSandboxPending ? { tjNote: "AirBook pending — test sandbox (405)" } : {}),
    ...(tjSuccess ? {} : { tjBookingFailed: tjError ?? "unknown" }),
  };

  const [savedBooking] = await db
    .insert(bookingsTable)
    .values({
      bookingRef,
      bookingType:    "flight",
      passengerName,
      passengerEmail,
      passengerPhone,
      travelDate,
      totalPrice:    String(totalPrice),
      passengers:    passengers.length,
      status:        tjSuccess ? "confirmed" : "cancelled",
      paymentStatus: "paid",
      paymentId,
      details:       bookingDetails,
    })
    .returning();

  if (tjSuccess) {
    logger.info(
      { paymentId, pnr, bookingRef, bookingId: savedBooking.id },
      "[book-flight] STEP 4: booking CONFIRMED",
    );
    res.json({ success: true, pnr, tjBookingRef, bookingRef, bookingId: savedBooking.id });
    return;
  }

  // ── STEP 4b: TripJack failed → auto-refund ───────────────────────────────
  logger.info({ paymentId, tjError }, "[book-flight] STEP 4b: TJ failed — initiating auto-refund");

  let refundResult: { initiated: boolean; refundId?: string; error?: string } = {
    initiated: false,
  };
  try {
    refundResult = await doRazorpayRefund(paymentId, totalPrice, savedBooking.id, bookingRef);
    if (refundResult.initiated) {
      await db
        .update(bookingsTable)
        .set({ status: "refunded" })
        .where(eq(bookingsTable.id, savedBooking.id));
      logger.info({ paymentId, refundId: refundResult.refundId }, "[book-flight] refund completed");
    } else {
      logger.warn({ paymentId, error: refundResult.error }, "[book-flight] refund failed");
    }
  } catch (refundErr: any) {
    logger.error({ paymentId, err: refundErr }, "[book-flight] refund threw");
  }

  res.json({
    success:         false,
    error:           tjError ?? "TripJack booking failed",
    refundInitiated: refundResult.initiated,
    refundId:        refundResult.refundId,
    bookingRef,
  });
});

export default router;
