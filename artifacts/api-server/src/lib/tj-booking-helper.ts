/**
 * tj-booking-helper.ts
 *
 * Retrieves TripJack air booking details using the official OMS API.
 *
 * ─── VERIFIED ENDPOINT (from TripJack v2 API documentation) ─────────────────
 *
 *   POST /oms/v1/booking/detail
 *   Body: { "bookingId": "<TJS...>" }
 *
 * This is the documented, correct single-booking status endpoint.  It is
 * distinct from /oms/v1/booking/list (a date-range listing endpoint — wrong
 * tool for a per-booking status check).
 *
 * A secondary air-specific path derived from the hotel docs pattern:
 *
 *   Hotel book:    POST /oms/v1/hotel/book
 *   Hotel details: POST /oms/v1/hotel/booking-details
 *   Air book:      POST /oms/v1/air/book
 *   Air details:   POST /oms/v1/air/booking-details   ← derived equivalent
 *
 * ─── SANDBOX LIMITATION ──────────────────────────────────────────────────────
 *
 * In the TripJack sandbox (apitest.tripjack.com) the booking management
 * sub-tree (/oms/v1/booking/*) is IP-restricted.  Both strategies return 404
 * until TripJack support whitelists the server IP for:
 *
 *   · POST /oms/v1/booking/detail
 *   · POST /oms/v1/air/booking-details
 *
 * /oms/v1/air/book is whitelisted separately (it is the booking creation
 * endpoint, not the management endpoint).
 *
 * In PRODUCTION, once the server IP is whitelisted, strategy 1 will succeed
 * on the first attempt and automatic status sync will work end-to-end.
 *
 * ACTION REQUIRED: Contact TripJack support and request that they whitelist
 * your server IP for /oms/v1/booking/detail in both sandbox and production.
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

// ── Response field extraction helpers ────────────────────────────────────────
// TripJack's booking detail response has multiple possible shapes:
//   Shape A (OMS standard):  { status: { booking: "CONFIRMED" }, pnrDetails: [...] }
//   Shape B (order wrapper):  { order: { status: "CONFIRMED" }, itemInfos: { AIR: {...} } }
// Both shapes are handled below.

function extractStatus(dd: any): string {
  // Shape A: direct status.booking field
  const fromStatusBooking = (dd?.status?.booking as string | undefined) || "";
  if (fromStatusBooking) return fromStatusBooking.toUpperCase();

  // Shape B: order.status field (booking-details response)
  const fromOrderStatus = (dd?.order?.status as string | undefined) || "";
  if (fromOrderStatus) return fromOrderStatus.toUpperCase();

  // Shape C: top-level "status" is a string (some edge cases)
  if (typeof dd?.status === "string") return (dd.status as string).toUpperCase();

  return "";
}

function extractPnr(dd: any, fallback?: string | null): string | null {
  // Direct pnr field
  if (dd?.pnr) return dd.pnr;
  // pnrDetails array
  const fromPnrDetails = dd?.pnrDetails?.[0]?.pnr;
  if (fromPnrDetails) return fromPnrDetails;
  // itemInfos.AIR path (booking-details shape)
  const fromAir = dd?.itemInfos?.AIR?.pnrDetails?.[0]?.pnr;
  if (fromAir) return fromAir;
  return fallback ?? null;
}

function extractPassengers(dd: any, pnr: string | null): TjBookingDetail["tjPassengers"] {
  const pnrDetails: any[] =
    dd?.pnrDetails ||
    dd?.itemInfos?.AIR?.pnrDetails ||
    [];

  return pnrDetails
    .map((p: any) => ({
      name:      (p.paxName || p.name || "").trim(),
      pnr:       p.pnr       || pnr || "",
      ticketNum: p.ticketNum || p.eTicketNumber || p.ticket_num || "",
      paxType:   (p.paxType  || "ADULT").toUpperCase(),
    }))
    .filter((p) => p.name.length > 0);
}

function extractTickets(dd: any): string[] {
  const pnrDetails: any[] =
    dd?.pnrDetails ||
    dd?.itemInfos?.AIR?.pnrDetails ||
    [];

  return pnrDetails
    .map((p: any) => p.ticketNum || p.eTicketNumber || p.ticket_num)
    .filter(Boolean);
}

// ── Date helper for list strategies ──────────────────────────────────────────

function dateStr(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// ── Main fetch function ───────────────────────────────────────────────────────

/**
 * Attempt to retrieve TripJack booking detail using a cascade of strategies.
 *
 * Strategy 1: POST /oms/v1/booking/detail        — standard documented path
 * Strategy 2: POST /oms/v1/air/booking-details   — air-specific path (hotel docs pattern)
 * Strategy 3: POST /oms/v1/booking/list (today)  — list fallback; scans for bookingId
 * Strategy 4: POST /oms/v1/booking/list (2 days) — list fallback; wider window for midnight crossings
 *
 * Strategies 1 and 2 are IP-restricted in TripJack sandbox (/oms/v1/booking/* sub-tree)
 * and both return 404.  Strategies 3 and 4 use /oms/v1/booking/list which IS accessible
 * in sandbox and returns each booking's status + PNR — used as the working fallback until
 * TripJack whitelists the detail endpoints.
 *
 * Returns { source: "none" } only when all four strategies fail.
 */
export async function fetchTjBookingDetail(
  tjBookingRef: string,
  context: string,
): Promise<TjBookingDetail> {
  type Strategy = {
    label: string;
    path: string;
    body: Record<string, unknown>;
  };

  const strategies: Strategy[] = [
    // ── Strategy 1: Official documented OMS booking detail endpoint ──────────
    // Reference: TripJack OMS API documentation
    // Correct single-booking status endpoint (not a listing endpoint).
    {
      label: "detail",
      path:  "/oms/v1/booking/detail",
      body:  { bookingId: tjBookingRef },
    },

    // ── Strategy 2: Air-specific booking-details path ────────────────────────
    // Derived from the hotel docs pattern:
    //   Hotel: POST /oms/v1/hotel/booking-details
    //   Air:   POST /oms/v1/air/booking-details  (equivalent)
    {
      label: "air-detail",
      path:  "/oms/v1/air/booking-details",
      body:  { bookingId: tjBookingRef },
    },
  ];

  for (const strategy of strategies) {
    logger.info(
      {
        context,
        tjBookingRef,
        strategy:  strategy.label,
        endpoint:  strategy.path,
        payload:   strategy.body,
      },
      "[tj-booking-helper] calling booking status API",
    );

    try {
      const raw = await tjPostWithRetry(
        strategy.path,
        strategy.body,
        { context: `${context}/${strategy.label}`, timeoutMs: 15_000, maxRetries: 0 },
      );

      const rawStatus  = extractStatus(raw);
      const pnr        = extractPnr(raw);
      const passengers = extractPassengers(raw, pnr);
      const tickets    = extractTickets(raw);

      logger.info(
        {
          context,
          tjBookingRef,
          strategy:  strategy.label,
          endpoint:  strategy.path,
          rawStatus,
          pnr,
          paxCount:     passengers.length,
          ticketCount:  tickets.length,
          responseKeys: raw ? Object.keys(raw) : [],
        },
        "[tj-booking-helper] booking status API SUCCESS",
      );

      // Full response logged at debug level for diagnostics
      logger.debug(
        { context, tjBookingRef, strategy: strategy.label, response: raw },
        "[tj-booking-helper] full booking status response",
      );

      const source: TjBookingDetail["source"] =
        strategy.label === "detail" ? "detail" : "air-detail";

      return { rawStatus, pnr, tjPassengers: passengers, ticketNumbers: tickets, source, rawResponse: raw };

    } catch (err: any) {
      const httpStatus = (err as any)?.tripjackHttpStatus ?? err?.response?.status ?? "?";

      logger.warn(
        {
          context,
          tjBookingRef,
          strategy:  strategy.label,
          endpoint:  strategy.path,
          payload:   strategy.body,
          httpStatus,
          err:       err?.message,
        },
        "[tj-booking-helper] booking status API call FAILED",
      );

      // 404 from booking management endpoints in sandbox means the server IP is
      // not whitelisted for /oms/v1/booking/* (a separate whitelist from /oms/v1/air/book).
      // This is expected in sandbox and will resolve in production once TripJack
      // whitelists the IP.
      if (httpStatus === 404) {
        logger.warn(
          {
            context,
            tjBookingRef,
            strategy:  strategy.label,
            endpoint:  strategy.path,
          },
          "[tj-booking-helper] 404 on booking management endpoint — " +
          "SANDBOX LIMITATION: TripJack restricts /oms/v1/booking/* to whitelisted IPs. " +
          "ACTION REQUIRED: Ask TripJack support to whitelist your server IP for " +
          "POST /oms/v1/booking/detail and POST /oms/v1/air/booking-details " +
          "in both sandbox and production environments.",
        );
      }
    }
  }

  // ── Strategies 3 + 4: booking/list fallback ────────────────────────────────
  // /oms/v1/booking/detail and /oms/v1/air/booking-details are IP-restricted in
  // the TripJack sandbox and both return 404.  /oms/v1/booking/list IS accessible
  // in sandbox and includes each booking's status + PNR — used here as the working
  // fallback until TripJack whitelists the detail endpoints for this server IP.
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const listWindows = [
    { label: "list-today", fromDate: dateStr(today),     toDate: dateStr(today)     },
    { label: "list-2d",    fromDate: dateStr(yesterday), toDate: dateStr(today)     },
  ] as const;

  for (const win of listWindows) {
    logger.info(
      {
        context,
        tjBookingRef,
        strategy:  win.label,
        endpoint:  "/oms/v1/booking/list",
        fromDate:  win.fromDate,
        toDate:    win.toDate,
      },
      "[tj-booking-helper] trying booking/list fallback strategy",
    );

    try {
      const raw = await tjPostWithRetry(
        "/oms/v1/booking/list",
        { fromDate: win.fromDate, toDate: win.toDate, bookingType: "AIRLINE" },
        { context: `${context}/${win.label}`, timeoutMs: 15_000, maxRetries: 0 },
      );

      // The list response wraps bookings in one of several shapes
      const items: any[] =
        raw?.data?.bookings          ||
        raw?.bookings                ||
        (Array.isArray(raw?.data) ? raw.data : null) ||
        [];

      logger.info(
        { context, tjBookingRef, strategy: win.label, totalItems: items.length },
        "[tj-booking-helper] booking/list returned items",
      );

      // Find our booking by bookingId, orderId, or tripJackBookingId
      const dd = items.find(
        (b: any) =>
          b.bookingId         === tjBookingRef ||
          b.orderId           === tjBookingRef ||
          b.tripJackBookingId === tjBookingRef,
      ) ?? null;

      if (!dd) {
        logger.info(
          { context, tjBookingRef, strategy: win.label, totalItems: items.length },
          "[tj-booking-helper] booking not found in list — trying wider window",
        );
        continue;
      }

      // Extract status + PNR using the same helpers as the detail strategies
      const rawStatus  = extractStatus(dd);
      const pnr        = extractPnr(dd);
      const passengers = extractPassengers(dd, pnr);
      const tickets    = extractTickets(dd);

      logger.info(
        {
          context,
          tjBookingRef,
          strategy:    win.label,
          endpoint:    "/oms/v1/booking/list",
          rawStatus,
          pnr,
          paxCount:    passengers.length,
          ticketCount: tickets.length,
        },
        "[tj-booking-helper] booking found in list — status retrieved successfully",
      );

      logger.debug(
        { context, tjBookingRef, strategy: win.label, bookingRecord: dd },
        "[tj-booking-helper] full list booking record",
      );

      return {
        rawStatus,
        pnr,
        tjPassengers: passengers,
        ticketNumbers: tickets,
        source:       "list",
        rawResponse:  dd,
      };

    } catch (err: any) {
      const httpStatus = (err as any)?.tripjackHttpStatus ?? err?.response?.status ?? "?";
      logger.warn(
        {
          context,
          tjBookingRef,
          strategy:    win.label,
          endpoint:    "/oms/v1/booking/list",
          httpStatus,
          err:         err?.message,
        },
        "[tj-booking-helper] booking/list call FAILED",
      );
    }
  }

  logger.warn(
    {
      context,
      tjBookingRef,
      strategiesTried: [...strategies.map((s) => s.label), "list-today", "list-2d"],
    },
    "[tj-booking-helper] all booking status strategies exhausted — " +
    "booking remains in its stored state. " +
    "SANDBOX: this is expected until TripJack whitelists the server IP. " +
    "PRODUCTION: contact TripJack support if this persists.",
  );

  return {
    rawStatus:    "",
    pnr:          null,
    tjPassengers: [],
    ticketNumbers: [],
    source:       "none",
    rawResponse:  null,
  };
}
