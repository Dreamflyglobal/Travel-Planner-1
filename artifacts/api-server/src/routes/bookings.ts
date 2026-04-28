import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { eq, desc, or } from "drizzle-orm";
import { db, bookingsTable, usersTable } from "@workspace/db";
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

router.get("/stats/summary", async (_req, res): Promise<void> => {
  const allBookings = await db.select().from(bookingsTable);

  const flightBookings = allBookings.filter((b) => b.bookingType === "flight").length;
  const busBookings = allBookings.filter((b) => b.bookingType === "bus").length;
  const hotelBookings = allBookings.filter((b) => b.bookingType === "hotel").length;
  const packageBookings = allBookings.filter((b) => b.bookingType === "package").length;
  const totalRevenue = allBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);

  res.json(
    GetStatsSummaryResponse.parse({
      totalBookings: allBookings.length,
      flightBookings,
      busBookings,
      hotelBookings,
      packageBookings,
      totalRevenue,
    })
  );
});

router.get("/bookings", async (req, res): Promise<void> => {
  try {
    const { userId, phone } = req.query;

    let resolvedUserId: string | null = null;

    // Resolve userId from phone if phone is provided and userId is not
    if (phone && typeof phone === "string" && !(userId && typeof userId === "string")) {
      const cleanPhone = phone.trim();
      const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, cleanPhone))
        .limit(1);
      if (user) resolvedUserId = String(user.id);
    } else if (userId && typeof userId === "string") {
      resolvedUserId = userId;
    }

    let query = db.select().from(bookingsTable).$dynamic();

    if (resolvedUserId) {
      // Filter by userId OR passengerPhone (for bookings made before the auto-link was introduced)
      const phoneParam = phone && typeof phone === "string" ? phone.trim() : null;
      if (phoneParam) {
        query = query.where(
          or(
            eq(bookingsTable.userId, resolvedUserId),
            eq(bookingsTable.passengerPhone, phoneParam),
          )!
        );
      } else {
        query = query.where(eq(bookingsTable.userId, resolvedUserId));
      }
    }

    const bookings = await query.orderBy(desc(bookingsTable.createdAt));

    const mapped = bookings.map((b) => ({
      ...b,
      totalPrice: Number(b.totalPrice),
      commissionEarned: b.commissionEarned ? Number(b.commissionEarned) : null,
      createdAt: b.createdAt.toISOString(),
      passengerPhone: b.passengerPhone ?? undefined,
      details: b.details ?? undefined,
    }));
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

    const bookingRef = (details.bookingRef || bookingData.bookingRef || null) as string | null;
    const title = (bookingData.title || details.title || null) as string | null;
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
      })
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
  const params = GetBookingParams.safeParse(req.params);
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

  res.json(
    GetBookingResponse.parse({
      ...booking,
      totalPrice: Number(booking.totalPrice),
      createdAt: booking.createdAt.toISOString(),
      passengerPhone: booking.passengerPhone ?? undefined,
      details: booking.details ?? undefined,
    })
  );
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

export default router;
