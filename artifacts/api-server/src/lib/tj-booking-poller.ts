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
import { eq, and, or, isNotNull, lt, sql } from "drizzle-orm";
import { tjPostWithRetry } from "./tj-retry.js";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS  = 60_000;   // 60 seconds between full poll cycles
const GIVE_UP_HOURS     = 24;        // give up after 24 hours of pending
const MAX_BATCH         = 20;        // max bookings to check per cycle

function extractPnr(dd: any, fallback?: string | null): string | null {
  return dd?.pnr || dd?.pnrDetails?.[0]?.pnr || fallback || null;
}

function extractPassengers(dd: any, pnr: string | null): Array<{ name: string; pnr: string; ticketNum: string; paxType: string }> {
  return ((dd?.pnrDetails || []) as any[])
    .map((p: any) => ({
      name:      (p.paxName || p.name || "").trim(),
      pnr:       p.pnr || pnr || "",
      ticketNum: p.ticketNum || p.eTicketNumber || p.ticket_num || "",
      paxType:   (p.paxType || "ADULT").toUpperCase(),
    }))
    .filter((p) => p.name.length > 0);
}

function extractTickets(dd: any): string[] {
  return ((dd?.pnrDetails || []) as any[])
    .map((p: any) => p.ticketNum || p.eTicketNumber || p.ticket_num)
    .filter(Boolean);
}

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

    try {
      const dd = await tjPostWithRetry(
        "/oms/v1/booking/detail",
        { bookingId: tjBookingRef },
        { context: `tj-poller/${bookingRef}`, timeoutMs: 15_000, maxRetries: 1 },
      );

      const rawStatus    = ((dd?.status?.booking as string) || "").toUpperCase();
      const refreshedPnr = extractPnr(dd, details.pnr as string | null);
      const passengers   = extractPassengers(dd, refreshedPnr);
      const tickets      = extractTickets(dd);

      console.log(
        `[tj-poller] ${bookingRef} / ${tjBookingRef} — detail response:`,
        JSON.stringify({ rawStatus, pnr: refreshedPnr, pnrDetailsCount: (dd?.pnrDetails ?? []).length, pnrDetailsSample: (dd?.pnrDetails ?? [])[0] ?? null }, null, 2),
      );

      if (rawStatus === "CONFIRMED") {
        await db
          .update(bookingsTable)
          .set({
            bookingStatus: "confirmed",
            status:        "confirmed",
            details: {
              ...details,
              pnr:          refreshedPnr,
              tjDetailStatus: "CONFIRMED",
              ...(passengers.length > 0 ? { tjPassengers: passengers }  : {}),
              ...(tickets.length    > 0 ? { ticketNumbers: tickets }    : {}),
            },
          })
          .where(eq(bookingsTable.bookingRef, bookingRef));

        logger.info(
          { bookingRef, tjBookingRef, pnr: refreshedPnr, tickets: tickets.length },
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
        // Still PENDING or status absent — keep polling
        logger.info(
          { bookingRef, tjBookingRef, rawStatus: rawStatus || "(absent)" },
          "[tj-poller] booking still pending — will re-check next cycle",
        );
      }
    } catch (err: any) {
      const httpStatus = (err as any)?.tripjackHttpStatus ?? err?.response?.status;
      logger.warn(
        { bookingRef, tjBookingRef, httpStatus, err: err?.message },
        "[tj-poller] detail call failed — will retry next cycle",
      );
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
