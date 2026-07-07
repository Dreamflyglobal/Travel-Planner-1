/**
 * tj-booking-helper.ts
 *
 * Shared helper that retrieves TripJack booking details using multiple
 * fallback strategies.  The standard /oms/v1/booking/detail endpoint is
 * tried first; when that returns 404 (a sandbox IP-whitelist limitation
 * for the /oms/v1/booking/* sub-tree), we automatically fall back to:
 *
 *   1. POST /oms/v1/booking/detail   { bookingId }      ← standard path
 *   2. POST /oms/v1/air/booking/detail { bookingId }    ← alternate path (some sandbox envs)
 *   3. POST /oms/v1/booking/list  (today's date)        ← list, scan for bookingId
 *   4. POST /oms/v1/booking/list  (yesterday + today)   ← list, wider window
 *
 * SANDBOX vs PRODUCTION:
 *   Sandbox  — /oms/v1/air/book is whitelisted; /oms/v1/booking/* is NOT.
 *              All four strategies will return 404 until TripJack whitelists
 *              the booking-management sub-path for the sandbox API key.
 *              Contact TripJack support to whitelist:
 *                · /oms/v1/booking/detail
 *                · /oms/v1/booking/list
 *              for the sandbox key in addition to /oms/v1/air/*.
 *
 *   Production — Once the production server IP is whitelisted for all OMS
 *              endpoints, strategy 1 will succeed on the first attempt and
 *              automatic sync will work end-to-end without any manual action.
 */

import { tjPostWithRetry } from "./tj-retry.js";
import { logger } from "./logger.js";

export interface TjBookingDetail {
  rawStatus: string;   // "CONFIRMED" | "PENDING" | "FAILED" | "CANCELLED" | ""
  pnr: string | null;
  tjPassengers: Array<{
    name: string;
    pnr: string;
    ticketNum: string;
    paxType: string;
  }>;
  ticketNumbers: string[];
  source: "detail" | "air-detail" | "list" | "none";
  rawResponse: any;
}

function extractPnr(dd: any, fallback?: string | null): string | null {
  return dd?.pnr || dd?.pnrDetails?.[0]?.pnr || fallback || null;
}

function extractPassengers(dd: any, pnr: string | null): TjBookingDetail["tjPassengers"] {
  return ((dd?.pnrDetails || []) as any[])
    .map((p: any) => ({
      name:      (p.paxName || p.name || "").trim(),
      pnr:       p.pnr       || pnr || "",
      ticketNum: p.ticketNum || p.eTicketNumber || p.ticket_num || "",
      paxType:   (p.paxType  || "ADULT").toUpperCase(),
    }))
    .filter((p) => p.name.length > 0);
}

function extractTickets(dd: any): string[] {
  return ((dd?.pnrDetails || []) as any[])
    .map((p: any) => p.ticketNum || p.eTicketNumber || p.ticket_num)
    .filter(Boolean);
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Attempt to retrieve TripJack booking detail using a cascade of strategies.
 *
 * @param tjBookingRef  TripJack booking ID (e.g. "TJS104702567246")
 * @param context       Log context label (e.g. "book-flight" or "tj-poller/BK-xxx")
 * @returns             Normalised booking detail, or { source: "none" } when all strategies fail
 */
export async function fetchTjBookingDetail(
  tjBookingRef: string,
  context: string,
): Promise<TjBookingDetail> {
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  type Strategy = {
    label: string;
    isList: boolean;
    fn: () => Promise<any>;
  };

  const strategies: Strategy[] = [
    // ── 1. Standard OMS detail endpoint ─────────────────────────────────
    {
      label:  "detail",
      isList: false,
      fn: () =>
        tjPostWithRetry(
          "/oms/v1/booking/detail",
          { bookingId: tjBookingRef },
          { context: `${context}/detail`, timeoutMs: 15_000, maxRetries: 0 },
        ),
    },

    // ── 2. Alternate air-scoped path (some TripJack sandbox configs) ─────
    {
      label:  "air-detail",
      isList: false,
      fn: () =>
        tjPostWithRetry(
          "/oms/v1/air/booking/detail",
          { bookingId: tjBookingRef },
          { context: `${context}/air-detail`, timeoutMs: 15_000, maxRetries: 0 },
        ),
    },

    // ── 3. Booking list — today only ─────────────────────────────────────
    {
      label:  "list-today",
      isList: true,
      fn: () =>
        tjPostWithRetry(
          "/oms/v1/booking/list",
          { fromDate: dateStr(today), toDate: dateStr(today), bookingType: "AIRLINE" },
          { context: `${context}/list-today`, timeoutMs: 15_000, maxRetries: 0 },
        ),
    },

    // ── 4. Booking list — yesterday + today (covers midnight boundary) ───
    {
      label:  "list-2d",
      isList: true,
      fn: () =>
        tjPostWithRetry(
          "/oms/v1/booking/list",
          { fromDate: dateStr(yesterday), toDate: dateStr(today), bookingType: "AIRLINE" },
          { context: `${context}/list-2d`, timeoutMs: 15_000, maxRetries: 0 },
        ),
    },
  ];

  for (const strategy of strategies) {
    logger.info(
      { context, tjBookingRef, strategy: strategy.label },
      "[tj-booking-helper] trying strategy",
    );

    try {
      const raw = await strategy.fn();

      // For list endpoints, scan the result array for our booking
      let dd: any = raw;
      if (strategy.isList) {
        const items: any[] =
          raw?.data?.bookings  ||
          raw?.bookings        ||
          (Array.isArray(raw?.data) ? raw.data : null) ||
          [];

        console.log(
          `[tj-booking-helper] ${context}/${strategy.label} — list returned ${items.length} booking(s)`,
          items.length > 0
            ? JSON.stringify(items.map((b: any) => ({
                bookingId:  b.bookingId ?? b.orderId ?? "(no-id)",
                status:     b.status?.booking ?? "(no-status)",
                pnr:        b.pnr ?? "(no-pnr)",
              })), null, 2).slice(0, 2000)
            : "(empty)",
        );

        dd = items.find(
          (b: any) =>
            b.bookingId        === tjBookingRef ||
            b.orderId          === tjBookingRef ||
            b.tripJackBookingId === tjBookingRef,
        ) ?? null;

        if (!dd) {
          logger.info(
            { context, tjBookingRef, strategy: strategy.label, total: items.length },
            "[tj-booking-helper] booking not found in list — trying next strategy",
          );
          continue;
        }
      }

      if (!dd) continue;

      const rawStatus = ((dd?.status?.booking as string) || "").toUpperCase();
      const pnr       = extractPnr(dd);
      const passengers = extractPassengers(dd, pnr);
      const tickets   = extractTickets(dd);

      console.log(
        `[tj-booking-helper] ${context}/${strategy.label} — SUCCESS:`,
        JSON.stringify({
          rawStatus,
          pnr,
          pnrDetailsCount:  (dd?.pnrDetails ?? []).length,
          pnrDetailsSample: (dd?.pnrDetails ?? [])[0] ?? null,
          source:           strategy.label,
        }, null, 2),
      );

      logger.info(
        {
          context, tjBookingRef,
          strategy:  strategy.label,
          rawStatus, pnr,
          paxCount:  passengers.length,
          ticketCount: tickets.length,
        },
        "[tj-booking-helper] strategy succeeded",
      );

      const source: TjBookingDetail["source"] =
        strategy.label === "detail"     ? "detail"     :
        strategy.label === "air-detail" ? "air-detail" : "list";

      return { rawStatus, pnr, tjPassengers: passengers, ticketNumbers: tickets, source, rawResponse: dd };
    } catch (err: any) {
      const httpStatus = (err as any)?.tripjackHttpStatus ?? err?.response?.status ?? "?";
      logger.warn(
        { context, tjBookingRef, strategy: strategy.label, httpStatus, err: err?.message },
        "[tj-booking-helper] strategy failed — trying next",
      );

      // 404 from /oms/v1/booking/* in sandbox is expected (IP not whitelisted
      // for booking-management endpoints).  Log a clear sandbox-vs-production note.
      if (httpStatus === 404 && strategy.label === "detail") {
        logger.warn(
          { context, tjBookingRef },
          "[tj-booking-helper] SANDBOX LIMITATION: /oms/v1/booking/detail returned 404. " +
          "This means TripJack has NOT whitelisted the booking-management (/oms/v1/booking/*) " +
          "endpoints for this API key / IP. AirBook (/oms/v1/air/book) is whitelisted separately. " +
          "ACTION REQUIRED: Ask TripJack support to whitelist /oms/v1/booking/detail and " +
          "/oms/v1/booking/list for the sandbox (and production) API key. " +
          "Automatic sync WILL work in production once these endpoints are accessible.",
        );
      }
    }
  }

  logger.warn(
    { context, tjBookingRef },
    "[tj-booking-helper] all strategies exhausted — cannot retrieve booking detail. " +
    "See SANDBOX LIMITATION log above for the expected reason and resolution steps.",
  );
  return { rawStatus: "", pnr: null, tjPassengers: [], ticketNumbers: [], source: "none", rawResponse: null };
}
