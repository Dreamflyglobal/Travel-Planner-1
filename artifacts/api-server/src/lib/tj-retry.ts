/**
 * Shared TripJack API client with:
 *  - 2 automatic retries on transient / busy failures
 *  - 15-second per-attempt timeout
 *  - "Server busy" detection inside a 200-OK body
 *  - Structured logging: context, attempt, status
 *
 * Authentication: direct "apikey" header — no Bearer token exchange.
 */
import axios from "axios";
import {
  getTripJackHeaders,
  bustTripJackToken,       // no-op — kept for compatibility
  extractTripJackError,
  TRIPJACK_BASE,
} from "./tripjack-auth.js";
import { logger } from "./logger.js";

// ── Patterns that indicate a transient/busy TripJack error ────────────────
const BUSY_PATTERNS = [
  /server[\s.-]?busy/i,
  /service[\s.-]?unavailable/i,
  /temporarily[\s.-]?unavailable/i,
  /airline[\s.-]?not[\s.-]?reachable/i,
  /please[\s.-]?try[\s.-]?again/i,
  /timeout/i,
  /gateway/i,
  /connection/i,
];

function isBodyBusy(data: unknown): boolean {
  const msg = extractTripJackError(data, "");
  return BUSY_PATTERNS.some((p) => p.test(msg));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TjPostOptions {
  /** Max number of retries after the first attempt. Default: 2 */
  maxRetries?: number;
  /** Per-attempt timeout in ms. Default: 15 000 */
  timeoutMs?: number;
  /** Label for structured log entries */
  context?: string;
}

/**
 * POST to TripJack with automatic retry on transient failures.
 *
 * Retry policy
 * ─────────────
 *  Attempt 1 → sends request
 *  Attempt 2 → waits 1 s, retries
 *  Attempt 3 → waits 2 s, retries
 *
 * Retried automatically on:
 *  · HTTP 5xx / network error / ECONNABORTED / ETIMEDOUT
 *  · 200-OK body that contains a "busy / timeout / airline-error" message
 *
 * NOT retried on:
 *  · HTTP 401 / 403 (invalid API key — fix the key, retrying won't help)
 *  · HTTP 400 (bad request — fix the payload)
 *
 * Throws with `isAuthError = true` if the API key is missing or invalid (401/403).
 * Throws with `isTransient = true` after all retries exhausted on a busy-type error.
 */
export async function tjPostWithRetry(
  path: string,
  body: unknown,
  options: TjPostOptions = {},
): Promise<any> {
  const { maxRetries = 2, timeoutMs = 15_000, context = path } = options;
  const totalAttempts = maxRetries + 1;

  // ── Resolve headers once (API key doesn't change between retries) ─────────
  let headers: Record<string, string>;
  try {
    headers = await getTripJackHeaders();
  } catch (authErr: any) {
    logger.error({ context, err: authErr.message }, "[tj-retry] API key missing");
    const e = new Error(authErr.message) as any;
    e.isAuthError = true;
    throw e;
  }

  console.log("[tj-retry] Calling Booking API:", path);

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    if (attempt > 1) {
      const delay = (attempt - 1) * 1000;
      logger.info({ context, attempt, delay }, `[tj-retry] retrying after ${delay}ms`);
      await sleep(delay);
    }

    const url = `${TRIPJACK_BASE}${path}`;
    logger.info({ context, attempt, url }, "[tj-retry] sending request");

    // ── HTTP call ────────────────────────────────────────────────────────
    let data: any;
    try {
      const resp = await axios.post(url, body, { headers, timeout: timeoutMs });
      data = resp.data;
    } catch (err: any) {
      const httpStatus = err.response?.status;
      const errCode    = err.code ?? "?";
      const errBody    = err.response?.data;

      // 401 / 403 → invalid API key — non-retryable
      if (httpStatus === 401 || httpStatus === 403) {
        const reason = errBody ? extractTripJackError(errBody, "Invalid API key") : "Invalid API key";
        logger.error(
          { context, attempt, status: httpStatus, reason },
          "[tj-retry] auth rejected — check TRIPJACK_API_KEY and IP whitelist",
        );
        const e = new Error(
          `TripJack authentication failed: ${reason}. ` +
          `Check that your API key is active and this server's IP is whitelisted in the TripJack portal.`
        ) as any;
        e.isAuthError = true;
        throw e;
      }

      // 5xx / network timeout / connection reset → retry
      const isTransient =
        !err.response ||
        errCode === "ECONNABORTED" ||
        errCode === "ETIMEDOUT"   ||
        errCode === "ECONNRESET"  ||
        (httpStatus && httpStatus >= 500);

      if (isTransient && attempt < totalAttempts) {
        logger.warn(
          { context, attempt, code: errCode, status: httpStatus },
          "[tj-retry] transient network error — retrying",
        );
        continue;
      }

      logger.error(
        { context, attempt, code: errCode, status: httpStatus, err: err.message },
        "[tj-retry] request failed",
      );
      throw err;
    }

    // ── Log key response fields ──────────────────────────────────────────
    const traceId     = data?.data?.traceId     ?? data?.traceId;
    const resultIndex = data?.data?.results?.[0]?.resultIndex
                     ?? data?.data?.resultIndex
                     ?? data?.resultIndex;
    const pnr         = data?.data?.pnr;
    logger.info(
      { context, attempt, traceId, resultIndex, pnr: pnr ?? undefined },
      "[tj-retry] response received",
    );

    // ── Detect "server busy" hidden inside a 200-OK body ────────────────
    if (data?.status?.success === false && isBodyBusy(data)) {
      const msg = extractTripJackError(data, "Server busy");
      logger.warn({ context, attempt, msg }, "[tj-retry] busy body response");

      if (attempt < totalAttempts) continue;

      const e = new Error("Temporary airline issue. Please try again.") as any;
      e.isTransient  = true;
      e.tripjackMsg  = msg;
      throw e;
    }

    return data;
  }

  throw new Error("Unexpected retry loop exit");
}

/**
 * Build a standardised error response for Express routes.
 */
export function handleTjError(res: any, err: any, context: string): void {
  if (err.isAuthError) {
    logger.error({ context, err: err.message }, "[tj-retry] auth error");
    res.status(503).json({ error: err.message });
    return;
  }

  if (err.isTransient) {
    res.status(503).json({ error: "Temporary airline issue. Please try again." });
    return;
  }

  const httpStatus = err.response?.status || 502;
  const message    = err.response?.data
    ? extractTripJackError(err.response.data, err.message)
    : (err.message ?? "Unknown error");

  logger.error({ context, status: httpStatus, message }, "[tj-retry] api error");
  res.status(httpStatus).json({ error: message });
}
