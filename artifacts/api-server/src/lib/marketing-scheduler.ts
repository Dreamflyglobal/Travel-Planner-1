/**
 * Automated Marketing Scheduler
 *
 * Handles 4 message types:
 *   1. welcome        — sent immediately on signup
 *   2. search_trigger — sent 10 min after a search (cancelled if user books first)
 *   3. booking_followup — sent 6 hours after a booking
 *   4. daily_offer    — sent once per day to all users with phone numbers
 *
 * All messages are logged in marketing_messages table.
 * User search/booking state is tracked in user_activity table.
 */

import { eq, and, sql } from "drizzle-orm";
import { db, userActivityTable, marketingMessagesTable, usersTable } from "@workspace/db";
import { sendRawMarketingWhatsApp } from "./marketing-whatsapp.js";

// ── In-memory timers ─────────────────────────────────────────────────────────
// key: `search:${userId}` or `booking:${userId}`
const timers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Message Templates ─────────────────────────────────────────────────────────

function welcomeMessage(name: string): string {
  const first = name.split(" ")[0];
  return (
    `✈️ *Welcome to Dream Fly Global, ${first}!* 🎉\n\n` +
    `We're thrilled to have you on board!\n\n` +
    `🔥 *What we offer:*\n` +
    `• Best flight deals across India\n` +
    `• Top-rated hotels at unbeatable prices\n` +
    `• Bus tickets with seat selection\n` +
    `• Holiday packages for every budget\n\n` +
    `Start exploring and book your next adventure today! 🌍\n\n` +
    `_Dream Fly Global ✈️ — Explore the World_`
  );
}

function searchTriggerMessage(name: string, searchType: string, from?: string, to?: string): string {
  const first = name.split(" ")[0];
  const route = from && to ? ` (${from} → ${to})` : "";
  const typeLabel =
    searchType === "flight" ? "flight" :
    searchType === "hotel"  ? "hotel"  :
    searchType === "bus"    ? "bus"    : "travel";
  return (
    `⚡ *Hi ${first}, prices are moving fast!*\n\n` +
    `🔥 The ${typeLabel} you searched${route} is getting popular.\n\n` +
    `Prices may increase soon — book now and lock in your deal before it's gone!\n\n` +
    `💸 *Save money by booking today:*\n` +
    `👉 Open the Dream Fly Global app now\n\n` +
    `_Dream Fly Global ✈️ — Don't miss out!_`
  );
}

function bookingFollowUpMessage(name: string, bookingType: string, from?: string, to?: string): string {
  const first = name.split(" ")[0];
  const isHotel = bookingType === "hotel";
  if (isHotel) {
    return (
      `🏨 *Hi ${first}, planning more of your trip?*\n\n` +
      `Great choice staying with us! 😊\n\n` +
      `Don't forget to book your *flights and transport* to complete your travel plan!\n\n` +
      `🔍 Search now for the best deals on Dream Fly Global:\n` +
      `• ✈️ Flights\n` +
      `• 🚌 Bus tickets\n` +
      `• 🏖️ Holiday packages\n\n` +
      `_Dream Fly Global ✈️ — Your complete travel partner_`
    );
  }
  const route = from && to ? `${to} → ${from}` : "your destination";
  return (
    `🎉 *Hi ${first}, your trip is confirmed!*\n\n` +
    `Need a *return ticket* for *${route}*? 🔄\n\n` +
    `Book your return journey now and get the best prices before they fill up!\n\n` +
    `🏨 Also explore *hotels* at your destination for a complete travel experience.\n\n` +
    `👉 Open Dream Fly Global and search now!\n\n` +
    `_Dream Fly Global ✈️ — Complete your journey_`
  );
}

function dailyOfferMessage(name: string): string {
  const first = name.split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
  return (
    `🔥 *${first}, Today's Special Deals — ${today}* 🔥\n\n` +
    `Exclusive offers just for you:\n\n` +
    `✈️ *Flights* — Up to 30% off on select routes\n` +
    `🏨 *Hotels* — Best weekend rates available\n` +
    `🚌 *Bus* — Early bird discount on overnight routes\n` +
    `🌴 *Packages* — Holiday bundles starting ₹4,999\n\n` +
    `⏰ *Offers valid today only!* Don't wait!\n\n` +
    `👉 Open Dream Fly Global app to grab your deal now!\n\n` +
    `_Dream Fly Global ✈️ — Explore the World_`
  );
}

// ── Upsert user activity ──────────────────────────────────────────────────────

export async function upsertUserActivity(data: {
  userId:    string;
  name?:     string;
  phone?:    string;
  searchType?: string;
  searchFrom?: string;
  searchTo?:   string;
  bookingId?:  string;
  bookingType?: string;
}): Promise<void> {
  try {
    const now = new Date();
    const existing = await db
      .select()
      .from(userActivityTable)
      .where(eq(userActivityTable.userId, data.userId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(userActivityTable).values({
        userId:          data.userId,
        name:            data.name   || null,
        phone:           data.phone  || null,
        lastSearchType:  data.searchType || null,
        lastSearchFrom:  data.searchFrom || null,
        lastSearchTo:    data.searchTo   || null,
        lastSearchAt:    data.searchType ? now : null,
        lastBookingId:   data.bookingId   || null,
        lastBookingType: data.bookingType || null,
        lastBookingAt:   data.bookingId   ? now : null,
        updatedAt:       now,
      });
    } else {
      await db.update(userActivityTable)
        .set({
          ...(data.name      ? { name: data.name }   : {}),
          ...(data.phone     ? { phone: data.phone }  : {}),
          ...(data.searchType ? {
            lastSearchType: data.searchType,
            lastSearchFrom: data.searchFrom || null,
            lastSearchTo:   data.searchTo   || null,
            lastSearchAt:   now,
          } : {}),
          ...(data.bookingId ? {
            lastBookingId:   data.bookingId,
            lastBookingType: data.bookingType || null,
            lastBookingAt:   now,
          } : {}),
          updatedAt: now,
        })
        .where(eq(userActivityTable.userId, data.userId));
    }
  } catch (err) {
    console.error("[marketing] upsertUserActivity error:", err);
  }
}

// ── Log a marketing message ───────────────────────────────────────────────────

async function logMessage(data: {
  userId?: string;
  phone:   string;
  messageType: string;
  status:  "pending" | "sent" | "failed" | "cancelled";
  body?:   string;
  scheduledAt?: Date;
  sentAt?:      Date;
  error?:       string;
}): Promise<number | undefined> {
  try {
    const rows = await db
      .insert(marketingMessagesTable)
      .values({
        userId:      data.userId || null,
        phone:       data.phone,
        messageType: data.messageType,
        status:      data.status,
        body:        data.body        || null,
        scheduledAt: data.scheduledAt || null,
        sentAt:      data.sentAt      || null,
        error:       data.error       || null,
      })
      .returning({ id: marketingMessagesTable.id });
    return rows[0]?.id;
  } catch (err) {
    console.error("[marketing] logMessage error:", err);
    return undefined;
  }
}

async function updateMessageStatus(
  id:     number,
  status: "sent" | "failed" | "cancelled",
  extras: { sentAt?: Date; error?: string } = {},
): Promise<void> {
  try {
    await db
      .update(marketingMessagesTable)
      .set({ status, ...extras })
      .where(eq(marketingMessagesTable.id, id));
  } catch (err) {
    console.error("[marketing] updateMessageStatus error:", err);
  }
}

// ── 1. Welcome Message ────────────────────────────────────────────────────────

export async function sendWelcomeMessage(
  userId: string,
  name:   string,
  phone:  string,
): Promise<void> {
  if (!phone) return;
  const body = welcomeMessage(name);

  const rowId = await logMessage({
    userId, phone, messageType: "welcome",
    status: "pending", body, scheduledAt: new Date(),
  });

  const result = await sendRawMarketingWhatsApp(phone, body, "welcome");

  if (rowId) {
    await updateMessageStatus(rowId, result.sent ? "sent" : "failed", {
      sentAt: result.sent ? new Date() : undefined,
      error:  result.sent ? undefined  : result.reason,
    });
  }
}

// ── 2. Search Trigger (10 min) ────────────────────────────────────────────────

export function scheduleSearchFollowUp(data: {
  userId:     string;
  name:       string;
  phone:      string;
  searchType: string;
  from?:      string;
  to?:        string;
}): void {
  if (!data.phone) return;

  const timerKey  = `search:${data.userId}`;
  const delayMs   = 10 * 60 * 1000; // 10 minutes
  const fireAt    = new Date(Date.now() + delayMs);

  // Cancel any previous search timer for this user
  const existing = timers.get(timerKey);
  if (existing) clearTimeout(existing);

  const handle = setTimeout(async () => {
    timers.delete(timerKey);

    const body  = searchTriggerMessage(data.name, data.searchType, data.from, data.to);
    const rowId = await logMessage({
      userId: data.userId, phone: data.phone,
      messageType: "search_trigger", status: "pending",
      body, scheduledAt: fireAt,
    });

    const result = await sendRawMarketingWhatsApp(data.phone, body, "search-trigger");

    if (rowId) {
      await updateMessageStatus(rowId, result.sent ? "sent" : "failed", {
        sentAt: result.sent ? new Date() : undefined,
        error:  result.sent ? undefined  : result.reason,
      });
    }
    console.info(`[marketing] search_trigger for user ${data.userId}: ${result.sent ? "sent ✓" : `failed — ${result.reason}`}`);
  }, delayMs);

  timers.set(timerKey, handle);
  console.info(`[marketing] search_trigger scheduled for user ${data.userId} at ${fireAt.toISOString()}`);

  // Persist activity
  upsertUserActivity({
    userId: data.userId, name: data.name, phone: data.phone,
    searchType: data.searchType, searchFrom: data.from, searchTo: data.to,
  }).catch(() => {});
}

export function cancelSearchFollowUp(userId: string): void {
  const timerKey = `search:${userId}`;
  const handle   = timers.get(timerKey);
  if (handle) {
    clearTimeout(handle);
    timers.delete(timerKey);
    console.info(`[marketing] search_trigger cancelled for user ${userId} (booked)`);
  }
}

// ── 3. Booking Follow-Up (6 hours) ───────────────────────────────────────────

export function scheduleBookingFollowUp(data: {
  userId:      string;
  name:        string;
  phone:       string;
  bookingId:   string;
  bookingType: string;
  from?:       string;
  to?:         string;
}): void {
  if (!data.phone) return;

  // Cancel search timer (user has booked — no need to nag about searching)
  cancelSearchFollowUp(data.userId);

  const timerKey = `booking:${data.userId}`;
  const delayMs  = 6 * 60 * 60 * 1000; // 6 hours
  const fireAt   = new Date(Date.now() + delayMs);

  // Cancel any previous booking timer
  const existing = timers.get(timerKey);
  if (existing) clearTimeout(existing);

  const handle = setTimeout(async () => {
    timers.delete(timerKey);

    const body  = bookingFollowUpMessage(data.name, data.bookingType, data.from, data.to);
    const rowId = await logMessage({
      userId: data.userId, phone: data.phone,
      messageType: "booking_followup", status: "pending",
      body, scheduledAt: fireAt,
    });

    const result = await sendRawMarketingWhatsApp(data.phone, body, "booking-followup");

    if (rowId) {
      await updateMessageStatus(rowId, result.sent ? "sent" : "failed", {
        sentAt: result.sent ? new Date() : undefined,
        error:  result.sent ? undefined  : result.reason,
      });
    }
    console.info(`[marketing] booking_followup for user ${data.userId}: ${result.sent ? "sent ✓" : `failed — ${result.reason}`}`);
  }, delayMs);

  timers.set(timerKey, handle);
  console.info(`[marketing] booking_followup scheduled for user ${data.userId} at ${fireAt.toISOString()}`);

  // Persist activity
  upsertUserActivity({
    userId: data.userId, name: data.name, phone: data.phone,
    bookingId: data.bookingId, bookingType: data.bookingType,
  }).catch(() => {});
}

// ── 4. Daily Offers ───────────────────────────────────────────────────────────

async function runDailyOffers(): Promise<void> {
  console.info("[marketing] Running daily offers batch...");

  try {
    // Get all users with phone numbers
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(sql`${usersTable.phone} IS NOT NULL AND ${usersTable.phone} != ''`);

    if (users.length === 0) {
      console.info("[marketing] No users with phone numbers for daily offers");
      return;
    }

    // Check which users already got a daily offer TODAY
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let sent = 0, skipped = 0, failed = 0;

    for (const user of users) {
      if (!user.phone) continue;

      // Check if already sent today
      const existing = await db
        .select({ id: marketingMessagesTable.id })
        .from(marketingMessagesTable)
        .where(
          and(
            eq(marketingMessagesTable.userId, String(user.id)),
            eq(marketingMessagesTable.messageType, "daily_offer"),
            eq(marketingMessagesTable.status, "sent"),
            sql`${marketingMessagesTable.sentAt} >= ${todayStart} AND ${marketingMessagesTable.sentAt} <= ${todayEnd}`,
          )
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const body  = dailyOfferMessage(user.name);
      const rowId = await logMessage({
        userId: String(user.id), phone: user.phone,
        messageType: "daily_offer", status: "pending",
        body, scheduledAt: new Date(),
      });

      const result = await sendRawMarketingWhatsApp(user.phone, body, "daily-offer");

      if (rowId) {
        await updateMessageStatus(rowId, result.sent ? "sent" : "failed", {
          sentAt: result.sent ? new Date() : undefined,
          error:  result.sent ? undefined  : result.reason,
        });
      }

      if (result.sent) sent++;
      else failed++;

      // Small delay to avoid Twilio rate limits
      await new Promise((r) => setTimeout(r, 300));
    }

    console.info(`[marketing] Daily offers done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
  } catch (err) {
    console.error("[marketing] Daily offers error:", err);
  }
}

function msUntilNextOffer(): number {
  const now  = new Date();
  const next = new Date();
  // Target: 9:00 AM IST = 3:30 AM UTC
  next.setUTCHours(3, 30, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export function startDailyOfferCron(): void {
  const delay = msUntilNextOffer();
  const nextRun = new Date(Date.now() + delay);
  console.info(`[marketing] Daily offer cron scheduled — next run: ${nextRun.toISOString()} (in ${Math.round(delay / 60000)} min)`);

  setTimeout(function tick() {
    runDailyOffers().catch((e) => console.error("[marketing] Daily offer run error:", e));
    // Re-schedule for 24 hours later
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }, delay);
}

// ── Admin: manual daily offer trigger ────────────────────────────────────────

export async function triggerDailyOffersNow(): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0, skipped = 0, failed = 0;
  try {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(sql`${usersTable.phone} IS NOT NULL AND ${usersTable.phone} != ''`);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    for (const user of users) {
      if (!user.phone) continue;

      const existing = await db
        .select({ id: marketingMessagesTable.id })
        .from(marketingMessagesTable)
        .where(
          and(
            eq(marketingMessagesTable.userId, String(user.id)),
            eq(marketingMessagesTable.messageType, "daily_offer"),
            eq(marketingMessagesTable.status, "sent"),
            sql`${marketingMessagesTable.sentAt} >= ${todayStart} AND ${marketingMessagesTable.sentAt} <= ${todayEnd}`,
          )
        )
        .limit(1);

      if (existing.length > 0) { skipped++; continue; }

      const body  = dailyOfferMessage(user.name);
      const rowId = await logMessage({
        userId: String(user.id), phone: user.phone,
        messageType: "daily_offer", status: "pending",
        body, scheduledAt: new Date(),
      });

      const result = await sendRawMarketingWhatsApp(user.phone, body, "daily-offer-manual");

      if (rowId) {
        await updateMessageStatus(rowId, result.sent ? "sent" : "failed", {
          sentAt: result.sent ? new Date() : undefined,
          error:  result.sent ? undefined  : result.reason,
        });
      }

      if (result.sent) sent++;
      else failed++;

      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (err) {
    console.error("[marketing] triggerDailyOffersNow error:", err);
    failed++;
  }
  return { sent, skipped, failed };
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function getMarketingStats(): Promise<{
  totalSent:    number;
  totalFailed:  number;
  byType:       Record<string, number>;
  activeTimers: number;
}> {
  try {
    const rows = await db
      .select({
        messageType: marketingMessagesTable.messageType,
        status:      marketingMessagesTable.status,
      })
      .from(marketingMessagesTable);

    const byType: Record<string, number> = {};
    let totalSent = 0, totalFailed = 0;

    for (const row of rows) {
      if (row.status === "sent") {
        totalSent++;
        byType[row.messageType] = (byType[row.messageType] ?? 0) + 1;
      }
      if (row.status === "failed") totalFailed++;
    }

    return { totalSent, totalFailed, byType, activeTimers: timers.size };
  } catch {
    return { totalSent: 0, totalFailed: 0, byType: {}, activeTimers: timers.size };
  }
}
