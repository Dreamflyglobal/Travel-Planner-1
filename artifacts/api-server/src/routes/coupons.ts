import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, couponsTable, couponUsageTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToCoupon(row: typeof couponsTable.$inferSelect) {
  return {
    code:             row.code,
    discount:         Number(row.discount),
    discountType:     row.discountType as "fixed" | "percentage",
    type:             row.type as "public" | "welcome" | "user_specific",
    allowed_phone:    row.allowedPhone  ?? undefined,
    validUntil:       row.validUntil,
    usageLimit:       row.usageLimit    ?? 0,
    minBookingAmount: Number(row.minBookingAmount ?? 0),
    service_type:     (row.serviceType  ?? undefined) as any,
    flight_type:      (row.flightType   ?? undefined) as any,
    airline:          row.airline       ?? undefined,
    description:      row.description   ?? undefined,
    used_by:          [],               // populated by client from usage records
  };
}

// ── GET /coupons — list all coupons ──────────────────────────────────────────
router.get("/coupons", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
    res.json(rows.map(rowToCoupon));
  } catch (err) {
    logger.error({ err }, "[coupons] failed to list coupons");
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// ── POST /coupons — create coupon ─────────────────────────────────────────────
router.post("/coupons", async (req, res): Promise<void> => {
  try {
    const b = req.body;
    const code = String(b.code ?? "").trim().toUpperCase();
    if (!code) { res.status(400).json({ error: "code is required" }); return; }

    const discount = Number(b.discount);
    if (isNaN(discount) || discount <= 0) {
      res.status(400).json({ error: "discount must be > 0" }); return;
    }

    const validUntil = String(b.validUntil ?? "").trim();
    if (!validUntil) { res.status(400).json({ error: "validUntil is required" }); return; }

    // Check duplicate
    const [existing] = await db.select({ code: couponsTable.code })
      .from(couponsTable).where(eq(couponsTable.code, code)).limit(1);
    if (existing) { res.status(409).json({ error: `Coupon "${code}" already exists` }); return; }

    const [inserted] = await db.insert(couponsTable).values({
      code,
      discount:         String(discount),
      discountType:     b.discountType === "percentage" ? "percentage" : "fixed",
      type:             ["public","welcome","user_specific"].includes(b.type) ? b.type : "public",
      allowedPhone:     b.allowed_phone  ? String(b.allowed_phone).trim()  : null,
      validUntil,
      usageLimit:       Number(b.usageLimit ?? 0)        || 0,
      minBookingAmount: String(Number(b.minBookingAmount ?? 0) || 0),
      serviceType:      b.service_type   ? String(b.service_type)          : null,
      flightType:       b.flight_type    ? String(b.flight_type)           : null,
      airline:          b.airline        ? String(b.airline).trim()        : null,
      description:      b.description    ? String(b.description).trim()    : null,
    }).returning();

    logger.info({ code }, "[coupons] created");
    res.status(201).json(rowToCoupon(inserted));
  } catch (err) {
    logger.error({ err }, "[coupons] failed to create coupon");
    res.status(500).json({ error: "Failed to create coupon" });
  }
});

// ── DELETE /coupons/:code — remove coupon ─────────────────────────────────────
router.delete("/coupons/:code", async (req, res): Promise<void> => {
  try {
    const code = req.params.code?.trim().toUpperCase();
    if (!code) { res.status(400).json({ error: "code is required" }); return; }

    const deleted = await db.delete(couponsTable).where(eq(couponsTable.code, code)).returning();
    if (deleted.length === 0) { res.status(404).json({ error: "Coupon not found" }); return; }

    logger.info({ code }, "[coupons] deleted");
    res.json({ success: true, code });
  } catch (err) {
    logger.error({ err }, "[coupons] failed to delete coupon");
    res.status(500).json({ error: "Failed to delete coupon" });
  }
});

// ── POST /coupons/usage — record a coupon redemption ──────────────────────────
router.post("/coupons/usage", async (req, res): Promise<void> => {
  try {
    const code  = String(req.body.code  ?? "").trim().toUpperCase();
    const phone = String(req.body.phone ?? "").trim();
    if (!code || !phone) { res.status(400).json({ error: "code and phone are required" }); return; }

    const normalised = phone.replace(/\D/g, "").slice(-10);

    const [inserted] = await db.insert(couponUsageTable)
      .values({ code, phone: normalised }).returning();

    logger.info({ code, phone: normalised }, "[coupons] usage recorded");
    res.status(201).json({ success: true, id: inserted.id });
  } catch (err) {
    logger.error({ err }, "[coupons] failed to record usage");
    res.status(500).json({ error: "Failed to record usage" });
  }
});

// ── GET /coupons/usage/counts — usage count per code ──────────────────────────
router.get("/coupons/usage/counts", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        code:  couponUsageTable.code,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(couponUsageTable)
      .groupBy(couponUsageTable.code);

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.code] = r.count;
    res.json(counts);
  } catch (err) {
    logger.error({ err }, "[coupons] failed to fetch usage counts");
    res.status(500).json({ error: "Failed to fetch usage counts" });
  }
});

// ── GET /coupons/usage — full usage list ──────────────────────────────────────
router.get("/coupons/usage", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({ code: couponUsageTable.code, phone: couponUsageTable.phone })
      .from(couponUsageTable)
      .orderBy(desc(couponUsageTable.createdAt));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "[coupons] failed to fetch usage");
    res.status(500).json({ error: "Failed to fetch coupon usage" });
  }
});

export default router;
