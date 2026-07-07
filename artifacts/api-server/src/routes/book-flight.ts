import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, bookingsTable, bookingRefundsTable } from "@workspace/db";
import { extractTripJackError } from "../lib/tripjack-auth.js";
import { tjPostWithRetry } from "../lib/tj-retry.js";
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
  // TripJack booking sessions expire within a few minutes of the /fms/v1/review
  // call. By the time the user completes Razorpay checkout, the original session
  // is almost certainly expired. We call /fms/v1/review again immediately after
  // payment verification — using the same priceId/resultIndex — to create a fresh
  // session, then call /oms/v1/air/book right after with no delay.
  //
  // priceIdForRefresh: the stable fare identifier. The frontend sends it as
  //   fareData.resultIndex (when extracted successfully) or fareData.bookingId
  //   (fallback — the frontend stores the resultIndex there when the review
  //   response didn't contain a distinct bookingId field).
  const priceIdForRefresh: string = fareData.resultIndex || fareData.bookingId;
  let freshBookingId: string = fareData.bookingId;

  if (priceIdForRefresh) {
    try {
      logger.info(
        { paymentId, priceId: priceIdForRefresh },
        "[book-flight] STEP 2: refreshing fareQuote session before AirBook",
      );
      const reviewData = await tjPostWithRetry(
        "/fms/v1/review",
        { priceIds: [priceIdForRefresh] },
        { context: "book-flight/fareQuote-refresh", timeoutMs: 15_000, maxRetries: 1 },
      );

      // TripJack review response: bookingId may be at top level or inside data.
      // In many sandbox responses it equals the priceId — what matters is that
      // calling review again resets the session TTL on the server side.
      const refreshedId: string | undefined =
        (typeof reviewData?.bookingId      === "string" && reviewData.bookingId.trim())
          ? reviewData.bookingId.trim()
          : (typeof reviewData?.data?.bookingId === "string" && reviewData.data.bookingId.trim())
            ? reviewData.data.bookingId.trim()
            : undefined;

      freshBookingId = refreshedId ?? priceIdForRefresh;
      logger.info(
        { paymentId, freshBookingId, source: refreshedId ? "review-response" : "priceId-fallback" },
        "[book-flight] STEP 2: booking session refreshed",
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
  console.log("[book-flight] TripJack AirBook payload:", JSON.stringify(tjPayload, null, 2));

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

    const tjBookingStatus = (data?.data?.status?.booking ?? "").toUpperCase();
    console.log("[book-flight] TripJack AirBook raw status:", tjBookingStatus, "| errors:", JSON.stringify(data?.errors ?? null));

    if (data?.status?.success === false || (data?.errors?.length ?? 0) > 0) {
      tjError = extractTripJackError(data, "TripJack booking failed");
      logger.warn({ paymentId, tjError }, "[book-flight] TripJack returned failure in body");
    } else if (tjBookingStatus === "PENDING" || tjBookingStatus === "PROCESSING") {
      tjPending    = true;
      pnr          = data?.data?.pnr      || undefined;
      tjBookingRef = data?.data?.bookingId || undefined;
      logger.info({ paymentId, pnr, tjBookingRef, tjBookingStatus }, "[book-flight] TripJack AirBook PENDING");
    } else {
      // CONFIRMED or no explicit status (treat as confirmed if no error)
      tjSuccess    = true;
      pnr          = data?.data?.pnr      || undefined;
      tjBookingRef = data?.data?.bookingId || undefined;
      logger.info({ paymentId, pnr, tjBookingRef, tjBookingStatus }, "[book-flight] TripJack AirBook SUCCESS");
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
    // ── STEP 4.5: Immediately fetch booking detail for enriched PNR/ticket data ──
    let detailPnr      = pnr;
    let tjDetailStatus = tjSuccess ? "CONFIRMED" : "PENDING";
    let tjPassengers: Array<{ name: string; pnr: string; ticketNum: string; paxType: string }> = [];
    let ticketNumbers: string[] = [];

    if (tjBookingRef) {
      try {
        const detailRes = await tjPostWithRetry(
          "/oms/v1/booking/detail",
          { bookingId: tjBookingRef },
          { context: "book-flight/detail", timeoutMs: 15_000, maxRetries: 1 },
        );
        const dd         = detailRes?.data || {};
        detailPnr        = dd.pnr || (dd.pnrDetails?.[0]?.pnr) || pnr;
        tjDetailStatus   = ((dd.status?.booking as string) || tjDetailStatus).toUpperCase();

        tjPassengers = ((dd.pnrDetails || []) as any[])
          .map((p: any) => ({
            name:      (p.paxName || p.name || "").trim(),
            pnr:       p.pnr    || detailPnr || "",
            ticketNum: p.ticketNum || p.eTicketNumber || p.ticket_num || "",
            paxType:   (p.paxType   || "ADULT").toUpperCase(),
          }))
          .filter((p) => p.name.length > 0);

        ticketNumbers = ((dd.pnrDetails || []) as any[])
          .map((p: any) => p.ticketNum || p.eTicketNumber || p.ticket_num)
          .filter(Boolean);

        logger.info(
          { paymentId, detailPnr, tjDetailStatus, paxCount: tjPassengers.length, ticketCount: ticketNumbers.length },
          "[book-flight] STEP 4.5: booking detail enriched",
        );
      } catch (detailErr: any) {
        logger.warn(
          { paymentId, err: detailErr?.message },
          "[book-flight] STEP 4.5: booking detail fetch failed — using AirBook data",
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
    await db
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
      .where(eq(bookingsTable.id, savedBooking.id));

    logger.info(
      { paymentId, pnr: finalPnr, bookingRef, bookingId: savedBooking.id, finalBkSt },
      `[book-flight] STEP 4: booking persisted as ${finalBkSt}`,
    );

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

  // Only hit TripJack when status is pending and we have a TJ booking reference
  if (currentStatus === "pending" && storedTjRef) {
    try {
      const tjData = await tjPostWithRetry(
        "/oms/v1/booking/detail",
        { bookingId: storedTjRef },
        { context: "booking-status-check", timeoutMs: 15_000, maxRetries: 1 },
      );

      const dd              = tjData?.data || {};
      const tjBookingStatus = ((dd.status?.booking || tjData?.status?.booking || "")).toUpperCase();

      const refreshedPnr = dd.pnr || dd.pnrDetails?.[0]?.pnr || currentPnr;

      const refreshedPassengers = ((dd.pnrDetails || []) as any[])
        .map((p: any) => ({
          name:      (p.paxName || p.name || "").trim(),
          pnr:       p.pnr    || refreshedPnr || "",
          ticketNum: p.ticketNum || p.eTicketNumber || p.ticket_num || "",
          paxType:   (p.paxType || "ADULT").toUpperCase(),
        }))
        .filter((p) => p.name.length > 0);

      const refreshedTickets = ((dd.pnrDetails || []) as any[])
        .map((p: any) => p.ticketNum || p.eTicketNumber || p.ticket_num)
        .filter(Boolean);

      logger.info({ bookingRef, tjBookingStatus, refreshedPnr, paxCount: refreshedPassengers.length }, "[booking-status] TripJack status refresh");

      if (tjBookingStatus === "CONFIRMED") {
        currentStatus = "confirmed";
        if (refreshedPnr) currentPnr = refreshedPnr;
        if (refreshedPassengers.length > 0) tjPassengers = refreshedPassengers;
        if (refreshedTickets.length    > 0) ticketNumbers = refreshedTickets;
        await db
          .update(bookingsTable)
          .set({
            bookingStatus: "confirmed",
            status:        "confirmed",
            details: {
              ...details,
              pnr: currentPnr,
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
    } catch (err: any) {
      logger.warn({ bookingRef, err: err?.message }, "[booking-status] TripJack refresh failed — returning stored status");
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
