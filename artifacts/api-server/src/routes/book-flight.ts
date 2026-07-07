import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, bookingsTable, bookingRefundsTable } from "@workspace/db";
import { extractTripJackError } from "../lib/tripjack-auth.js";
import { tjPostWithRetry } from "../lib/tj-retry.js";
import { fetchTjBookingDetail } from "../lib/tj-booking-helper.js";
import { scheduleBookingBurstPoll } from "../lib/tj-booking-poller.js";
import { logger } from "../lib/logger.js";
import { verifyRazorpaySignature, checkRazorpayPaymentLive } from "./verify-payment.js";
import { getProviderConfig } from "../lib/provider-config.js";
import { sendAllBookingNotifications, sendBookingFailureNotifications, sendRefundNotifications, type BookingNotificationData } from "../lib/notification-service.js";

const router = Router();

// ── Passenger age (derived from Date of Birth) ─────────────────────────────
// The passenger form only collects Date of Birth (no separate Age field), so
// TripJack's required passenger-type (ADULT/CHILD/INFANT) is derived here.
// Falls back to a legacy `age` field for any older/unrelated flows that may
// still send it directly.
function computePassengerAge(p: { dob?: string; age?: string }): number {
  if (p.dob) {
    const dobDate = new Date(p.dob);
    if (!isNaN(dobDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const monthDiff = today.getMonth() - dobDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
        age--;
      }
      if (age >= 0) return age;
    }
  }
  return parseInt(p.age ?? "", 10);
}

function sanitizeMobile(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = raw.replace(/[\s\-().+]/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  return digits.slice(-10);
}

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
    logger.warn({ paymentId, orderId, error: verifyResult.error }, "[book-flight] HMAC signature verification failed");
    res.status(400).json({ success: false, error: verifyResult.error ?? "Payment verification failed" });
    return;
  }
  logger.info({ paymentId, orderId }, "[book-flight] HMAC signature verified ✓");

  // ── STEP 0b: Live payment status check via Razorpay API ──────────────────
  // Even if HMAC is valid, confirm the payment is actually authorized/captured.
  // This blocks bookings when failure@razorpay or any other failed payment is used.
  const provCfg = await getProviderConfig();
  const liveCheck = await checkRazorpayPaymentLive(paymentId, provCfg.paymentKeyId, provCfg.paymentKeySecret);
  if (!liveCheck.ok) {
    logger.warn(
      { paymentId, status: liveCheck.status, error: liveCheck.error },
      "[book-flight] live payment status check REJECTED",
    );
    res.status(400).json({
      success: false,
      error:   liveCheck.error ?? "Payment not completed. Please try again.",
    });
    return;
  }
  logger.info(
    { paymentId, status: liveCheck.status, amountRupees: liveCheck.amountRupees },
    "[book-flight] live payment status verified ✓ — proceeding to booking",
  );

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

  // Fare breakdown — extract from bookingMeta or from the details blob
  const _meta = bookingMeta ?? {};
  const _d    = (typeof _meta.details === "object" && _meta.details !== null) ? (_meta.details as Record<string, any>) : {};
  const _rawBaseFare  = Number(_meta.baseFare    ?? _d.rawBaseAmount ?? _d.base_price  ?? 0);
  const _rawMarkup    = Number(_meta.markupAmount ?? _d.markupAmount  ?? _d.markup      ?? 0);
  const _rawConvFee   = Number(_meta.convenienceFee ?? _d.convenienceFee ?? _d.convenience_fee ?? 0);
  const _baseFareVal   = _rawBaseFare > 0 ? String(_rawBaseFare) : null;
  const _markupVal     = _rawMarkup   > 0 ? String(_rawMarkup)   : null;
  const _convFeeVal    = _rawConvFee  > 0 ? String(_rawConvFee)  : null;

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
        bookingStatus: "confirmed",
        baseFare:       _baseFareVal,
        markupAmount:   _markupVal,
        convenienceFee: _convFeeVal,
        details:       {
          ...(typeof bookingMeta?.details === "object" && bookingMeta?.details !== null
            ? (bookingMeta.details as Record<string, unknown>)
            : {}),
          paymentId,
          bookingRef,
          nonTjFare: true,
        },
      } as any)
      .returning();
    logger.info({ paymentId, bookingRef, bookingId: savedBooking.id }, "[book-flight] non-TJ booking CONFIRMED");
    res.json({ success: true, bookingRef, bookingId: savedBooking.id });

    // Fire-and-forget notifications — do not await, never block the response
    const _domain = process.env.REPLIT_DOMAINS?.split(",")[0] || process.env.REPLIT_DEV_DOMAIN || "";
    const _base   = _domain ? `https://${_domain}` : "https://dreamflyglobal.in";
    const _notif: BookingNotificationData = {
      bookingId:      bookingRef,
      bookingType:    "flight",
      passengerName:  passengerName,
      passengerEmail: passengerEmail || undefined,
      passengerPhone: passengerPhone || undefined,
      travelDate:     travelDate,
      totalAmount:    totalPrice,
      paymentId:      paymentId,
      passengers:     passengers.length,
      invoiceUrl:     `${_base}/invoice/${bookingRef}`,
      title:          `Flight ${bookingRef}`,
    };
    sendAllBookingNotifications(_notif).catch((e) =>
      logger.error({ err: e?.message }, "[book-flight] non-TJ notification error"),
    );
    return;
  }

  // ── STEP 2: Refresh TripJack fareQuote to get a non-expired bookingId ───────
  // TripJack booking sessions (TJS-prefixed IDs from /fms/v1/review) expire
  // within ~2-3 min. By the time the user completes Razorpay checkout, the
  // original session is likely expired. We call /fms/v1/review again immediately
  // after payment verification — using the raw resultIndex as priceId — to get a
  // fresh TJS session, then call /oms/v1/air/book with no delay.
  //
  // TripJack's /fms/v1/review response has bookingId at the TOP LEVEL:
  //   { bookingId: "TJS...", status: {...} }  — NOT nested under "data".
  // The frontend (fixed) now correctly stores this TJS session ID in
  // ww_tj_booking_id. The raw resultIndex is kept in ww_tj_farequote_key and
  // forwarded here as fareData.resultIndex.
  //
  // priceIdForRefresh: prefer the existing TJS session when available.
  //   If fareData.bookingId is a TJS session (prefix "TJS"), use it — calling
  //   /fms/v1/review with the existing session ID simply refreshes the TTL
  //   on the SAME session, so TripJack books synchronously → CONFIRMED.
  //   Using the raw resultIndex creates a BRAND-NEW session which TripJack
  //   may process asynchronously → PENDING status on AirBook.
  //   Fall back to raw resultIndex only when no TJS session is available.
  const storedIdIsTjSession = fareData.bookingId.startsWith("TJS");
  const priceIdForRefresh: string = storedIdIsTjSession
    ? fareData.bookingId                              // refresh existing TJS session TTL
    : (fareData.resultIndex || fareData.bookingId);   // no TJS session — use resultIndex
  let freshBookingId: string = fareData.bookingId;
  logger.info(
    {
      paymentId,
      storedBookingId:    fareData.bookingId,
      storedResultIndex:  fareData.resultIndex || "(none)",
      priceIdForRefresh,
      storedIdIsTjSession,
    },
    "[book-flight] STEP 2: session diagnostic — bookingId format check",
  );

  if (priceIdForRefresh) {
    try {
      logger.info(
        { paymentId, priceId: priceIdForRefresh },
        "[book-flight] STEP 2: refreshing fareQuote session before AirBook",
      );
      console.log(`\n${"#".repeat(80)}`);
      console.log(`[book-flight] STEP 2 REVIEW REQUEST — paymentId: ${paymentId}`);
      console.log(`${"#".repeat(80)}`);
      console.log("[book-flight] REVIEW REQUEST BODY:\n" + JSON.stringify({ priceIds: [priceIdForRefresh] }, null, 2));
      console.log(`${"#".repeat(80)}\n`);
      const reviewData = await tjPostWithRetry(
        "/fms/v1/review",
        { priceIds: [priceIdForRefresh] },
        { context: "book-flight/fareQuote-refresh", timeoutMs: 15_000, maxRetries: 1 },
      );
      console.log(`\n${"#".repeat(80)}`);
      console.log(`[book-flight] STEP 2 REVIEW RESPONSE — paymentId: ${paymentId}`);
      console.log(`${"#".repeat(80)}`);
      console.log("[book-flight] FULL REVIEW RESPONSE BODY:\n" + JSON.stringify(reviewData, null, 2));
      console.log(`${"#".repeat(80)}\n`);

      // TripJack review response: bookingId may be at top level or inside data.
      // In many sandbox responses it equals the priceId — what matters is that
      // calling review again resets the session TTL on the server side.
      const refreshedId: string | undefined =
        (typeof reviewData?.bookingId      === "string" && reviewData.bookingId.trim())
          ? reviewData.bookingId.trim()
          : (typeof reviewData?.data?.bookingId === "string" && reviewData.data.bookingId.trim())
            ? reviewData.data.bookingId.trim()
            : undefined;

      freshBookingId = refreshedId ?? fareData.bookingId;
      logger.info(
        {
          paymentId,
          priceIdUsed:    priceIdForRefresh,
          freshBookingId,
          source:         refreshedId ? "review-response" : "stored-bookingId-fallback",
          reviewTopKeys:  reviewData ? Object.keys(reviewData) : [],
          reviewBookingId: reviewData?.bookingId ?? reviewData?.data?.bookingId ?? null,
          reviewStatus:   reviewData?.status ?? null,
          reviewFullBody: reviewData,
        },
        "[book-flight] STEP 2: booking session refreshed — full review response",
      );
    } catch (err: any) {
      logger.warn(
        { paymentId, err: err?.message, priceId: priceIdForRefresh },
        "[book-flight] STEP 2: fareQuote refresh failed — proceeding with stored bookingId",
      );
      // Do NOT abort — payment is already verified. Fall back to stored ID.
    }
  } else {
    logger.warn({ paymentId }, "[book-flight] STEP 2: no priceId for refresh — using stored bookingId");
  }

  const tjPayload = {
    bookingId: freshBookingId,
    ...(fareData.traceId && { traceId: fareData.traceId }),
    paymentInfos: [{
      paymentMode: "ONLINE_PAYMENT",
      amount:      totalPrice,
      currency:    "INR",
    }],
    travellerInfo: (passengers as any[]).map((p) => {
      const age    = computePassengerAge(p);
      const gender = (p.gender ?? "").toLowerCase();
      const title  = gender === "female" ? "MS" : "MR";
      const pt     = !isNaN(age) && age < 12 ? (age < 2 ? "INFANT" : "CHILD") : "ADULT";
      const traveller: Record<string, unknown> = {
        fn:  (p.name ?? "").split(" ")[0]                 || p.name || "Guest",
        ln:  (p.name ?? "").split(" ").slice(1).join(" ") || ".",
        ti:  title,
        pt,
      };
      // Only include dob when it's a non-empty valid string — TripJack rejects empty strings
      if (p.dob && typeof p.dob === "string" && p.dob.trim()) {
        traveller.dob = p.dob.trim();
      }
      // Only include phone/email when non-empty
      if (p.phone && String(p.phone).trim()) traveller.pNum = String(p.phone).trim();
      if (p.email && String(p.email).trim()) traveller.eml  = String(p.email).trim();
      // Only include SSR arrays when non-empty — TripJack rejects empty arrays for optional fields
      if (p.seatCode)    traveller.ssrSeatInfos    = [{ key: p.seatCode,    code: p.seatCode    }];
      if (p.baggageCode) traveller.ssrBaggageInfos = [{ key: p.baggageCode, code: p.baggageCode }];
      if (p.mealCode)    traveller.ssrMealInfos    = [{ key: p.mealCode,    code: p.mealCode    }];
      return traveller;
    }),
    deliveryInfo: {
      emails:   [passengers[0]?.email ?? passengerEmail].filter(Boolean),
      contacts: [sanitizeMobile(passengers[0]?.phone ?? passengerPhone)].filter(Boolean),
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
    "[book-flight] STEP 2+3: calling TripJack /oms/v1/air/book (with retry)",
  );
  logger.info(
    {
      paymentId,
      bookingRef,
      airBookRequestBody: tjPayload,
    },
    "[book-flight] AIRBOOK REQUEST full payload",
  );
  console.log(`\n${"#".repeat(80)}`);
  console.log(`[book-flight] AIRBOOK REQUEST — bookingRef: ${bookingRef} | paymentId: ${paymentId}`);
  console.log(`${"#".repeat(80)}`);
  console.log("[book-flight] FULL AIRBOOK REQUEST BODY:\n" + JSON.stringify(tjPayload, null, 2));
  console.log(`${"#".repeat(80)}\n`);

  let tjSuccess    = false;
  let tjPending    = false;
  let pnr: string | undefined;
  let tjBookingRef: string | undefined;
  let tjError: string | undefined;

  try {
    const data = await tjPostWithRetry("/oms/v1/air/book", tjPayload, {
      context:    "book-flight/airbook",
      timeoutMs:  30_000,
      maxRetries: 2,
    });

    // tjPostWithRetry returns resp.data directly, so `data` IS the TripJack body.
    //
    // AirBook response shape (TripJack OMS):
    //   { bookingId, status: { success, httpStatus, booking? }, pnrDetails?, pnr? }
    //
    // status.booking can be "CONFIRMED", "PENDING", "PROCESSING", or absent.
    // When absent but pnrDetails is non-empty, TripJack confirmed synchronously
    // without setting status.booking — treat as CONFIRMED.
    const tjBookingStatus = (
      data?.status?.booking ??
      data?.data?.status?.booking ??
      ""
    ).toUpperCase();

    // PNR details present = synchronous confirmation even when status.booking is absent
    const hasPnrDetails =
      (Array.isArray(data?.pnrDetails)      && (data.pnrDetails as any[]).length      > 0) ||
      (Array.isArray(data?.data?.pnrDetails) && (data.data.pnrDetails as any[]).length > 0);

    const extractedPnr: string | undefined =
      data?.pnr || data?.pnrDetails?.[0]?.pnr || data?.data?.pnr || data?.data?.pnrDetails?.[0]?.pnr || undefined;
    const extractedBookingRef: string | undefined =
      data?.bookingId || data?.data?.bookingId || undefined;

    // Log the full AirBook response via structured logger for diagnostics
    logger.info(
      {
        paymentId,
        bookingRef,
        tjBookingStatus:  tjBookingStatus || "(absent)",
        hasPnrDetails,
        extractedPnr:     extractedPnr     ?? null,
        extractedTjRef:   extractedBookingRef ?? null,
        responseKeys:     data ? Object.keys(data) : [],
        statusSuccess:    data?.status?.success ?? null,
      },
      "[book-flight] AIRBOOK RESPONSE received",
    );
    logger.info(
      {
        paymentId,
        bookingRef,
        airBookFullResponse: data,
      },
      "[book-flight] AIRBOOK full response body",
    );

    if (data?.status?.success === false || (data?.errors?.length ?? 0) > 0) {
      tjError = extractTripJackError(data, "TripJack booking failed");
      logger.warn({ paymentId, tjError }, "[book-flight] TripJack returned failure in body");

    } else if (
      tjBookingStatus === "CONFIRMED" ||
      (hasPnrDetails && tjBookingStatus !== "FAILED" && tjBookingStatus !== "CANCELLED")
    ) {
      // CONFIRMED: either explicit status.booking === "CONFIRMED", or pnrDetails
      // is present (synchronous confirmation without status.booking — common in sandbox).
      tjSuccess    = true;
      pnr          = extractedPnr;
      tjBookingRef = extractedBookingRef;
      logger.info(
        { paymentId, pnr, tjBookingRef, tjBookingStatus, hasPnrDetails },
        "[book-flight] TripJack AirBook CONFIRMED — booking confirmed synchronously",
      );

    } else if (tjBookingStatus === "PENDING" || tjBookingStatus === "PROCESSING") {
      // Explicitly async — TripJack is still processing; poll until confirmed.
      tjPending    = true;
      pnr          = extractedPnr;
      tjBookingRef = extractedBookingRef;
      logger.info(
        { paymentId, pnr, tjBookingRef, tjBookingStatus },
        "[book-flight] TripJack AirBook PENDING — will poll /oms/v1/booking/detail for confirmation",
      );

    } else if (data?.status?.success === true && extractedBookingRef) {
      // status.booking absent and no pnrDetails — booking queued, awaiting async confirmation.
      // The background poller calls POST /oms/v1/booking/detail every 60 s until confirmed.
      tjPending    = true;
      pnr          = extractedPnr;
      tjBookingRef = extractedBookingRef;
      logger.info(
        { paymentId, pnr, tjBookingRef, tjBookingStatus: "(absent)" },
        "[book-flight] TripJack AirBook success + bookingId, no status/pnrDetails — queued, polling /oms/v1/booking/detail",
      );

    } else {
      // Unknown / unexpected state — treat as pending rather than failing
      tjPending    = true;
      pnr          = extractedPnr;
      tjBookingRef = extractedBookingRef;
      logger.warn(
        { paymentId, pnr, tjBookingRef, tjBookingStatus, data },
        "[book-flight] TripJack AirBook unexpected state — treating as pending",
      );
    }
  } catch (err: any) {
    const errBody = err?.response?.data;
    tjError = err.isTransient
      ? "Temporary airline issue. Please try again."
      : (errBody ? extractTripJackError(errBody, err.message) : err.message);
    logger.error({ paymentId, error: tjError }, "[book-flight] TripJack AirBook failed after retries");
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
    ...(!tjSuccess && !tjPending ? { tjBookingFailed: tjError ?? "unknown" } : {}),
  };

  const resolvedDbStatus  = tjSuccess ? "confirmed" : tjPending ? "pending" : "cancelled";
  const resolvedBookingSt = tjSuccess ? "confirmed" : tjPending ? "pending" : "failed";

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
      status:        resolvedDbStatus,
      paymentStatus: "paid",
      paymentId,
      bookingStatus: resolvedBookingSt,
      failureReason: (!tjSuccess && !tjPending) ? (tjError ?? "Ticket booking failed") : undefined,
      failureCode:   (!tjSuccess && !tjPending) ? "api_error" : undefined,
      baseFare:       _baseFareVal,
      markupAmount:   _markupVal,
      convenienceFee: _convFeeVal,
      details:       bookingDetails,
    } as any)
    .returning();

  if (tjSuccess || tjPending) {
    // ── STEP 4.5: Fetch booking detail to get enriched PNR/ticket/status ─────────
    // Uses fetchTjBookingDetail which tries 2 strategies in order:
    //   1. POST /oms/v1/booking/detail      — official OMS single-booking status endpoint
    //   2. POST /oms/v1/air/booking-details — air-specific path (hotel docs pattern)
    //
    // SANDBOX LIMITATION: Both return 404 because TripJack restricts the booking
    // management sub-tree to whitelisted IPs in sandbox.  The booking is stored as
    // PENDING and the background poller will retry every 60 seconds.
    // In production with correct IP whitelisting, strategy 1 succeeds immediately.
    // ACTION: Contact TripJack support to whitelist POST /oms/v1/booking/detail.
    let detailPnr      = pnr;
    let tjDetailStatus = tjSuccess ? "CONFIRMED" : "PENDING";
    let tjPassengers: Array<{ name: string; pnr: string; ticketNum: string; paxType: string }> = [];
    let ticketNumbers: string[] = [];
    let detailFetched  = false;

    if (tjBookingRef) {
      logger.info({ paymentId, tjBookingRef }, "[book-flight] STEP 4.5: fetching booking detail (multi-strategy)");

      // Single attempt — the helper already retries internally across strategies.
      // Adding an extra delay here to give TripJack a moment to propagate the booking.
      await new Promise((r) => setTimeout(r, 3_000));

      const detail = await fetchTjBookingDetail(tjBookingRef, "book-flight");

      if (detail.source !== "none") {
        detailPnr      = detail.pnr      || pnr;
        tjDetailStatus = detail.rawStatus || tjDetailStatus;
        tjPassengers   = detail.tjPassengers;
        ticketNumbers  = detail.ticketNumbers;
        detailFetched  = true;

        logger.info(
          { paymentId, tjBookingRef, detailPnr, tjDetailStatus, source: detail.source, paxCount: tjPassengers.length },
          "[book-flight] STEP 4.5: booking detail enriched",
        );
      } else {
        logger.warn(
          { paymentId, tjBookingRef },
          "[book-flight] STEP 4.5: all strategies failed — booking stored as pending, background poller will update when TripJack endpoint becomes accessible",
        );
      }
    }

    const finalPnr  = detailPnr || pnr;
    const finalBkSt = tjDetailStatus === "CONFIRMED" ? "confirmed"
                    : tjDetailStatus === "PENDING"   ? "pending"
                    : resolvedBookingSt;
    const finalDbSt = tjDetailStatus === "CONFIRMED" ? "confirmed"
                    : tjDetailStatus === "PENDING"   ? "pending"
                    : resolvedDbStatus;

    // Persist enriched booking detail back to DB
    const updatedRows = await db
      .update(bookingsTable)
      .set({
        bookingStatus: finalBkSt,
        status:        finalDbSt,
        details: {
          ...bookingDetails,
          pnr:           finalPnr    || null,
          tjBookingRef:  tjBookingRef || null,
          tjDetailStatus,
          ...(tjPassengers.length  > 0 ? { tjPassengers }  : {}),
          ...(ticketNumbers.length > 0 ? { ticketNumbers } : {}),
        },
      })
      .where(eq(bookingsTable.id, savedBooking.id))
      .returning();

    const updatedRecord = updatedRows[0];
    logger.info(
      {
        dreamFlyBookingRef: bookingRef,
        dreamFlyBookingId:  savedBooking.id,
        tripjackBookingId:  tjBookingRef,
        rowsUpdated:        updatedRows.length,
        finalBookingStatus: finalBkSt,
        finalDbStatus:      finalDbSt,
        pnr:                finalPnr || null,
        dbRecord: updatedRecord ? {
          id:            updatedRecord.id,
          bookingRef:    updatedRecord.bookingRef,
          bookingStatus: updatedRecord.bookingStatus,
          status:        updatedRecord.status,
          paymentId:     updatedRecord.paymentId,
          tjBookingRef:  (updatedRecord.details as any)?.tjBookingRef ?? null,
          pnr:           (updatedRecord.details as any)?.pnr ?? null,
        } : null,
      },
      `[book-flight] STEP 4 COMPLETE — booking updated in DB`,
    );

    // ── Burst poll for PENDING bookings ─────────────────────────────────────
    // In production (whitelisted endpoints) this catches TripJack's async
    // confirmation within seconds (5 s → 15 s → 30 s → 60 s).
    // In sandbox, the detail endpoint returns 404; the attempts are harmless
    // and the 60-second steady-state poller keeps retrying until whitelisted.
    if (finalBkSt === "pending" && tjBookingRef) {
      void scheduleBookingBurstPoll(bookingRef, tjBookingRef).catch((err: any) =>
        logger.warn({ bookingRef, err: err?.message }, "[book-flight] burst poll scheduling error"),
      );
    }

    res.json({
      success:      true,
      status:       finalBkSt,
      pnr:          finalPnr,
      tjBookingRef,
      bookingRef,
      bookingId:    savedBooking.id,
      ...(tjPassengers.length  > 0 ? { tjPassengers }  : {}),
      ...(ticketNumbers.length > 0 ? { ticketNumbers } : {}),
    });

    // Fire-and-forget notifications — do not await, never block the response
    const __domain = process.env.REPLIT_DOMAINS?.split(",")[0] || process.env.REPLIT_DEV_DOMAIN || "";
    const __base   = __domain ? `https://${__domain}` : "https://dreamflyglobal.in";
    const __details = typeof bookingMeta?.details === "object" && bookingMeta?.details !== null
      ? (bookingMeta.details as Record<string, any>)
      : {};
    const __notif: BookingNotificationData = {
      bookingId:       bookingRef,
      bookingType:     "flight",
      passengerName:   passengerName,
      passengerEmail:  passengerEmail || undefined,
      passengerPhone:  passengerPhone || undefined,
      travelDate:      travelDate,
      totalAmount:     totalPrice,
      paymentId:       paymentId,
      passengers:      passengers.length,
      invoiceUrl:      `${__base}/invoice/${bookingRef}`,
      title:           `Flight ${finalPnr ?? bookingRef}`,
      from:            __details.from ?? __details.flightFrom ?? undefined,
      to:              __details.to   ?? __details.flightTo   ?? undefined,
      airline:         __details.airline        ?? __details.flightAirline ?? undefined,
      flightNumber:    __details.flightNum      ?? __details.flightNumber  ?? undefined,
      flightDeparture: __details.flightDeparture ?? undefined,
      flightArrival:   __details.flightArrival  ?? undefined,
      flightDuration:  __details.flightDuration ?? undefined,
    };
    sendAllBookingNotifications(__notif).catch((e) =>
      logger.error({ err: e?.message }, "[book-flight] TJ notification error"),
    );
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

  // Fire-and-forget failure + refund notifications
  const _failureNotif: BookingNotificationData = {
    bookingId:      bookingRef,
    bookingType:    "flight",
    passengerName:  passengerName,
    passengerEmail: passengerEmail || undefined,
    passengerPhone: passengerPhone || undefined,
    travelDate:     travelDate,
    totalAmount:    totalPrice,
    paymentId:      paymentId,
    passengers:     passengers.length,
  };
  sendBookingFailureNotifications(_failureNotif, tjError ?? "Ticket booking failed").catch((e) =>
    logger.error({ err: e?.message }, "[book-flight] failure notification error"),
  );
  if (refundResult.initiated) {
    sendRefundNotifications(_failureNotif, "initiated", refundResult.refundId).catch((e) =>
      logger.error({ err: e?.message }, "[book-flight] refund notification error"),
    );
  }

  res.json({
    success:         false,
    error:           tjError ?? "TripJack booking failed",
    refundInitiated: refundResult.initiated,
    refundId:        refundResult.refundId,
    bookingRef,
  });
});

// ── GET /api/booking-status/:bookingRef ────────────────────────────────────
// Check/refresh booking status from TripJack. If stored status is "pending",
// calls TripJack /oms/v1/booking/detail and updates DB if status changed.
router.get("/booking-status/:bookingRef", async (req, res): Promise<void> => {
  const { bookingRef } = req.params;

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.bookingRef, bookingRef))
    .limit(1);

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const details       = (booking.details as Record<string, any>) || {};
  const storedTjRef   = (details.tjBookingRef as string | null) || null;
  let   currentStatus = booking.bookingStatus || "confirmed";
  let   currentPnr    = (details.pnr as string | null) || null;
  let   tjPassengers  = (details.tjPassengers  as Array<{ name: string; pnr: string; ticketNum: string; paxType: string }>) || [];
  let   ticketNumbers = (details.ticketNumbers as string[]) || [];

  // Call TripJack when:
  //  (a) status is "pending" — always poll until confirmed/failed
  //  (b) status is "confirmed" but PNR is missing — booking may have been stored
  //      as confirmed (old bug) without ever fetching the PNR from TripJack
  const shouldFetchFromTj = storedTjRef && (
    currentStatus === "pending" ||
    (currentStatus === "confirmed" && !currentPnr)
  );
  if (shouldFetchFromTj) {
    // Uses multi-strategy helper: detail → air-detail → list-today → list-2d
    const detail = await fetchTjBookingDetail(storedTjRef, "booking-status-check").catch((err: any) => {
      logger.warn({ bookingRef, err: err?.message }, "[booking-status] fetchTjBookingDetail threw — returning stored status");
      return null;
    });

    if (detail && detail.source !== "none") {
      const tjBookingStatus = detail.rawStatus;
      const refreshedPnr    = detail.pnr || currentPnr;
      logger.info({ bookingRef, tjBookingStatus, refreshedPnr, source: detail.source, paxCount: detail.tjPassengers.length }, "[booking-status] TripJack status refresh");

      if (tjBookingStatus === "CONFIRMED") {
        currentStatus = "confirmed";
        if (refreshedPnr) currentPnr = refreshedPnr;
        if (detail.tjPassengers.length  > 0) tjPassengers  = detail.tjPassengers;
        if (detail.ticketNumbers.length > 0) ticketNumbers = detail.ticketNumbers;
        await db
          .update(bookingsTable)
          .set({
            bookingStatus: "confirmed",
            status:        "confirmed",
            details: {
              ...details,
              pnr: currentPnr,
              tjDetailStatus: "CONFIRMED",
              ...(tjPassengers.length  > 0 ? { tjPassengers }  : {}),
              ...(ticketNumbers.length > 0 ? { ticketNumbers } : {}),
            },
          })
          .where(eq(bookingsTable.bookingRef, bookingRef));
      } else if (tjBookingStatus === "FAILED" || tjBookingStatus === "CANCELLED") {
        currentStatus = "failed";
        await db
          .update(bookingsTable)
          .set({ bookingStatus: "failed", status: "cancelled", failureCode: "api_error" })
          .where(eq(bookingsTable.bookingRef, bookingRef));
      }
      // PENDING → no update, keep polling
    } else {
      logger.warn({ bookingRef }, "[booking-status] all TripJack strategies failed — returning stored status");
    }
  }

  res.json({
    bookingRef,
    bookingStatus: currentStatus,
    pnr:           currentPnr,
    tjBookingRef:  storedTjRef,
    passengerName: booking.passengerName,
    travelDate:    booking.travelDate,
    totalPrice:    booking.totalPrice,
    bookingType:   booking.bookingType,
    ...(tjPassengers.length  > 0 ? { tjPassengers }  : {}),
    ...(ticketNumbers.length > 0 ? { ticketNumbers } : {}),
  });
});

export default router;
