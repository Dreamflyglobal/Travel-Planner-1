import { Router } from "express";
import {
  db,
  bookingsTable,
  bookingRefundsTable,
  apiKeysTable,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { requireAdmin } from "../lib/admin-auth.js";
import {
  sendBookingEmail,
  sendBookingSMS,
  sendBookingWhatsApp,
  sendAllBookingNotifications,
  sendBookingFailureNotifications,
  sendRefundNotifications,
  type BookingNotificationData,
} from "../lib/notification-service.js";

const router = Router();

const ALLOWED_STATUSES = ["pending", "confirmed", "cancelled", "refunded", "booking_failed"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(s: unknown): s is AllowedStatus {
  return typeof s === "string" && (ALLOWED_STATUSES as readonly string[]).includes(s);
}

const ALLOWED_BOOKING_STATUSES = ["pending", "processing", "confirmed", "failed"] as const;
const ALLOWED_PAYMENT_STATUSES = ["pending", "paid", "failed"] as const;

async function loadRefundsForBookings(bookingIds: number[]) {
  if (bookingIds.length === 0) return new Map<number, typeof bookingRefundsTable.$inferSelect>();
  const rows = await db
    .select()
    .from(bookingRefundsTable)
    .where(inArray(bookingRefundsTable.bookingId, bookingIds));
  // Keep only the most recent refund per booking.
  const map = new Map<number, typeof bookingRefundsTable.$inferSelect>();
  for (const r of rows) {
    const existing = map.get(r.bookingId);
    if (!existing || existing.createdAt < r.createdAt) {
      map.set(r.bookingId, r);
    }
  }
  return map;
}

function shapeBooking(
  b: typeof bookingsTable.$inferSelect,
  refund: typeof bookingRefundsTable.$inferSelect | undefined,
) {
  const d = (b.details as Record<string, any>) ?? {};
  // Fare breakdown — prefer dedicated columns, fall back to JSONB for legacy rows
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
    id: b.id,
    bookingRef: b.bookingRef,
    userId: b.userId,
    userName: b.passengerName,
    userEmail: b.passengerEmail,
    userPhone: b.passengerPhone,
    serviceType: b.bookingType,
    title: b.title,
    amount: Number(b.totalPrice),
    baseFare,
    markupAmount,
    convenienceFee,
    status: b.status,
    bookingStatus: (b as any).bookingStatus ?? "confirmed",
    failureReason: (b as any).failureReason ?? null,
    failureCode: (b as any).failureCode ?? null,
    paymentMethod: b.paymentMethod,
    paymentStatus: b.paymentStatus,
    paymentId: b.paymentId,
    razorpayOrderId: b.razorpayOrderId,
    travelDate: b.travelDate,
    passengers: b.passengers,
    details: b.details,
    createdAt: b.createdAt.toISOString(),
    refund: refund
      ? {
          id: refund.id,
          status: refund.status,
          amount: Number(refund.amount),
          refundId: refund.refundId,
          errorMessage: refund.errorMessage,
          initiatedBy: refund.initiatedBy,
          createdAt: refund.createdAt.toISOString(),
          updatedAt: refund.updatedAt.toISOString(),
        }
      : null,
  };
}

// ── Helper: build BookingNotificationData from a DB row ─────────────────────
function buildNotificationData(b: typeof bookingsTable.$inferSelect): BookingNotificationData {
  const d = (b.details ?? {}) as Record<string, any>;
  return {
    bookingId:      b.bookingRef ?? String(b.id),
    bookingType:    (b.bookingType as "flight" | "bus" | "hotel" | "package"),
    passengerName:  b.passengerName,
    passengerEmail: b.passengerEmail || undefined,
    passengerPhone: b.passengerPhone || undefined,
    travelDate:     b.travelDate,
    totalAmount:    Number(b.totalPrice),
    paymentId:      b.paymentId ?? "",
    passengers:     b.passengers,
    title:          b.title || undefined,
    // flight
    from:           d.from || d.origin || d.departure?.airport || undefined,
    to:             d.to   || d.destination || d.arrival?.airport || undefined,
    airline:        d.airline || d.airlineName || undefined,
    flightNumber:   d.flightNumber || d.flight_number || undefined,
    flightDeparture: d.departureTime || d.departure?.time || undefined,
    flightArrival:   d.arrivalTime   || d.arrival?.time  || undefined,
    flightDuration:  d.duration      || undefined,
    // bus
    busOperator:    d.operator || d.busName || undefined,
    busType:        d.busType  || undefined,
    boardingPoint:  d.boardingPoint || undefined,
    droppingPoint:  d.droppingPoint || undefined,
    busDeparture:   d.departure || d.departureTime || undefined,
    busArrival:     d.arrival   || d.arrivalTime   || undefined,
    // hotel
    hotelName:  d.hotelName  || d.name   || undefined,
    hotelCity:  d.city       || d.hotelCity || undefined,
    hotelNights: d.nights    || undefined,
  };
}

// ── GET /api/admin/bookings ────────────────────────────────────────────────
// Optional query: ?search= ?status= ?type= ?paymentStatus= ?bookingStatus= ?limit= ?offset=
router.get("/admin/bookings", requireAdmin, async (req, res) => {
  try {
    const search        = (req.query.search        as string | undefined)?.trim() ?? "";
    const status        = (req.query.status        as string | undefined)?.trim() ?? "";
    const type          = (req.query.type          as string | undefined)?.trim() ?? "";
    const paymentFilter = (req.query.paymentStatus as string | undefined)?.trim() ?? "";
    const bookingFilter = (req.query.bookingStatus as string | undefined)?.trim() ?? "";
    const limit  = Math.min(Number(req.query.limit  ?? 200), 500);
    const offset = Math.max(Number(req.query.offset ?? 0),   0);

    const where = [] as Array<ReturnType<typeof eq>>;
    if (status && status !== "all" && isAllowedStatus(status)) {
      where.push(eq(bookingsTable.status, status));
    }
    if (paymentFilter && paymentFilter !== "all" &&
        (ALLOWED_PAYMENT_STATUSES as readonly string[]).includes(paymentFilter)) {
      where.push(eq(bookingsTable.paymentStatus, paymentFilter));
    }
    if (bookingFilter && bookingFilter !== "all" &&
        (ALLOWED_BOOKING_STATUSES as readonly string[]).includes(bookingFilter)) {
      where.push(eq((bookingsTable as any).bookingStatus, bookingFilter));
    }
    if (type && type !== "all") {
      where.push(eq(bookingsTable.bookingType, type));
    }
    if (search) {
      const pattern = `%${search}%`;
      const searchPredicate = or(
        ilike(bookingsTable.bookingRef, pattern),
        ilike(bookingsTable.passengerEmail, pattern),
        ilike(bookingsTable.passengerName, pattern),
        ilike(bookingsTable.passengerPhone, pattern),
        ilike(bookingsTable.paymentId, pattern),
        ilike(bookingsTable.razorpayOrderId, pattern),
      );
      if (searchPredicate) where.push(searchPredicate as never);
    }

    const baseQuery = db
      .select()
      .from(bookingsTable)
      .orderBy(desc(bookingsTable.id))
      .limit(limit)
      .offset(offset);

    const rows =
      where.length > 0
        ? await baseQuery.where(where.length === 1 ? where[0] : and(...where))
        : await baseQuery;

    const refundMap = await loadRefundsForBookings(rows.map((r) => r.id));
    const shaped = rows.map((b) => shapeBooking(b, refundMap.get(b.id)));

    return res.json({
      success: true,
      bookings: shaped,
      count: shaped.length,
    });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] list failed");
    return res.status(500).json({ success: false, error: "Failed to load bookings" });
  }
});

// ── GET /api/admin/bookings/:id ────────────────────────────────────────────
router.get("/admin/bookings/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: "Invalid booking id" });
    }
    const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }
    const refundMap = await loadRefundsForBookings([id]);
    return res.json({ success: true, booking: shapeBooking(rows[0], refundMap.get(id)) });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] get failed");
    return res.status(500).json({ success: false, error: "Failed to load booking" });
  }
});

// ── PUT /api/admin/bookings/:id/status ─────────────────────────────────────
router.put("/admin/bookings/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: "Invalid booking id" });
    }
    const newStatus = (req.body?.status ?? "") as string;
    if (!isAllowedStatus(newStatus)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
      });
    }

    const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    await db.update(bookingsTable).set({ status: newStatus }).where(eq(bookingsTable.id, id));

    const updated = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .limit(1);
    const refundMap = await loadRefundsForBookings([id]);
    return res.json({
      success: true,
      booking: shapeBooking(updated[0], refundMap.get(id)),
    });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] update status failed");
    return res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

// ── PUT /api/admin/bookings/:id/convert-lead ────────────────────────────────
// Manually converts a pending/failed lead into a confirmed booking.
// Use this when payment was collected offline (cash, bank transfer, UPI, etc.)
// or when the Razorpay gateway failed but money was received by another means.
router.put("/admin/bookings/:id/convert-lead", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: "Invalid booking id" });
    }

    const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    const booking = rows[0];

    // Refuse to re-convert an already paid/confirmed booking
    if (booking.paymentStatus === "paid" && booking.status === "confirmed") {
      return res.status(409).json({ success: false, error: "Booking is already confirmed" });
    }

    const paymentMethod = String(req.body?.paymentMethod || "manual").trim();
    const note          = String(req.body?.note || "").trim();
    const adminUser     = String((req as any).adminUser?.email || "admin");

    // Merge the conversion note into the existing details blob
    const existingDetails = (typeof booking.details === "object" && booking.details !== null)
      ? (booking.details as Record<string, any>)
      : {};
    const conversionLog = {
      convertedAt:   new Date().toISOString(),
      convertedBy:   adminUser,
      paymentMethod,
      note: note || "Manually converted by admin",
    };
    const updatedDetails = {
      ...existingDetails,
      conversionLog,
      adminNotes: [
        ...(existingDetails.adminNotes || []),
        { note: `Lead converted — ${paymentMethod}${note ? `: ${note}` : ""}`, addedAt: new Date().toISOString(), addedBy: adminUser },
      ],
    };

    await db
      .update(bookingsTable)
      .set({
        paymentStatus: "paid",
        status:        "confirmed",
        bookingStatus: "confirmed",
        paymentMethod,
        details: updatedDetails,
        // Clear failure markers so the booking is treated as clean
        failureReason: null,
        failureCode:   null,
      } as any)
      .where(eq(bookingsTable.id, id));

    const updated  = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    const refundMap = await loadRefundsForBookings([id]);

    logger.info({ id, paymentMethod, adminUser }, "[admin-bookings] lead converted to confirmed booking");

    return res.json({
      success: true,
      booking: shapeBooking(updated[0], refundMap.get(id)),
    });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] convert-lead failed");
    return res.status(500).json({ success: false, error: "Failed to convert lead" });
  }
});

// ── Razorpay credentials helper (DB row > env) ────────────────────────────
async function loadRazorpayCreds(): Promise<{
  keyId: string;
  keySecret: string;
  source: "db" | "env" | "mixed" | "none";
}> {
  let dbKey = "";
  let dbSecret = "";
  try {
    const rows = await db.select().from(apiKeysTable).limit(1);
    if (rows.length > 0) {
      dbKey = rows[0].paymentApiKey ?? "";
      dbSecret = rows[0].paymentApiSecret ?? "";
    }
  } catch {
    // table might not exist yet — fall through to env
  }
  const envKey = process.env["RAZORPAY_KEY_ID"] ?? "";
  const envSecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
  const keyId = dbKey || envKey;
  const keySecret = dbSecret || envSecret;
  let source: "db" | "env" | "mixed" | "none" = "none";
  if (keyId && keySecret) {
    if (dbKey && dbSecret) source = "db";
    else if (envKey && envSecret) source = "env";
    else source = "mixed";
  }
  return { keyId, keySecret, source };
}

// ── POST /api/admin/refund ─────────────────────────────────────────────────
// Body: { paymentId, amount, bookingId? }
router.post("/admin/refund", requireAdmin, async (req, res) => {
  const adminEmail = (req as Request & { admin?: { email?: string } }).admin?.email ?? "admin";

  try {
    const paymentId = String(req.body?.paymentId ?? "").trim();
    const amountRaw = req.body?.amount;
    const bookingIdRaw = req.body?.bookingId;

    if (!paymentId) {
      return res.status(400).json({ success: false, error: "paymentId is required" });
    }
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: "amount must be a positive number (in INR)" });
    }

    // Optional: locate the booking so we can keep its status in sync.
    let booking: typeof bookingsTable.$inferSelect | null = null;
    if (bookingIdRaw !== undefined) {
      const id = Number(bookingIdRaw);
      if (Number.isFinite(id)) {
        const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
        if (rows.length > 0) booking = rows[0];
      }
    }
    if (!booking) {
      const rows = await db
        .select()
        .from(bookingsTable)
        .where(eq(bookingsTable.paymentId, paymentId))
        .limit(1);
      if (rows.length > 0) booking = rows[0];
    }

    // 1. Insert a "processing" refund row up-front so the admin sees progress.
    const inserted = await db
      .insert(bookingRefundsTable)
      .values({
        bookingId: booking?.id ?? 0,
        paymentId,
        amount: amount.toFixed(2),
        currency: "INR",
        status: "processing",
        initiatedBy: adminEmail,
      })
      .returning();
    const refundRow = inserted[0];

    // 2. Call Razorpay (or run demo mode if creds absent).
    const { keyId, keySecret, source } = await loadRazorpayCreds();
    const isDemo = !keyId || !keySecret || paymentId.startsWith("demo_");

    let finalStatus: "completed" | "failed" = "completed";
    let providerRefundId: string | null = null;
    let errorMessage: string | null = null;

    if (isDemo) {
      providerRefundId = `rfnd_demo_${Date.now()}`;
      logger.info({ paymentId, amount, source }, "[admin-bookings] demo refund");
    } else {
      try {
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        const response = await fetch(
          `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: Math.round(amount * 100), // paise
              speed: "normal",
              notes: {
                booking_id: String(booking?.id ?? ""),
                booking_ref: booking?.bookingRef ?? "",
                initiated_by: adminEmail,
              },
            }),
          },
        );
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          const errObj = (json?.error as Record<string, unknown> | undefined) ?? {};
          errorMessage =
            (errObj?.description as string) ||
            (errObj?.reason as string) ||
            `Razorpay error ${response.status}`;
          finalStatus = "failed";
          logger.error({ status: response.status, json }, "[admin-bookings] razorpay refund failed");
        } else {
          providerRefundId = (json?.id as string) ?? null;
          const status = (json?.status as string) ?? "processed";
          finalStatus = status === "failed" ? "failed" : "completed";
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : "Refund request failed";
        finalStatus = "failed";
        logger.error({ err }, "[admin-bookings] razorpay request threw");
      }
    }

    // 3. Update the refund row with the final outcome.
    await db
      .update(bookingRefundsTable)
      .set({
        status: finalStatus,
        refundId: providerRefundId,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(bookingRefundsTable.id, refundRow.id));

    // 4. If completed and we know the booking, mark it refunded.
    if (finalStatus === "completed" && booking) {
      await db
        .update(bookingsTable)
        .set({ status: "refunded" })
        .where(eq(bookingsTable.id, booking.id));
    }

    return res.json({
      success: finalStatus === "completed",
      refund: {
        id: refundRow.id,
        bookingId: booking?.id ?? null,
        paymentId,
        amount,
        currency: "INR",
        status: finalStatus,
        refundId: providerRefundId,
        errorMessage,
        demo: isDemo,
        source,
      },
    });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] refund failed");
    return res.status(500).json({ success: false, error: "Refund failed" });
  }
});

// ── POST /api/admin/bookings/:id/resend ──────────────────────────────────────
// Body: { channel: "email" | "sms" | "whatsapp" | "all" }
router.post("/admin/bookings/:id/resend", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: "Invalid booking id" });
    }
    const channel = String(req.body?.channel ?? "all").trim().toLowerCase();
    if (!["email", "sms", "whatsapp", "all"].includes(channel)) {
      return res.status(400).json({ success: false, error: "channel must be email | sms | whatsapp | all" });
    }

    const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }
    const booking = rows[0];
    const data = buildNotificationData(booking);

    let results: Record<string, { sent: boolean; reason?: string }> = {};

    if (channel === "all") {
      results = await sendAllBookingNotifications(data);
    } else if (channel === "email") {
      results.email = await sendBookingEmail(data);
    } else if (channel === "sms") {
      results.sms = await sendBookingSMS(data);
    } else if (channel === "whatsapp") {
      results.whatsapp = await sendBookingWhatsApp(data);
    }

    logger.info({ id, channel, results }, "[admin-bookings] resend notifications");
    return res.json({ success: true, channel, results });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] resend failed");
    return res.status(500).json({ success: false, error: "Resend failed" });
  }
});

// ── POST /api/admin/bookings/:id/mark-failed ─────────────────────────────────
// Marks a booking as failed (bookingStatus=failed), optionally auto-refunds via Razorpay,
// and sends customer notifications.
// Body: { reason: string, code?: string, initiateRefund?: boolean }
router.post("/admin/bookings/:id/mark-failed", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: "Invalid booking id" });

    const reason        = String(req.body?.reason ?? "Booking failed").trim();
    const code          = String(req.body?.code   ?? "api_error").trim();
    const doRefund      = req.body?.initiateRefund !== false; // default true

    const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ success: false, error: "Booking not found" });
    const booking = rows[0];

    // Update booking to failed — use cast since new columns may not be in generated types yet
    await db.update(bookingsTable).set({
      status:        "booking_failed",
      bookingStatus: "failed",
      failureReason: reason,
      failureCode:   code,
    } as any).where(eq(bookingsTable.id, id));

    let refundResult: { initiated: boolean; refundId?: string; error?: string } = { initiated: false };

    if (doRefund && booking.paymentStatus === "paid" && booking.paymentId) {
      const totalPrice = Number(booking.totalPrice);
      const [refundRow] = await db.insert(bookingRefundsTable).values({
        bookingId:   id,
        paymentId:   booking.paymentId,
        amount:      totalPrice.toFixed(2),
        currency:    "INR",
        status:      "processing",
        initiatedBy: "admin_mark_failed",
      }).returning();

      const { keyId, keySecret } = await loadRazorpayCreds();
      const isDemo = !keyId || !keySecret || booking.paymentId.startsWith("demo_");

      let finalStatus: "completed" | "failed" = "completed";
      let providerRefundId: string | null = null;
      let errorMessage: string | null = null;

      if (isDemo) {
        providerRefundId = `rfnd_demo_${Date.now()}`;
      } else {
        try {
          const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
          const resp = await fetch(
            `https://api.razorpay.com/v1/payments/${encodeURIComponent(booking.paymentId)}/refund`,
            {
              method: "POST",
              headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                amount: Math.round(totalPrice * 100),
                speed: "normal",
                notes: { booking_id: String(id), reason, initiated_by: "admin_mark_failed" },
              }),
            },
          );
          const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
          if (!resp.ok) {
            const e = (json?.error as Record<string, unknown> | undefined) ?? {};
            errorMessage = (e?.description as string) || `Razorpay error ${resp.status}`;
            finalStatus = "failed";
          } else {
            providerRefundId = (json?.id as string) ?? null;
            finalStatus = (json?.status as string) === "failed" ? "failed" : "completed";
          }
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : "Refund failed";
          finalStatus = "failed";
        }
      }

      await db.update(bookingRefundsTable)
        .set({ status: finalStatus, refundId: providerRefundId, errorMessage, updatedAt: new Date() })
        .where(eq(bookingRefundsTable.id, refundRow.id));

      if (finalStatus === "completed") {
        await db.update(bookingsTable).set({ status: "refunded" }).where(eq(bookingsTable.id, id));
      }

      refundResult = { initiated: finalStatus === "completed", refundId: providerRefundId ?? undefined, error: errorMessage ?? undefined };

      // Notify customer — failure + refund initiated
      const notifData = buildNotificationData(booking);
      sendBookingFailureNotifications(notifData, reason).catch(() => {});
      if (finalStatus === "completed") {
        sendRefundNotifications(notifData, "initiated", providerRefundId ?? undefined).catch(() => {});
      }
    }

    const updated = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    const refundMap = await loadRefundsForBookings([id]);
    logger.info({ id, reason, refundResult }, "[admin-bookings] mark-failed done");
    return res.json({
      success: true,
      booking: shapeBooking(updated[0], refundMap.get(id)),
      refund: refundResult,
    });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] mark-failed failed");
    return res.status(500).json({ success: false, error: "Failed to mark booking as failed" });
  }
});

// ── GET /api/admin/refund-logs ────────────────────────────────────────────────
// Returns all refund records joined with basic booking info.
router.get("/admin/refund-logs", requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit  ?? 200), 500);
    const offset = Math.max(Number(req.query.offset ?? 0),   0);
    const statusFilter = (req.query.status as string | undefined)?.trim() ?? "";

    let query = db
      .select()
      .from(bookingRefundsTable)
      .orderBy(desc(bookingRefundsTable.id))
      .limit(limit)
      .offset(offset);

    const rows = await (statusFilter && statusFilter !== "all"
      ? query.where(eq(bookingRefundsTable.status, statusFilter))
      : query);

    // Load matching bookings
    const bookingIds = [...new Set(rows.map((r) => r.bookingId).filter((x) => x > 0))];
    const bookingMap = new Map<number, typeof bookingsTable.$inferSelect>();
    if (bookingIds.length > 0) {
      const bRows = await db.select().from(bookingsTable).where(inArray(bookingsTable.id, bookingIds));
      for (const b of bRows) bookingMap.set(b.id, b);
    }

    const shaped = rows.map((r) => {
      const b = bookingMap.get(r.bookingId);
      return {
        id:           r.id,
        bookingId:    r.bookingId,
        bookingRef:   b?.bookingRef ?? null,
        paymentId:    r.paymentId,
        refundId:     r.refundId,
        amount:       Number(r.amount),
        currency:     r.currency,
        status:       r.status,
        errorMessage: r.errorMessage,
        initiatedBy:  r.initiatedBy,
        createdAt:    r.createdAt.toISOString(),
        updatedAt:    r.updatedAt.toISOString(),
        // booking context
        passengerName:  b?.passengerName  ?? null,
        passengerEmail: b?.passengerEmail ?? null,
        passengerPhone: b?.passengerPhone ?? null,
        bookingType:    b?.bookingType    ?? null,
        bookingAmount:  b ? Number(b.totalPrice) : null,
        paymentStatus:  b?.paymentStatus  ?? null,
      };
    });

    return res.json({ success: true, refundLogs: shaped, count: shaped.length });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] refund-logs failed");
    return res.status(500).json({ success: false, error: "Failed to load refund logs" });
  }
});

// ── POST /api/admin/bookings/:id/notes ───────────────────────────────────────
// Body: { note: string }
// Appends an admin note to details.adminNotes[].
router.post("/admin/bookings/:id/notes", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: "Invalid booking id" });
    }
    const note = String(req.body?.note ?? "").trim();
    if (!note) {
      return res.status(400).json({ success: false, error: "note is required" });
    }
    const adminEmail = (req as any).admin?.email ?? "admin";

    const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }
    const booking = rows[0];
    const existingDetails = (booking.details ?? {}) as Record<string, any>;
    const adminNotes: Array<{ note: string; addedAt: string; addedBy: string }> =
      Array.isArray(existingDetails.adminNotes) ? existingDetails.adminNotes : [];

    const newNote = { note, addedAt: new Date().toISOString(), addedBy: adminEmail };
    adminNotes.push(newNote);

    await db
      .update(bookingsTable)
      .set({ details: { ...existingDetails, adminNotes } })
      .where(eq(bookingsTable.id, id));

    logger.info({ id, addedBy: adminEmail }, "[admin-bookings] note added");
    return res.json({ success: true, note: newNote, adminNotes });
  } catch (err) {
    logger.error({ err }, "[admin-bookings] add note failed");
    return res.status(500).json({ success: false, error: "Failed to add note" });
  }
});

export default router;
