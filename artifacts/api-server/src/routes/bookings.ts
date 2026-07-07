import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { requireAdmin } from "../lib/admin-auth.js";
import { eq, desc, or } from "drizzle-orm";
import { db, bookingsTable, usersTable } from "@workspace/db";
import { fetchTjBookingDetail } from "../lib/tj-booking-helper.js";
import { nextBookingRef } from "../lib/booking-id.js";
import { sanitizeLocation, formatRoute } from "../lib/location-utils.js";
import {
  ListBookingsResponse,
  CreateBookingBody,
  GetBookingParams,
  GetBookingResponse,
  CancelBookingParams,
  CancelBookingResponse,
  GetStatsSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanitize a booking title before storing in DB.
 * Handles route-style titles ("Hyderabad !' Goa" or "Hyderabad → Goa") and plain names.
 */
function sanitizeTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // Detect route-style titles: split on → or common corruption artifacts
  const parts = s.split(/\s*(?:\u2192|!['`'\u2019\u0060;])\s*/);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return formatRoute(parts[0], parts[1]);
  }
  // Non-route title — strip only the corruption artifacts, preserve the rest
  return s
    .replace(/!['\u2019\u0060\u0027;]/g, " ")
    .replace(/\u2192/g, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

/**
 * Find an existing user by phone or email.
 * If no match, create a new auto-account (no password) and return it.
 * Prevents duplicate accounts — phone and email each have a unique constraint.
 */
async function findOrCreateUser(
  phone: string | null,
  email: string | null,
  name: string,
): Promise<{ id: number; created: boolean }> {
  const cleanPhone = phone?.trim() || null;
  const cleanEmail = email?.trim().toLowerCase() || null;

  // 1. Try to find by phone first
  if (cleanPhone) {
    const [byPhone] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, cleanPhone))
      .limit(1);
    if (byPhone) return { id: byPhone.id, created: false };
  }

  // 2. Try to find by email
  if (cleanEmail) {
    const [byEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, cleanEmail))
      .limit(1);
    if (byEmail) return { id: byEmail.id, created: false };
  }

  // 3. Create new auto-account (no password — user can set one later via OTP)
  const [created] = await db
    .insert(usersTable)
    .values({
      name: name || "Guest",
      phone: cleanPhone,
      email: cleanEmail,
      role: "user",
      isApproved: false,
      otpUser: !!cleanPhone,
    })
    .returning({ id: usersTable.id });

  return { id: created.id, created: true };
}

// ─── routes ──────────────────────────────────────────────────────────────────

// Statuses that count as a real (successful) booking for revenue and totals.
// Pending, payment_failed, failed, cancelled, refunded → excluded.
const REVENUE_STATUSES = new Set(["confirmed", "ticketed", "completed"]);

// Statuses that represent unconverted leads (stored but not counted as bookings/revenue).
const LEAD_STATUSES = new Set(["pending", "payment_failed", "failed", "cancelled", "refunded"]);

const isSuccessful = (b: { status: string | null }): boolean =>
  REVENUE_STATUSES.has((b.status ?? "").toLowerCase());

const isLead = (b: { status: string | null; paymentStatus: string | null }): boolean => {
  const s  = (b.status        ?? "").toLowerCase();
  const ps = (b.paymentStatus ?? "").toLowerCase();
  return (
    LEAD_STATUSES.has(s) ||
    ps === "pending" ||
    ps === "payment_failed" ||
    ps === "failed"
  );
};

router.get("/stats/summary", async (_req, res): Promise<void> => {
  const allBookings = await db.select().from(bookingsTable);

  // ── Revenue: ONLY confirmed / ticketed / completed bookings ───────────────
  const confirmedBookings = allBookings.filter(isSuccessful);
  const confirmedRevenue  = confirmedBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);
  const totalRevenue      = confirmedRevenue;

  // totalBookings = only successful bookings (not leads / cancelled)
  const successfulBookings = confirmedBookings.length;

  // ── Lead metrics (pending / payment_failed / failed) ─────────────────────
  const pendingBookings = allBookings.filter(
    (b) => (b.status ?? "").toLowerCase() === "pending" ||
            (b.paymentStatus ?? "").toLowerCase() === "pending",
  ).length;

  const failedBookings = allBookings.filter(
    (b) => (b.status ?? "").toLowerCase() === "failed" ||
            (b.status ?? "").toLowerCase() === "payment_failed" ||
            (b.paymentStatus ?? "").toLowerCase() === "failed" ||
            (b.paymentStatus ?? "").toLowerCase() === "payment_failed",
  ).length;

  const cancelledBookings = allBookings.filter(
    (b) => {
      const s = (b.status ?? "").toLowerCase();
      return s === "cancelled" || s === "refunded";
    },
  ).length;

  const pendingLeads   = pendingBookings;
  const failedPayments = failedBookings;
  const totalLeads     = allBookings.filter(isLead).length;

  res.json(
    GetStatsSummaryResponse.parse({
      totalBookings:    successfulBookings,
      flightBookings:   confirmedBookings.filter((b) => b.bookingType === "flight").length,
      busBookings:      confirmedBookings.filter((b) => b.bookingType === "bus").length,
      hotelBookings:    confirmedBookings.filter((b) => b.bookingType === "hotel").length,
      packageBookings:  confirmedBookings.filter((b) => b.bookingType === "package").length,
      totalRevenue,
      confirmedRevenue,
      successfulBookings,
      pendingLeads,
      failedPayments,
      cancelledBookings,
      totalLeads,
      pendingBookings,
      failedBookings,
    }),
  );
});

router.get("/bookings", async (req, res): Promise<void> => {
  try {
    const { userId, phone, email } = req.query;

    const phoneParam = phone && typeof phone === "string" ? phone.trim() : null;
    const emailParam = email && typeof email === "string" ? email.trim().toLowerCase() : null;

    let resolvedUserId: string | null = null;

    if (userId && typeof userId === "string" && /^\d+$/.test(userId)) {
      // Real numeric userId — use directly
      resolvedUserId = userId;
    } else if (phoneParam) {
      // Resolve by phone
      const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, phoneParam))
        .limit(1);
      if (user) resolvedUserId = String(user.id);
    } else if (emailParam) {
      // Resolve by email
      const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, emailParam))
        .limit(1);
      if (user) resolvedUserId = String(user.id);
    }

    let query = db.select().from(bookingsTable).$dynamic();

    if (resolvedUserId) {
      // Build OR conditions: DB userId match + phone + email fallbacks for
      // legacy bookings created before proper account linkage existed.
      const conditions: ReturnType<typeof eq>[] = [
        eq(bookingsTable.userId, resolvedUserId),
      ];
      if (phoneParam) conditions.push(eq(bookingsTable.passengerPhone, phoneParam));
      if (emailParam) conditions.push(eq(bookingsTable.passengerEmail, emailParam));
      query = query.where(or(...conditions)!);
    }

    const bookings = await query.orderBy(desc(bookingsTable.createdAt));

    const mapped = bookings.map((b) => {
      const d = (b.details as Record<string, any>) ?? {};
      // Expose fare columns with JSONB fallback for legacy bookings
      const baseFare = (b as any).baseFare != null
        ? Number((b as any).baseFare)
        : Number(d.rawBaseAmount ?? d.base_price ?? 0) || null;
      const markupAmount = (b as any).markupAmount != null
        ? Number((b as any).markupAmount)
        : Number(d.markupAmount ?? d.markup ?? 0) || null;
      const convenienceFee = (b as any).convenienceFee != null
        ? Number((b as any).convenienceFee)
        : Number(d.convenienceFee ?? d.convenience_fee ?? 0) || null;
      return {
        ...b,
        totalPrice: Number(b.totalPrice),
        commissionEarned: b.commissionEarned ? Number(b.commissionEarned) : null,
        createdAt: b.createdAt.toISOString(),
        passengerPhone: b.passengerPhone ?? undefined,
        details: b.details ?? undefined,
        baseFare,
        markupAmount,
        convenienceFee,
      };
    });
    res.json(mapped);
  } catch (error) {
    logger.error("❌ Error fetching bookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

router.post("/bookings", async (req, res): Promise<void> => {
  try {
    const body = req.body;

    const bookingData = body.data || body;
    const details = bookingData.details || {};

    const passengerName  = (bookingData.passengerName  || details.customerName  || "") as string;
    const passengerEmail = (bookingData.passengerEmail || details.customerEmail || null) as string | null;
    const passengerPhone = (bookingData.passengerPhone || details.customerPhone || null) as string | null;

    // ── Auto user lookup / creation ───────────────────────────────────────────
    let userId: string;
    const incomingUserId = (details.userId || bookingData.userId || "") as string;

    if (incomingUserId && incomingUserId !== "guest" && incomingUserId !== "") {
      // Already authenticated — trust the provided userId
      userId = incomingUserId;
      logger.info("👤 Booking: authenticated user", userId);
    } else {
      // Guest checkout — find or create a user account by phone/email
      const { id, created } = await findOrCreateUser(passengerPhone, passengerEmail, passengerName);
      userId = String(id);
      logger.info(
        created
          ? `🆕 Booking: auto-created user ${userId} for phone=${passengerPhone} email=${passengerEmail}`
          : `✅ Booking: found existing user ${userId} for phone=${passengerPhone} email=${passengerEmail}`
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Generate sequential readable booking reference if not already provided by the frontend
    const incomingRef = (details.bookingRef || bookingData.bookingRef || null) as string | null;
    const bookingType_str = (bookingData.bookingType || "flight") as string;
    const bookingRef = incomingRef && incomingRef.trim() !== ""
      ? incomingRef.trim()
      : await nextBookingRef(bookingType_str);
    const title = sanitizeTitle((bookingData.title || details.title || null) as string | null);
    const referenceId = parseInt(String(bookingData.referenceId || 0), 10) || 0;
    const totalPrice = String(details.amount || bookingData.totalPrice || 0);
    const paymentId = (details.paymentId || bookingData.paymentId || null) as string | null;
    const paymentMethod = (details.paymentMethod || bookingData.paymentMethod || null) as string | null;
    const agentId = (bookingData.agentId || details.agentId || null) as string | null;
    const agentCode = (bookingData.agentCode || details.agentCode || null) as string | null;
    const agentEmail = (bookingData.agentEmail || details.agentEmail || null) as string | null;
    const commissionEarned = details.commissionEarned || bookingData.commissionEarned
      ? String(details.commissionEarned || bookingData.commissionEarned)
      : null;

    // Fare breakdown — top-level columns for fast aggregation.
    // Read from explicit top-level fields first (new bookings), fall back to JSONB variants (legacy).
    const rawBaseFareNum = Number(
      bookingData.baseFare ?? details.rawBaseAmount ?? details.base_price ?? 0
    );
    const rawMarkupNum = Number(
      bookingData.markupAmount ?? details.markupAmount ?? details.markup ?? 0
    );
    const rawConvFeeNum = Number(
      bookingData.convenienceFee ?? details.convenienceFee ?? details.convenience_fee ?? 0
    );
    const baseFareVal   = rawBaseFareNum  > 0 ? String(rawBaseFareNum)  : null;
    const markupVal     = rawMarkupNum    > 0 ? String(rawMarkupNum)    : null;
    const convFeeVal    = rawConvFeeNum   > 0 ? String(rawConvFeeNum)   : null;

    const [inserted] = await db
      .insert(bookingsTable)
      .values({
        bookingRef,
        userId,
        bookingType: bookingData.bookingType || "flight",
        title,
        referenceId,
        status: details.status || "confirmed",
        passengerName,
        passengerEmail: passengerEmail || "",
        passengerPhone: passengerPhone || null,
        totalPrice,
        passengers: Number(bookingData.passengers || 1),
        travelDate: bookingData.travelDate || new Date().toISOString().split("T")[0],
        details,
        agentId,
        agentCode,
        agentEmail,
        commissionEarned,
        paymentMethod,
        paymentStatus: "paid",
        paymentId,
        baseFare:       baseFareVal,
        markupAmount:   markupVal,
        convenienceFee: convFeeVal,
      } as any)
      .returning();

    logger.info("✅ Booking saved to PostgreSQL:", inserted.id, "| ref:", bookingRef, "| user:", userId);

    res.status(201).json({
      ...inserted,
      userId,                // echo back the resolved userId so frontend can update
      totalPrice: Number(inserted.totalPrice),
      commissionEarned: inserted.commissionEarned ? Number(inserted.commissionEarned) : null,
      createdAt: inserted.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error("❌ Error saving booking to DB:", error);
    res.status(500).json({ error: "Failed to save booking" });
  }
});

// ── GET /api/invoice/:bookingRef ──────────────────────────────────────────────
// Fetches a booking from the DB by its human-readable bookingRef (e.g. BK-1A2B3C4D)
// and returns data shaped as BookingInvoice so the frontend can render the invoice
// even when localStorage is empty (cross-device, cache-cleared, etc.)
router.get("/invoice/:bookingRef", async (req, res): Promise<void> => {
  const ref = req.params.bookingRef?.trim().toUpperCase();
  if (!ref) {
    res.status(400).json({ error: "bookingRef is required" });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.bookingRef, ref))
    .limit(1);

  if (!booking) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const d  = (booking.details as Record<string, any>) || {};
  const fi = (d.flightInfo  as Record<string, any>) || {};
  const bi = (d.busInfo     as Record<string, any>) || {};
  const hi = (d.hotelInfo   as Record<string, any>) || {};

  res.json({
    bookingId:      booking.bookingRef || String(booking.id),
    bookingType:    booking.bookingType,
    passengerName:  booking.passengerName,
    passengerEmail: booking.passengerEmail,
    passengerPhone: booking.passengerPhone ?? undefined,
    passengers:     booking.passengers,
    travelDate:     booking.travelDate,
    checkoutDate:   hi.checkout ?? undefined,
    totalAmount:    Number(booking.totalPrice),
    paymentId:      booking.paymentId || "—",
    paymentStatus:  booking.paymentStatus,
    timestamp:      booking.createdAt.toISOString(),
    title:          booking.title || "",
    selectedSeats:  d.selectedSeats || bi.seats || undefined,
    discount:       d.discountAmount || undefined,
    roomType:       hi.room_type || undefined,
    pnr:            (d.pnr || d.pnrNumber || fi.pnr) || undefined,
    tjPnr:          (d.pnr || d.pnrNumber || fi.pnr) || undefined,
    tjBookingRef:   (d.tjBookingRef  as string | undefined) || undefined,
    tjPassengers:   (d.tjPassengers  as any[] | undefined)  || undefined,
    ticketNumbers:  (d.ticketNumbers as string[] | undefined) || undefined,
    tjBookingStatus: (booking.bookingStatus as "confirmed" | "pending" | "failed") || undefined,
    // Flight
    flightAirline:    fi.airline    || undefined,
    flightNumber:     fi.flightNum  || undefined,
    flightFrom:       fi.from       || undefined,
    flightTo:         fi.to         || undefined,
    flightDeparture:  fi.departure  || undefined,
    flightArrival:    fi.arrival    || undefined,
    flightDuration:   fi.duration   || undefined,
    flightBaseFare:   d.baseAmount  || undefined,
    flightConvFee:    d.convenienceFee || undefined,
    flightBaggageKg:  d.extraBaggageKg   || undefined,
    flightBaggageCost:d.extraBaggageCost  || undefined,
    // Bus
    busOperator:      bi.operator        || undefined,
    busType:          bi.busType         || undefined,
    busFrom:          bi.from            || undefined,
    busTo:            bi.to              || undefined,
    busDeparture:     bi.departure       || undefined,
    busArrival:       bi.arrival         || undefined,
    busBoardingPoint: bi.boarding_point  || undefined,
    busDroppingPoint: bi.dropping_point  || undefined,
    busBaseFare:      d.baseAmount       || undefined,
    busConvFee:       d.convenience_fee  || undefined,
    // Hotel
    hotelName:   hi.hotel_name || undefined,
    hotelCity:   hi.city       || undefined,
    hotelNights: hi.nights     || undefined,
    hotelRooms:  hi.rooms      || undefined,
    hotelAdults: hi.guests     || undefined,
  });
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
  const rawId = req.params.id?.trim();
  if (!rawId) {
    res.status(400).json({ error: "Booking id is required" });
    return;
  }

  let booking;

  // Try numeric DB id first
  const numId = parseInt(rawId, 10);
  if (!isNaN(numId) && String(numId) === rawId) {
    [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, numId))
      .limit(1);
  }

  // Fall back to bookingRef string (e.g. "BKG-3", "BK-1A2B3C4D")
  if (!booking) {
    [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingRef, rawId.toUpperCase()))
      .limit(1);
  }

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  // Flatten the JSONB details so the frontend can access route/hotel/bus fields directly
  const d  = (booking.details as Record<string, any>) ?? {};
  const fi = (d.flightInfo  as Record<string, any>) ?? {};
  const bi = (d.busInfo     as Record<string, any>) ?? {};
  const hi = (d.hotelInfo   as Record<string, any>) ?? {};

  res.json({
    id:             booking.id,
    bookingRef:     booking.bookingRef || undefined,
    bookingType:    booking.bookingType,
    referenceId:    booking.referenceId,
    status:         booking.status,
    paymentStatus:  booking.paymentStatus || undefined,
    paymentId:      booking.paymentId     || undefined,
    paymentMethod:  booking.paymentMethod || undefined,
    title:          booking.title || d.title || undefined,
    passengerName:  booking.passengerName,
    passengerEmail: booking.passengerEmail,
    passengerPhone: booking.passengerPhone ?? undefined,
    passengers:     booking.passengers,
    travelDate:     booking.travelDate,
    createdAt:      booking.createdAt.toISOString(),
    totalPrice:     Number(booking.totalPrice),
    agentId:        booking.agentId    || undefined,
    agentCode:      booking.agentCode  || undefined,
    // Nested details (kept for backward compat)
    details:        booking.details ?? undefined,
    // ── Flattened flight fields ────────────────────────────────────────────
    flightAirline:    fi.airline    || undefined,
    flightNumber:     fi.flightNum  || fi.flightNumber || undefined,
    flightFrom:       fi.from       || fi.fromCity     || undefined,
    flightTo:         fi.to         || fi.toCity       || undefined,
    flightDeparture:  fi.departure  || undefined,
    flightArrival:    fi.arrival    || undefined,
    flightDuration:   fi.duration   || undefined,
    // ── Flattened bus fields ───────────────────────────────────────────────
    busOperator:      bi.operator        || undefined,
    busType:          bi.busType         || undefined,
    busFrom:          bi.from            || undefined,
    busTo:            bi.to              || undefined,
    busDeparture:     bi.departure       || undefined,
    busArrival:       bi.arrival         || undefined,
    busBoardingPoint: bi.boarding_point  || bi.boardingPoint || undefined,
    busDroppingPoint: bi.dropping_point  || bi.droppingPoint || undefined,
    // ── Flattened hotel fields ─────────────────────────────────────────────
    hotelName:   hi.hotel_name || hi.name  || undefined,
    hotelCity:   hi.city                   || undefined,
    hotelNights: hi.nights                 || undefined,
    hotelRooms:  hi.rooms                  || undefined,
    hotelAdults: hi.guests || hi.adults    || undefined,
    checkoutDate:hi.checkout               || undefined,
    roomType:    hi.room_type              || undefined,
    // ── Seat / misc ────────────────────────────────────────────────────────
    selectedSeats: d.selectedSeats || bi.seats || undefined,
  });
});

router.delete("/bookings/:id", async (req, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "cancelled" })
    .where(eq(bookingsTable.id, params.data.id))
    .returning();

  res.json(
    CancelBookingResponse.parse({
      ...updated,
      totalPrice: Number(updated.totalPrice),
      createdAt: updated.createdAt.toISOString(),
      passengerPhone: updated.passengerPhone ?? undefined,
      details: updated.details ?? undefined,
    })
  );
});

// ── POST /api/bookings/record-failed ──────────────────────────────────────────
// Saves a failed/cancelled payment attempt for admin visibility.
// Does NOT create a confirmed booking — status is always "booking_failed".
router.post("/bookings/record-failed", async (req, res): Promise<void> => {
  try {
    const body           = req.body?.data || req.body;
    const passengerName  = String(body.passengerName  || "Unknown");
    const passengerEmail = String(body.passengerEmail || "") || null;
    const passengerPhone = String(body.passengerPhone || "") || null;
    const bookingRef     = String(body.bookingRef || `FAIL-${Date.now().toString(36).toUpperCase()}`);
    const bookingType    = String(body.bookingType || "flight");
    const totalPrice     = String(Number(body.totalPrice ?? body.amount ?? 0));
    const paymentId      = String(body.paymentId || "") || null;
    const failureReason  = String(body.failureReason || body.error || "Payment failed");
    const failureCode    = String(body.failureCode   || "payment_failed");
    const details        = (typeof body.details === "object" && body.details !== null) ? body.details : {};
    const travelDate     = String(body.travelDate || new Date().toISOString().split("T")[0]);

    // Auto user lookup — best-effort, never block on error
    let userId = "guest";
    try {
      const { id } = await findOrCreateUser(passengerPhone, passengerEmail, passengerName);
      userId = String(id);
    } catch { /* keep guest */ }

    const [inserted] = await db
      .insert(bookingsTable)
      .values({
        bookingRef,
        userId,
        bookingType,
        passengerName,
        passengerEmail: passengerEmail || "",
        passengerPhone: passengerPhone || null,
        totalPrice,
        passengers:    Number(body.passengers ?? 1),
        travelDate,
        status:        "booking_failed",
        paymentStatus: "failed",
        bookingStatus: "failed",
        paymentId,
        failureReason,
        failureCode,
        details: { ...details, failureReason, failureCode, paymentId },
      } as any)
      .returning();

    logger.info({ bookingRef, paymentId, failureReason }, "[bookings] failed payment record saved — id:", inserted.id);
    res.status(201).json({ success: true, id: inserted.id, bookingRef });
  } catch (err: any) {
    logger.error({ err: err?.message }, "[bookings] failed to save failed payment record");
    res.status(500).json({ success: false, error: err?.message || "Failed to save record" });
  }
});

// ── PATCH /api/bookings/ref/:bookingRef/tj-update ──────────────────────────────
// Lightweight endpoint to update a booking record with TripJack confirmation data.
// Used by the wallet/credit payment paths which book via /api/tj-book (thin proxy)
// and need to persist the TripJack booking ID + PNR back to the DB record.
router.patch("/bookings/ref/:bookingRef/tj-update", async (req, res): Promise<void> => {
  const { bookingRef } = req.params;
  const { tjBookingRef, pnr, tjDetailStatus, tjPassengers, ticketNumbers } = req.body ?? {};

  try {
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingRef, bookingRef))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const existingDetails = (booking.details as Record<string, any>) ?? {};
    const patchDetails: Record<string, any> = { ...existingDetails };
    if (tjBookingRef !== undefined && tjBookingRef !== null) patchDetails.tjBookingRef  = tjBookingRef;
    if (pnr           !== undefined && pnr           !== null) patchDetails.pnr           = pnr;
    if (tjDetailStatus)                                         patchDetails.tjDetailStatus = tjDetailStatus;
    if (Array.isArray(tjPassengers)  && tjPassengers.length  > 0) patchDetails.tjPassengers  = tjPassengers;
    if (Array.isArray(ticketNumbers) && ticketNumbers.length > 0) patchDetails.ticketNumbers = ticketNumbers;

    const updateSet: any = { details: patchDetails };
    if (tjBookingRef || pnr) {
      updateSet.bookingStatus = "confirmed";
      updateSet.status        = "confirmed";
    }

    await db.update(bookingsTable).set(updateSet).where(eq(bookingsTable.bookingRef, bookingRef));

    logger.info({ bookingRef, tjBookingRef, pnr }, "[bookings] tj-update: booking enriched with TJ data");
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err: err?.message, bookingRef }, "[bookings] tj-update failed");
    res.status(500).json({ error: err?.message || "Update failed" });
  }
});

// ── POST /api/bookings/ref/:bookingRef/tj-sync ────────────────────────────────
// Automatically query TripJack for the latest booking status and sync to DB.
// Requires admin auth.  Returns the result of the sync attempt — no manual PNR
// entry required.  This is the fully-automatic alternative to force-confirm.
//
// Flow:
//  1. Lookup the booking in our DB to get the TripJack booking reference.
//  2. Call fetchTjBookingDetail (multi-strategy: detail → air-detail → list).
//  3. If TripJack returns CONFIRMED → update DB status, PNR, passengers, tickets.
//  4. Return { synced, bookingStatus, pnr, tjStatus, source, message }.
//
// SANDBOX LIMITATION: /oms/v1/booking/* endpoints are not accessible in the
// TripJack sandbox environment (returns 404) — only AirBook (/oms/v1/air/book)
// is whitelisted.  synced=false with source="none" means this limitation is active.
// In production (with correct IP whitelisting) synced=true will be returned
// immediately when TripJack has confirmed the booking.
router.post("/bookings/ref/:bookingRef/tj-sync", requireAdmin, async (req, res): Promise<void> => {
  const { bookingRef } = req.params;

  try {
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingRef, bookingRef))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const details     = (booking.details as Record<string, any>) ?? {};
    const tjBookingRef: string = details.tjBookingRef ?? "";

    if (!tjBookingRef) {
      res.status(400).json({
        error:   "No TripJack booking reference stored for this booking — cannot sync",
        synced:  false,
        message: "The booking does not have a tjBookingRef. It may not be a TripJack flight booking.",
      });
      return;
    }

    logger.info({ bookingRef, tjBookingRef }, "[bookings/tj-sync] starting automatic TripJack sync");

    const detail = await fetchTjBookingDetail(tjBookingRef, `tj-sync/${bookingRef}`);

    if (detail.source === "none") {
      // All strategies failed — TripJack endpoint not accessible from this environment
      res.json({
        synced:        false,
        bookingStatus: booking.bookingStatus,
        pnr:           details.pnr ?? null,
        tjStatus:      null,
        source:        "none",
        message:
          "TripJack booking detail endpoint is not accessible from this server. " +
          "In sandbox this is expected — /oms/v1/booking/* requires separate IP whitelisting " +
          "from /oms/v1/air/book. Ask TripJack support to whitelist your server IP for the " +
          "booking-management endpoints, then retry. The booking will be synced automatically " +
          "once the endpoint becomes accessible.",
      });
      return;
    }

    const tjStatus = detail.rawStatus;   // "CONFIRMED" | "PENDING" | "FAILED" | ...
    const pnr      = detail.pnr || (details.pnr as string | null) || null;

    if (tjStatus === "CONFIRMED") {
      const patchDetails: Record<string, any> = {
        ...details,
        pnr,
        tjDetailStatus: "CONFIRMED",
        tjSyncedAt:     new Date().toISOString(),
        tjSyncSource:   detail.source,
        ...(detail.tjPassengers.length  > 0 ? { tjPassengers:  detail.tjPassengers  } : {}),
        ...(detail.ticketNumbers.length > 0 ? { ticketNumbers: detail.ticketNumbers } : {}),
      };

      await db
        .update(bookingsTable)
        .set({ bookingStatus: "confirmed", status: "confirmed", details: patchDetails })
        .where(eq(bookingsTable.bookingRef, bookingRef));

      logger.info(
        { bookingRef, tjBookingRef, pnr, source: detail.source, paxCount: detail.tjPassengers.length },
        "[bookings/tj-sync] booking CONFIRMED — DB updated",
      );

      res.json({
        synced:        true,
        bookingStatus: "confirmed",
        pnr,
        tjStatus:      "CONFIRMED",
        source:        detail.source,
        passengers:    detail.tjPassengers,
        ticketNumbers: detail.ticketNumbers,
        message:       `Booking confirmed by TripJack (via ${detail.source}). PNR: ${pnr ?? "(not yet issued)"}`,
      });
    } else if (tjStatus === "FAILED" || tjStatus === "CANCELLED") {
      await db
        .update(bookingsTable)
        .set({
          bookingStatus: "failed",
          status:        "cancelled",
          failureCode:   "tj_failed",
          failureReason: `TripJack booking ${tjStatus.toLowerCase()} (auto-synced)`,
          details: { ...details, tjDetailStatus: tjStatus, tjSyncedAt: new Date().toISOString() },
        })
        .where(eq(bookingsTable.bookingRef, bookingRef));

      logger.warn({ bookingRef, tjBookingRef, tjStatus }, "[bookings/tj-sync] booking FAILED/CANCELLED — DB updated");

      res.json({
        synced:        true,
        bookingStatus: "failed",
        pnr:           null,
        tjStatus,
        source:        detail.source,
        message:       `TripJack reports this booking as ${tjStatus}. DB updated to failed/cancelled.`,
      });
    } else {
      // PENDING or unknown — no DB change yet
      res.json({
        synced:        false,
        bookingStatus: booking.bookingStatus,
        pnr:           pnr,
        tjStatus:      tjStatus || "(pending/unknown)",
        source:        detail.source,
        message:       "TripJack is still processing this booking (status: PENDING). Will be synced automatically by the background poller once TripJack confirms.",
      });
    }
  } catch (err: any) {
    logger.error({ bookingRef, err: err?.message }, "[bookings/tj-sync] unexpected error");
    res.status(500).json({ error: err?.message || "Failed to sync booking from TripJack" });
  }
});

// ── POST /api/bookings/ref/:bookingRef/force-confirm ───────────────────────────
// Admin-only endpoint: manually confirm a booking and record the PNR.
// Used when TripJack has confirmed the booking in their portal but the detail
// API is inaccessible (e.g. sandbox IP restrictions prevent programmatic polling).
router.post("/bookings/ref/:bookingRef/force-confirm", requireAdmin, async (req, res): Promise<void> => {
  const { bookingRef } = req.params;
  const { pnr, tjBookingRef, ticketNumbers } = req.body ?? {};

  if (!pnr?.trim()) {
    res.status(400).json({ error: "pnr is required" });
    return;
  }

  try {
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingRef, bookingRef))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const existingDetails = (booking.details as Record<string, any>) ?? {};
    const patchDetails: Record<string, any> = {
      ...existingDetails,
      pnr:              pnr.trim().toUpperCase(),
      tjDetailStatus:   "CONFIRMED",
      forceConfirmedAt: new Date().toISOString(),
      forceConfirmedBy: "admin",
    };
    if (tjBookingRef?.trim()) patchDetails.tjBookingRef  = tjBookingRef.trim();
    if (Array.isArray(ticketNumbers) && ticketNumbers.length > 0) {
      patchDetails.ticketNumbers = ticketNumbers.map((t: string) => t.trim()).filter(Boolean);
    }

    await db
      .update(bookingsTable)
      .set({
        bookingStatus: "confirmed",
        status:        "confirmed",
        details:       patchDetails,
      })
      .where(eq(bookingsTable.bookingRef, bookingRef));

    logger.info({ bookingRef, pnr: pnr.trim().toUpperCase() }, "[bookings] force-confirm: booking confirmed by admin with PNR");
    res.json({ success: true, bookingRef, pnr: pnr.trim().toUpperCase() });
  } catch (err: any) {
    logger.error({ err: err?.message, bookingRef }, "[bookings] force-confirm failed");
    res.status(500).json({ error: err?.message || "Failed to confirm booking" });
  }
});

export default router;
