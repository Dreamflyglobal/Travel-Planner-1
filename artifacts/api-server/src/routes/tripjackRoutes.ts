import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { tjPostWithRetry, handleTjError } from "../lib/tj-retry.js";

const router: IRouter = Router();

// POST /api/tj-search → /fms/v1/air/search
router.post("/tj-search", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/fms/v1/air/search", req.body, {
      context:    "tj-search",
      timeoutMs:  20_000,
      maxRetries: 2,
    });
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "tj-search");
  }
});

// POST /api/tj-farequote → TripJack /fms/v1/review
// Accepts: { traceId, resultIndex }
// NOTE: TripJack's real "fare quote" step is called "review", not
// "farequote" — /fms/v1/air/farequote does not exist on TripJack's gateway
// (confirmed via direct OPTIONS preflight: it only allows GET/HEAD and
// returns an unrelated `{ suggestions: [] }` stub; POSTing to it always
// yields a bare HTTP 405). The real endpoint is `POST /fms/v1/review` with
// body `{ priceIds: [resultIndex] }` (array, not a single `resultIndex`
// field), authenticated with the plain `apikey` header — verified directly
// against the sandbox to return HTTP 200 with real fare + a `bookingId`
// that `/oms/v1/air/book` accepts. See tj-retry.ts for retry/error handling.
async function handleFareQuote(req: any, res: any): Promise<void> {
  const { traceId, resultIndex } = req.body as {
    traceId?:     string;
    resultIndex?: string;
  };

  logger.info("TRACE:", traceId || "(none)");
  logger.info("RESULT:", resultIndex || "(none)");

  // Explicit stdout logs (always visible regardless of pino log-level config)
  console.log("[fareQuote] === Incoming request ===");
  console.log("[fareQuote] traceId:", traceId || "(none)");
  console.log("[fareQuote] resultIndex:", resultIndex || "(none)");

  if (!resultIndex) {
    logger.error("[fareQuote] resultIndex missing");
    console.error("[fareQuote] resultIndex missing — request body:", JSON.stringify(req.body));
    res.status(400).json({ error: "resultIndex is required for fareQuote" });
    return;
  }

  // TripJack's real review endpoint takes an array of priceIds (resultIndex
  // values), not a single `resultIndex` string. traceId is not part of this
  // request shape on TripJack's side — it's kept in our own API only for
  // logging/back-compat with the frontend's cached session data.
  const fareQuoteBody: Record<string, unknown> = { priceIds: [resultIndex] };

  logger.info("FareQuote Body:", JSON.stringify(fareQuoteBody));
  console.log("[fareQuote] request payload sent to TripJack:", JSON.stringify(fareQuoteBody));

  try {
    const data = await tjPostWithRetry("/fms/v1/review", fareQuoteBody, {
      context:    "fareQuote",
      timeoutMs:  15_000,
      maxRetries: 2,
    });

    logger.info("FareQuote Response:", JSON.stringify(data).slice(0, 800));
    console.log("[fareQuote] === Success response from TripJack ===");
    console.log("[fareQuote] response:", JSON.stringify(data).slice(0, 2000));
    res.json(data);
  } catch (err: any) {
    console.error(
      "[fareQuote] === Failed ===",
      JSON.stringify(
        {
          message:    err.message,
          isAuthError: err.isAuthError ?? false,
          httpStatus:  err.response?.status,
          responseBody: err.response?.data,
        },
        null,
        2,
      ).slice(0, 2000),
    );
    handleTjError(res, err, "fareQuote");
  }
}

router.post("/tj-farequote",       handleFareQuote);
router.post("/tripjack/fareQuote", handleFareQuote);

// POST /api/tj-farerules → TripJack /fms/v1/air/farerule
// Accepts: { bookingId } — same bookingId resolved from fareQuote, used to
// fetch cancellation / date-change fee rules and the refundable flag for
// this specific fare. Non-fatal step: the frontend treats failures as
// "rules unavailable" and still lets the user proceed to SSR/booking.
router.post("/tj-farerules", async (req, res): Promise<void> => {
  const { bookingId } = req.body as { bookingId?: string };

  console.log("[fareRules] === Incoming request ===");
  console.log("[fareRules] bookingId:", bookingId || "(none)");

  if (!bookingId) {
    console.error("[fareRules] bookingId missing — request body:", JSON.stringify(req.body));
    res.status(400).json({ error: "bookingId is required for fareRules" });
    return;
  }

  try {
    // NOTE: real path is /fms/v1/farerule (no "/air/" segment) — verified
    // directly against the sandbox; /fms/v1/air/farerule is an unmapped
    // GET-only stub, same class of bug as the old farequote endpoint.
    const data = await tjPostWithRetry("/fms/v1/farerule", { bookingId }, {
      context:    "fareRules",
      timeoutMs:  15_000,
      maxRetries: 2,
    });
    console.log("[fareRules] === Success response from TripJack ===");
    console.log("[fareRules] response:", JSON.stringify(data).slice(0, 2000));
    res.json(data);
  } catch (err: any) {
    console.error(
      "[fareRules] === Failed ===",
      JSON.stringify(
        {
          message:     err.message,
          isAuthError: err.isAuthError ?? false,
          httpStatus:  err.response?.status,
          responseBody: err.response?.data,
        },
        null,
        2,
      ).slice(0, 2000),
    );
    handleTjError(res, err, "fareRules");
  }
});

// POST /api/tj-ssr → /fms/v1/air/ssr
router.post("/tj-ssr", async (req, res): Promise<void> => {
  console.log("[ssr] === Incoming request ===", JSON.stringify(req.body));
  try {
    const data = await tjPostWithRetry("/fms/v1/air/ssr", req.body, {
      context:    "tj-ssr",
      timeoutMs:  15_000,
      maxRetries: 2,
    });
    console.log("[ssr] === Success response from TripJack ===", JSON.stringify(data).slice(0, 2000));
    res.json(data);
  } catch (err: any) {
    console.error(
      "[ssr] === Failed ===",
      JSON.stringify(
        {
          message:         err.message,
          isAuthError:     err.isAuthError ?? false,
          isTransient:     err.isTransient ?? false,
          httpStatus:      err.response?.status ?? err.tripjackHttpStatus,
          tripjackCode:    err.tripjackCode,
          tripjackMessage: err.tripjackMessage,
          responseBody:    err.response?.data ?? err.tripjackRaw,
        },
        null,
        2,
      ).slice(0, 2000),
    );
    handleTjError(res, err, "tj-ssr");
  }
});

// POST /api/tj-book → /oms/v1/air/book
router.post("/tj-book", async (req, res): Promise<void> => {
  console.log("[tj-book] === Incoming request ===", JSON.stringify(req.body));
  try {
    // NOTE: real path is /oms/v1/air/book (order-management service), not
    // /fms/v1/air/book — verified directly against the sandbox. The latter
    // is an unmapped GET-only stub, same class of bug as the old farequote
    // endpoint. Confirmed with a real bookingId that /oms/v1/air/book
    // returns meaningful business-logic errors (missing/expired bookingId)
    // instead of a bare 405.
    const data = await tjPostWithRetry("/oms/v1/air/book", req.body, {
      context:    "tj-book",
      timeoutMs:  30_000,
      maxRetries: 2,
    });
    console.log("[tj-book] === Success response from TripJack ===", JSON.stringify(data).slice(0, 2000));
    res.json(data);
  } catch (err: any) {
    console.error(
      "[tj-book] === Failed ===",
      JSON.stringify(
        {
          message:         err.message,
          isAuthError:     err.isAuthError ?? false,
          isTransient:     err.isTransient ?? false,
          httpStatus:      err.response?.status ?? err.tripjackHttpStatus,
          tripjackCode:    err.tripjackCode,
          tripjackMessage: err.tripjackMessage,
          responseBody:    err.response?.data ?? err.tripjackRaw,
        },
        null,
        2,
      ).slice(0, 2000),
    );
    handleTjError(res, err, "tj-book");
  }
});

export default router;
