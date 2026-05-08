import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { eq, desc, or } from "drizzle-orm";
import { db, usersTable, bookingsTable } from "@workspace/db";

const router: IRouter = Router();

// ── GET /api/users ─────────────────────────────────────────────────────────────
// Returns all users enriched with per-user booking stats
router.get("/users", async (_req, res): Promise<void> => {
  try {
    const [users, bookings] = await Promise.all([
      db.select().from(usersTable).orderBy(desc(usersTable.createdAt)),
      db.select({
        id:            bookingsTable.id,
        userId:        bookingsTable.userId,
        passengerEmail: bookingsTable.passengerEmail,
        passengerPhone: bookingsTable.passengerPhone,
        bookingType:   bookingsTable.bookingType,
        totalPrice:    bookingsTable.totalPrice,
        status:        bookingsTable.status,
        paymentStatus: bookingsTable.paymentStatus,
        createdAt:     bookingsTable.createdAt,
        bookingRef:    bookingsTable.bookingRef,
        title:         bookingsTable.title,
        travelDate:    bookingsTable.travelDate,
      }).from(bookingsTable).orderBy(desc(bookingsTable.createdAt)),
    ]);

    // A userId is "real" (numeric) only if it parses to a positive integer.
    // Legacy auto-generated IDs look like "auto_1778055425448" — treat them as unlinked.
    const isRealUserId = (uid: string | null): boolean =>
      !!uid && /^\d+$/.test(uid.trim()) && parseInt(uid, 10) > 0;

    // Build booking index by userId for fast lookup (real numeric IDs only)
    const bookingsByUserId = new Map<string, typeof bookings>();
    for (const b of bookings) {
      if (!isRealUserId(b.userId)) continue;
      const key = b.userId!.trim();
      if (!bookingsByUserId.has(key)) bookingsByUserId.set(key, []);
      bookingsByUserId.get(key)!.push(b);
    }

    // Build email + phone index for unlinked bookings fallback
    // Includes both truly unlinked (null userId) and legacy auto_XXX ids
    const bookingsByEmail = new Map<string, typeof bookings>();
    const bookingsByPhone = new Map<string, typeof bookings>();
    for (const b of bookings) {
      if (isRealUserId(b.userId)) continue; // already indexed by userId
      if (b.passengerEmail) {
        const e = b.passengerEmail.toLowerCase();
        if (!bookingsByEmail.has(e)) bookingsByEmail.set(e, []);
        bookingsByEmail.get(e)!.push(b);
      }
      if (b.passengerPhone) {
        const p = b.passengerPhone.replace(/\D/g, "").slice(-10);
        if (!bookingsByPhone.has(p)) bookingsByPhone.set(p, []);
        bookingsByPhone.get(p)!.push(b);
      }
    }

    const enriched = users.map((u) => {
      const uid = String(u.id);

      // Gather bookings: by userId, then fallback by email/phone
      const seen = new Set<number>();
      const userBks: typeof bookings = [];

      const addBooking = (b: (typeof bookings)[0]) => {
        if (!seen.has(b.id)) { seen.add(b.id); userBks.push(b); }
      };

      (bookingsByUserId.get(uid) || []).forEach(addBooking);

      if (u.email) {
        (bookingsByEmail.get(u.email.toLowerCase()) || []).forEach(addBooking);
      }
      if (u.phone) {
        const p = u.phone.replace(/\D/g, "").slice(-10);
        (bookingsByPhone.get(p) || []).forEach(addBooking);
      }

      // Stats
      const totalBookings = userBks.length;
      const totalSpend    = userBks.reduce((s, b) => s + Number(b.totalPrice ?? 0), 0);
      const lastBooking   = userBks[0]?.createdAt?.toISOString() ?? null;

      const bookingTypes = [...new Set(userBks.map((b) => b.bookingType).filter(Boolean))];

      const recentBookings = userBks.slice(0, 20).map((b) => ({
        id:           b.id,
        bookingRef:   b.bookingRef,
        bookingType:  b.bookingType,
        title:        b.title,
        totalPrice:   Number(b.totalPrice ?? 0),
        status:       b.status,
        paymentStatus: b.paymentStatus,
        travelDate:   b.travelDate,
        createdAt:    b.createdAt.toISOString(),
      }));

      return {
        id:            u.id,
        name:          u.name,
        email:         u.email ?? null,
        phone:         u.phone ?? null,
        role:          u.role,
        isApproved:    u.isApproved,
        walletBalance: Number(u.walletBalance ?? 0),
        agentCode:     u.agentCode ?? null,
        agencyName:    u.agencyName ?? null,
        referralCode:  u.referralCode ?? null,
        otpUser:       u.otpUser,
        createdAt:     u.createdAt.toISOString(),
        updatedAt:     u.updatedAt.toISOString(),
        // Booking stats
        totalBookings,
        totalSpend,
        lastBooking,
        bookingTypes,
        recentBookings,
      };
    });

    res.json(enriched);
  } catch (err) {
    logger.error({ err }, "Failed to fetch users");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ── POST /api/users/sync-from-bookings ─────────────────────────────────────────
// Creates/links user accounts for any booking that has no userId set.
// Safe to call multiple times (idempotent).
router.post("/users/sync-from-bookings", async (_req, res): Promise<void> => {
  try {
    // Get bookings without a userId
    const allBookings = await db
      .select({
        id:            bookingsTable.id,
        userId:        bookingsTable.userId,
        passengerName: bookingsTable.passengerName,
        passengerEmail: bookingsTable.passengerEmail,
        passengerPhone: bookingsTable.passengerPhone,
      })
      .from(bookingsTable);

    // Treat both null AND legacy "auto_XXX" userIds as unlinked
    const isRealId = (uid: string | null) => !!uid && /^\d+$/.test(uid.trim()) && parseInt(uid, 10) > 0;
    const unlinked = allBookings.filter((b) => !isRealId(b.userId));
    let created = 0, linked = 0, skipped = 0;

    for (const booking of unlinked) {
      const phone = booking.passengerPhone?.trim() || null;
      const email = booking.passengerEmail?.trim().toLowerCase() || null;
      const name  = booking.passengerName  || "Guest";

      if (!phone && !email) { skipped++; continue; }

      // Find existing user
      let userId: number | null = null;

      if (phone) {
        const [byPhone] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.phone, phone))
          .limit(1);
        if (byPhone) userId = byPhone.id;
      }

      if (!userId && email) {
        const [byEmail] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(1);
        if (byEmail) userId = byEmail.id;
      }

      if (!userId) {
        // Create new user
        try {
          const [newUser] = await db
            .insert(usersTable)
            .values({ name, phone, email, role: "user", isApproved: false, otpUser: !!phone })
            .returning({ id: usersTable.id });
          userId = newUser.id;
          created++;
        } catch {
          skipped++; // duplicate constraint — already exists
          continue;
        }
      } else {
        linked++;
      }

      // Update booking with the resolved userId
      await db
        .update(bookingsTable)
        .set({ userId: String(userId) })
        .where(eq(bookingsTable.id, booking.id));
    }

    logger.info({ created, linked, skipped, total: unlinked.length }, "sync-from-bookings complete");
    res.json({ success: true, total: unlinked.length, created, linked, skipped });
  } catch (err) {
    logger.error({ err }, "sync-from-bookings failed");
    res.status(500).json({ error: "Sync failed" });
  }
});

// ── PATCH /api/users/:id ────────────────────────────────────────────────────────
// Update user profile fields: name, email, phone, role, isApproved
router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const { name, email, phone, role, isApproved, walletBalance } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name          !== undefined) updates.name          = name;
  if (email         !== undefined) updates.email         = email || null;
  if (phone         !== undefined) updates.phone         = phone || null;
  if (role          !== undefined) updates.role          = role;
  if (isApproved    !== undefined) updates.isApproved    = isApproved;
  if (walletBalance !== undefined) updates.walletBalance = String(walletBalance);

  try {
    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, user: { ...updated, walletBalance: Number(updated.walletBalance ?? 0) } });
  } catch (err) {
    logger.error({ err }, "Failed to update user");
    res.status(500).json({ error: "Failed to update user" });
  }
});

// ── POST /api/users/merge-duplicates ──────────────────────────────────────────
// Finds users with the same phone or same email, merges all bookings to the
// oldest account (lowest id), then deletes the duplicate records.
// Safe to run multiple times (idempotent).
router.post("/users/merge-duplicates", async (_req, res): Promise<void> => {
  try {
    const allUsers = await db
      .select({ id: usersTable.id, phone: usersTable.phone, email: usersTable.email })
      .from(usersTable)
      .orderBy(usersTable.id); // oldest first → keep lowest id

    let mergedPairs = 0;
    let deletedUsers = 0;

    // Track which ids have already been merged away so we don't process twice
    const deleted = new Set<number>();

    for (let i = 0; i < allUsers.length; i++) {
      if (deleted.has(allUsers[i].id)) continue;
      const primary = allUsers[i];

      for (let j = i + 1; j < allUsers.length; j++) {
        if (deleted.has(allUsers[j].id)) continue;
        const dup = allUsers[j];

        const samePhone = primary.phone && dup.phone && primary.phone === dup.phone;
        const sameEmail = primary.email && dup.email && primary.email.toLowerCase() === dup.email.toLowerCase();

        if (!samePhone && !sameEmail) continue;

        // Re-link all of dup's bookings to primary
        await db
          .update(bookingsTable)
          .set({ userId: String(primary.id) })
          .where(eq(bookingsTable.userId, String(dup.id)));

        // Also re-link by phone/email for any legacy unlinked bookings
        if (dup.phone) {
          await db
            .update(bookingsTable)
            .set({ userId: String(primary.id) })
            .where(eq(bookingsTable.passengerPhone, dup.phone));
        }
        if (dup.email) {
          await db
            .update(bookingsTable)
            .set({ userId: String(primary.id) })
            .where(eq(bookingsTable.passengerEmail, dup.email));
        }

        // Safely delete the duplicate (nullify unique fields first to avoid constraint errors)
        await db
          .update(usersTable)
          .set({ phone: null, email: null })
          .where(eq(usersTable.id, dup.id));

        await db.delete(usersTable).where(eq(usersTable.id, dup.id));

        deleted.add(dup.id);
        deletedUsers++;
        mergedPairs++;

        logger.info({ primary: primary.id, duplicate: dup.id, samePhone, sameEmail }, "Merged duplicate user");
      }
    }

    res.json({ success: true, mergedPairs, deletedUsers });
  } catch (err) {
    logger.error({ err }, "merge-duplicates failed");
    res.status(500).json({ error: "Merge failed" });
  }
});

// ── GET /api/users/:id/bookings ────────────────────────────────────────────────
// Returns all bookings for a specific user (by userId or email/phone fallback)
router.get("/users/:id/bookings", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(eq(bookingsTable.userId, String(id)));
    if (user.email) conditions.push(eq(bookingsTable.passengerEmail, user.email));
    if (user.phone) conditions.push(eq(bookingsTable.passengerPhone, user.phone));

    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(or(...conditions)!)
      .orderBy(desc(bookingsTable.createdAt));

    const mapped = bookings.map((b) => ({
      ...b,
      totalPrice:       Number(b.totalPrice),
      commissionEarned: b.commissionEarned ? Number(b.commissionEarned) : null,
      createdAt:        b.createdAt.toISOString(),
      details:          b.details ?? undefined,
    }));

    // Deduplicate by id
    const seen = new Set<number>();
    const deduped = mapped.filter((b) => { if (seen.has(b.id)) return false; seen.add(b.id); return true; });

    res.json(deduped);
  } catch (err) {
    logger.error({ err }, "Failed to fetch user bookings");
    res.status(500).json({ error: "Failed to fetch user bookings" });
  }
});

export default router;
