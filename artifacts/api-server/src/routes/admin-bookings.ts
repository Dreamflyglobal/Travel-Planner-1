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

const router = Router();

const ALLOWED_STATUSES = ["pending", "confirmed", "cancelled", "refunded"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(s: unknown): s is AllowedStatus {
  return typeof s === "string" && (ALLOWED_STATUSES as readonly string[]).includes(s);
}

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
    status: b.status,
    paymentMethod: b.paymentMethod,
    paymentStatus: b.paymentStatus,
    paymentId: b.paymentId,
    razorpayOrderId: b.razorpayOrderId,
    travelDate: b.travelDate,
    passengers: b.passengers,
    details: b.details,
    refund: refund
      ? {
          id: refund.id,
          status: refund.status,
          amount: Number(refund.amount),
          refundId: refund.refundId,
          errorMessage: refund.errorMessage,
          createdAt: refund.createdAt.toISOString(),
        }
      : null,
  };
}

// ── GET /api/admin/bookings ────────────────────────────────────────────────
// Optional query: ?search= ?status= ?type= ?limit= ?offset=
router.get("/admin/bookings", requireAdmin, async (req, res) => {
  try {
    const search = (req.query.search as string | undefined)?.trim() ?? "";
    const status = (req.query.status as string | undefined)?.trim() ?? "";
    const type = (req.query.type as string | undefined)?.trim() ?? "";
    const limit = Math.min(Number(req.query.limit ?? 200), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    const where = [] as Array<ReturnType<typeof eq>>;
    if (status && status !== "all" && isAllowedStatus(status)) {
      where.push(eq(bookingsTable.status, status));
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

export default router;
