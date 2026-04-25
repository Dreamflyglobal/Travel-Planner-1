/**
 * Push Notification Routes
 *
 * POST /api/push/register       — save FCM token to DB
 * DELETE /api/push/unregister   — mark token inactive
 * POST /api/push/send           — send to all active tokens (admin-only, no auth guard for now)
 * POST /api/push/send-welcome   — send welcome to a specific token
 * POST /api/push/broadcast      — broadcast daily offers to all tokens
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, pushTokensTable, pushNotificationsLogTable } from "@workspace/db";
import { sendPushToToken, sendPushToTokens } from "../lib/firebase-admin.js";

const router = Router();

const DOMAIN = () => {
  const d = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0];
  return d ? `https://${d}` : "http://localhost:5000";
};

// ── POST /push/register ───────────────────────────────────────────────────────
router.post("/push/register", async (req, res): Promise<void> => {
  try {
    const { token, userId, phone, email, name, platform = "web" } = req.body as {
      token: string; userId?: string; phone?: string; email?: string;
      name?: string; platform?: string;
    };

    if (!token) { res.status(400).json({ error: "token required" }); return; }

    const existing = await db.select().from(pushTokensTable).where(eq(pushTokensTable.token, token));

    if (existing.length > 0) {
      const [updated] = await db
        .update(pushTokensTable)
        .set({ userId: userId ?? existing[0].userId, phone: phone ?? existing[0].phone,
               email: email ?? existing[0].email, name: name ?? existing[0].name,
               active: true, updatedAt: new Date() })
        .where(eq(pushTokensTable.token, token))
        .returning();
      res.json({ registered: true, id: updated.id, existing: true });
      return;
    }

    const [created] = await db
      .insert(pushTokensTable)
      .values({ token, userId: userId ?? null, phone: phone ?? null,
                email: email ?? null, name: name ?? null, platform })
      .returning();

    // Send welcome notification (fire-and-forget)
    sendPushToToken({
      token,
      title: "Welcome to Dream Fly Global! ✈️",
      body: "Explore flights, hotels, and holiday packages. Great deals await you!",
      url: DOMAIN(),
    }).then(async (result) => {
      await db.insert(pushNotificationsLogTable).values({
        token, type: "welcome",
        title: "Welcome to Dream Fly Global! ✈️",
        body: "Explore flights, hotels, and holiday packages. Great deals await you!",
        status: result.sent ? "sent" : "failed",
        error: result.reason ?? null,
      }).catch(() => {});
    }).catch(() => {});

    res.status(201).json({ registered: true, id: created.id });
  } catch (err: any) {
    console.error("[push] register error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /push/unregister ───────────────────────────────────────────────────
router.delete("/push/unregister", async (req, res): Promise<void> => {
  try {
    const { token } = req.body as { token: string };
    if (!token) { res.status(400).json({ error: "token required" }); return; }

    await db.update(pushTokensTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(pushTokensTable.token, token));

    res.json({ unregistered: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /push/send-booking-confirmation ──────────────────────────────────────
router.post("/push/send-booking-confirmation", async (req, res): Promise<void> => {
  try {
    const { token, userId, phone, bookingId, route, amount } = req.body as {
      token?: string; userId?: string; phone?: string;
      bookingId: string; route: string; amount: number;
    };

    let tokens: string[] = [];

    if (token) {
      tokens = [token];
    } else if (userId || phone) {
      const rows = await db.select().from(pushTokensTable).where(
        and(eq(pushTokensTable.active, true),
            userId ? eq(pushTokensTable.userId, userId) : eq(pushTokensTable.phone, phone!))
      );
      tokens = rows.map((r) => r.token);
    }

    if (tokens.length === 0) { res.json({ sent: 0, reason: "No tokens found" }); return; }

    const title = "Booking Confirmed! 🎉";
    const body  = `${route} | Booking ID: ${bookingId} | ₹${amount.toLocaleString("en-IN")} paid`;

    const { sent, failed, expiredTokens } = await sendPushToTokens(tokens, {
      title, body, url: `${DOMAIN()}/my-bookings`,
    });

    // Deactivate expired tokens
    if (expiredTokens.length > 0) {
      await Promise.all(expiredTokens.map((t) =>
        db.update(pushTokensTable).set({ active: false }).where(eq(pushTokensTable.token, t))
      ));
    }

    await db.insert(pushNotificationsLogTable).values(
      tokens.map((t) => ({ token: t, type: "booking_confirmation", title, body,
        status: expiredTokens.includes(t) ? "expired" : "sent" }))
    ).catch(() => {});

    res.json({ sent, failed });
  } catch (err: any) {
    console.error("[push] booking-confirmation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /push/broadcast ──────────────────────────────────────────────────────
// Broadcast a daily offer to ALL active tokens (called by admin or scheduled job)
router.post("/push/broadcast", async (req, res): Promise<void> => {
  try {
    const { title, body, url } = req.body as { title: string; body: string; url?: string };

    if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }

    const rows = await db.select().from(pushTokensTable).where(eq(pushTokensTable.active, true));
    const tokens = rows.map((r) => r.token);

    if (tokens.length === 0) { res.json({ sent: 0, total: 0, reason: "No active tokens" }); return; }

    const { sent, failed, expiredTokens } = await sendPushToTokens(tokens, {
      title, body, url: url || DOMAIN(),
    });

    if (expiredTokens.length > 0) {
      await Promise.all(expiredTokens.map((t) =>
        db.update(pushTokensTable).set({ active: false }).where(eq(pushTokensTable.token, t))
      ));
    }

    await db.insert(pushNotificationsLogTable).values(
      tokens.map((t) => ({ token: t, type: "broadcast", title, body,
        status: expiredTokens.includes(t) ? "expired" : "sent" }))
    ).catch(() => {});

    res.json({ sent, failed, total: tokens.length, expiredDeactivated: expiredTokens.length });
  } catch (err: any) {
    console.error("[push] broadcast error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /push/stats ───────────────────────────────────────────────────────────
router.get("/push/stats", async (req, res): Promise<void> => {
  try {
    const all = await db.select().from(pushTokensTable);
    const active = all.filter((r) => r.active).length;
    const logs   = await db.select().from(pushNotificationsLogTable);
    const byType = logs.reduce<Record<string, number>>((acc, l) => {
      acc[l.type] = (acc[l.type] || 0) + 1;
      return acc;
    }, {});
    res.json({ totalTokens: all.length, activeTokens: active, notificationsByType: byType });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
