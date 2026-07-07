/**
 * TripJack Booking Poller
 *
 * Background job that periodically calls TripJack's /oms/v1/booking/detail
 * for all flight bookings that are still in "pending" state (or confirmed but
 * have no PNR yet within the first 30 minutes).
 *
 * TripJack creates bookings in PENDING state after AirBook; confirmation and
 * PNR generation happen asynchronously on TripJack's side. This poller bridges
 * the gap between AirBook and TripJack's confirmation, updating the DB once
 * TripJack transitions the booking to CONFIRMED.
 *
 * Poll interval: every 60 seconds.
 * Gives up polling (marks as failed) after 24 hours if still pending.
 */

import { db, bookingsTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import { fetchTjBookingDetail } from "./tj-booking-helper.js";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS  = 60_000;   // 60 seconds between full poll cycles
const GIVE_UP_HOURS     = 24;        // give up after 24 hours of pending
const MAX_BATCH         = 20;        // max bookings to check per cycle

async function pollOnce(): Promise<void> {
  // Find all flight bookings that are pending AND have a TripJack booking ref
  // Also include recently confirmed ones with no PNR (created within 30 minutes)
  // that may have been incorrectly marked confirmed before the detail could be fetched.
  const giveUpBefore = new Date(Date.now() - GIVE_UP_HOURS * 60 * 60 * 1000);
  const recentCutoff = new Date(Date.now() - 30 * 60 * 1000);

  let candidates: typeof bookingsTable.$inferSelect[] = [];
  try {
    candidates = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.bookingType, "flight"),
          or(
            // Pending bookings younger than GIVE_UP_HOURS
            and(
              eq(bookingsTable.bookingStatus, "pending"),
              sql`${bookingsTable.createdAt} > ${giveUpBefore.toISOString()}`,
            ),
            // Recently created confirmed bookings with no PNR (created in last 30 min)
            and(
              eq(bookingsTable.bookingStatus, "confirmed"),
              sql`${bookingsTable.createdAt} > ${recentCutoff.toISOString()}`,
              sql`(${bookingsTable.details}->>'pnr') IS NULL OR (${bookingsTable.details}->>'pnr') = 'null'`,
            ),
          ),
        ),
      )
      .limit(MAX_BATCH);
  } catch (err: any) {
    logger.error({ err: err?.message }, "[tj-poller] DB query failed");
    return;
  }

  // Filter to only those that have a tjBookingRef stored
  const toCheck = candidates.filter((b) => {
    const d = (b.details as Record<string, any>) || {};
    return !!d.tjBookingRef;
  });

  if (toCheck.length === 0) return;

  logger.info({ count: toCheck.length }, "[tj-poller] checking pending/unconfirmed TripJack bookings");

  for (const booking of toCheck) {
    const details     = (booking.details as Record<string, any>) || {};
    const tjBookingRef = details.tjBookingRef as string;
    const bookingRef  = booking.bookingRef ?? "(unknown)";

    // Uses multi-strategy helper: detail → air-detail → list-today → list-2d
    const detail = await fetchTjBookingDetail(
      tjBookingRef,
      `tj-poller/${bookingRef}`,
    ).catch((err: any) => {
      logger.warn(
        { bookingRef, tjBookingRef, err: err?.message },
        "[tj-poller] fetchTjBookingDetail threw — will retry next cycle",
      );
      return null;
    });

    if (!detail || detail.source === "none") {
      // All strategies failed — keep polling until endpoint becomes accessible or timeout
      logger.info(
        { bookingRef, tjBookingRef },
        "[tj-poller] all strategies failed — will re-check next cycle",
      );
    } else {
      const rawStatus    = detail.rawStatus;
      const refreshedPnr = detail.pnr || (details.pnr as string | null) || null;

      if (rawStatus === "CONFIRMED") {
        await db
          .update(bookingsTable)
          .set({
            bookingStatus: "confirmed",
            status:        "confirmed",
            details: {
              ...details,
              pnr:            refreshedPnr,
              tjDetailStatus: "CONFIRMED",
              source:         detail.source,
              ...(detail.tjPassengers.length  > 0 ? { tjPassengers:  detail.tjPassengers  } : {}),
              ...(detail.ticketNumbers.length > 0 ? { ticketNumbers: detail.ticketNumbers } : {}),
            },
          })
          .where(eq(bookingsTable.bookingRef, bookingRef));

        logger.info(
          { bookingRef, tjBookingRef, pnr: refreshedPnr, tickets: detail.ticketNumbers.length, source: detail.source },
          "[tj-poller] booking CONFIRMED by TripJack — DB updated",
        );
      } else if (rawStatus === "FAILED" || rawStatus === "CANCELLED") {
        await db
          .update(bookingsTable)
          .set({
            bookingStatus: "failed",
            status:        "cancelled",
            failureCode:   "tj_failed",
            failureReason: `TripJack booking ${rawStatus.toLowerCase()}`,
            details: { ...details, tjDetailStatus: rawStatus },
          })
          .where(eq(bookingsTable.bookingRef, bookingRef));

        logger.warn({ bookingRef, tjBookingRef, rawStatus }, "[tj-poller] booking FAILED/CANCELLED by TripJack — DB updated");
      } else {
        logger.info(
          { bookingRef, tjBookingRef, rawStatus: rawStatus || "(absent)", source: detail.source },
          "[tj-poller] booking still pending — will re-check next cycle",
        );
      }
    }

    // Give up on bookings that have been pending too long
    if (booking.bookingStatus === "pending") {
      const createdAt = booking.createdAt ? new Date(booking.createdAt) : null;
      if (createdAt && createdAt < giveUpBefore) {
        await db
          .update(bookingsTable)
          .set({ bookingStatus: "failed", status: "cancelled", failureCode: "tj_timeout", failureReason: "TripJack did not confirm within 24 hours" })
          .where(eq(bookingsTable.bookingRef, bookingRef));
        logger.error({ bookingRef, tjBookingRef }, "[tj-poller] giving up — booking pending > 24 hours");
      }
    }
  }
}

let _pollTimer: ReturnType<typeof setInterval> | null = null;

export function startTjBookingPoller(): void {
  if (_pollTimer) return;

  logger.info({ intervalMs: POLL_INTERVAL_MS }, "[tj-poller] starting TripJack booking status poller");

  // Run immediately on start (after a short grace period to let the DB settle)
  setTimeout(() => {
    pollOnce().catch((e) => logger.error({ err: e?.message }, "[tj-poller] initial poll error"));
  }, 10_000);

  _pollTimer = setInterval(() => {
    pollOnce().catch((e) => logger.error({ err: e?.message }, "[tj-poller] poll cycle error"));
  }, POLL_INTERVAL_MS);
}

export function stopTjBookingPoller(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
    logger.info("[tj-poller] stopped");
  }
}

/**
 * Schedule aggressive burst polls for a newly-created PENDING booking.
 *
 * Called immediately after AirBook returns a PENDING result. In production
 * (where /oms/v1/booking/detail is whitelisted) TripJack typically confirms
 * bookings within a few seconds, so we poll at 5 s → 15 s → 30 s → 60 s
 * to catch the confirmation as quickly as possible.
 *
 * Once confirmed or failed the burst stops; the 60-second steady-state
 * poller then has nothing left to do for this booking.
 *
 * Fire-and-forget — do NOT await the returned Promise.
 */
const _burstActive = new Set<string>();

export async function scheduleBookingBurstPoll(
  bookingRef: string,
  tjBookingRef: string,
): Promise<void> {
  if (_burstActive.has(bookingRef)) return; // already scheduled for this booking
  _burstActive.add(bookingRef);

  const delays = [5_000, 15_000, 30_000, 60_000]; // 5 s, 15 s, 30 s, 60 s

  try {
    for (const delay of delays) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));

      // Re-read DB — another path may have already confirmed/failed this booking
      let row: typeof bookingsTable.$inferSelect | undefined;
      try {
        [row] = await db
          .select()
          .from(bookingsTable)
          .where(eq(bookingsTable.bookingRef, bookingRef))
          .limit(1);
      } catch (err: any) {
        logger.warn({ bookingRef, err: err?.message }, "[burst-poll] DB read failed — skipping this interval");
        continue;
      }

      if (!row || row.bookingStatus !== "pending") {
        logger.info({ bookingRef }, "[burst-poll] booking no longer pending — stopping burst");
        break;
      }

      const detail = await fetchTjBookingDetail(tjBookingRef, `burst-poll/${bookingRef}`).catch(() => null);
      if (!detail || detail.source === "none") {
        // Endpoint not yet reachable (sandbox 404) — keep trying
        logger.info({ bookingRef, tjBookingRef, delay }, "[burst-poll] all strategies failed — will retry at next interval");
        continue;
      }

      const details      = (row.details as Record<string, any>) || {};
      const refreshedPnr = detail.pnr || (details.pnr as string | null) || null;

      if (detail.rawStatus === "CONFIRMED") {
        await db
          .update(bookingsTable)
          .set({
            bookingStatus: "confirmed",
            status:        "confirmed",
            details: {
              ...details,
              pnr:            refreshedPnr,
              tjDetailStatus: "CONFIRMED",
              source:         detail.source,
              ...(detail.tjPassengers.length  > 0 ? { tjPassengers:  detail.tjPassengers  } : {}),
              ...(detail.ticketNumbers.length > 0 ? { ticketNumbers: detail.ticketNumbers } : {}),
            },
          })
          .where(eq(bookingsTable.bookingRef, bookingRef));
        logger.info({ bookingRef, tjBookingRef, pnr: refreshedPnr }, "[burst-poll] booking CONFIRMED — DB updated");
        break;
      } else if (detail.rawStatus === "FAILED" || detail.rawStatus === "CANCELLED") {
        await db
          .update(bookingsTable)
          .set({
            bookingStatus: "failed",
            status:        "cancelled",
            failureCode:   "tj_failed",
            failureReason: `TripJack booking ${detail.rawStatus.toLowerCase()}`,
            details:       { ...details, tjDetailStatus: detail.rawStatus },
          })
          .where(eq(bookingsTable.bookingRef, bookingRef));
        logger.warn({ bookingRef, tjBookingRef, rawStatus: detail.rawStatus }, "[burst-poll] booking FAILED — DB updated");
        break;
      } else {
        logger.info({ bookingRef, tjBookingRef, rawStatus: detail.rawStatus || "(absent)" }, "[burst-poll] still pending — next interval");
      }
    }
  } catch (err: any) {
    logger.error({ bookingRef, err: err?.message }, "[burst-poll] unexpected error in burst poll");
  } finally {
    _burstActive.delete(bookingRef);
  }
}
