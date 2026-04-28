/**
 * Shared TripJack API client with:
 *  - 2 automatic retries on transient / busy failures
 *  - Token refresh + 1 retry on "Invalid Access" / "Token expired" responses
 *  - 15-second per-attempt timeout
 *  - "Server busy" detection inside a 200-OK body
 *  - Structured logging: context, attempt, status
 *
 * Authentication: Bearer token obtained via TripJack's /oms/v1/user/token endpoint.
 * The token is cached in memory by tripjack-auth.ts; call bustTripJackToken() to
 * force a refresh on the next attempt.
 */
import axios from "axios";
import {
  getTripJackHeaders,
  bustTripJackToken,
  extractTripJackError,
  TRIPJACK_BASE,
} from "./tripjack-auth.js";
import { logger } from "./logger.js";

// ── Auth-error signals (body-level — after a 200 OK) ─────────────────────
const AUTH_ERROR_PATTERNS = [
  /invalid[\s_-]?access/i,
  /token[\s_-]?expired/i,
  /session[\s_-]?expired/i,
  /authentication[\s_-]?failed/i,
  /access[\s_-]?denied/i,
  /unauthorized/i,
];

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

function isBodyAuthError(data: unknown): boolean {
  const msg = extractTripJackError(data, "");
  return AUTH_ERROR_PATTERNS.some((p) => p.test(msg));
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
 * POST to TripJack with automatic retry on transient failures and token refresh
 * on auth errors.
 *
 * Retry policy
 * ─────────────
 *  Attempt 1 → sends request
 *  On body auth error  → bust token, re-fetch headers, retry ONCE immediately
 *  Attempt 2 → waits 1 s, retries (transient errors only)
 *  Attempt 3 → waits 2 s, retries (transient errors only)
 *
 * Retried automatically on:
 *  · HTTP 5xx / network error / ECONNABORTED / ETIMEDOUT
 *  · 200-OK body that contains a "busy / timeout / airline-error" message
 *  · 200-OK body with "Invalid Access" / "Token expired" (token refresh, once)
 *
 * NOT retried on:
 *  · HTTP 401 / 403 (hard auth rejection from the HTTP layer)
 *  · HTTP 400 (bad request — fix the payload)
 *
 * Throws with `isAuthError = true` if the API key is missing or the token
 * fetch itself fails.
 * Throws with `isTransient = true` after all retries exhausted on a busy-type error.
 */
export async function tjPostWithRetry(
  path: string,
  body: unknown,
  options: TjPostOptions = {},
): Promise<any> {
  const { maxRetries = 2, timeoutMs = 15_000, context = path } = options;
  const totalAttempts = maxRetries + 1;

  console.log("[tj-retry] Calling Booking API:", path);

  // Track whether we have already done a token-refresh retry so we only do it once.
  let tokenRefreshUsed = false;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    if (attempt > 1) {
      const delay = (attempt - 1) * 1000;
      logger.info({ context, attempt, delay }, `[tj-retry] retrying after ${delay}ms`);
      await sleep(delay);
    }

    // ── Resolve fresh headers each attempt (picks up busted token) ────────
    let headers: Record<string, string>;
    try {
      headers = await getTripJackHeaders();
    } catch (authErr: any) {
      logger.error({ context, err: authErr.message }, "[tj-retry] token fetch failed");
      const e = new Error(authErr.message) as any;
      e.isAuthError = true;
      throw e;
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

      // 401 / 403 → hard auth rejection from HTTP layer — bust cache and try once
      if (httpStatus === 401 || httpStatus === 403) {
        if (!tokenRefreshUsed) {
          tokenRefreshUsed = true;
          bustTripJackToken();
          logger.warn(
            { context, attempt, status: httpStatus },
            "[tj-retry] HTTP auth error — busting token and retrying",
          );
          // Don't consume one of the regular retry slots — loop immediately
          attempt--; // will be incremented by for-loop
          continue;
        }

        const reason = errBody ? extractTripJackError(errBody, "Invalid API key") : "Invalid API key";
        logger.error(
          { context, attempt, status: httpStatus, reason },
          "[tj-retry] auth rejected after token refresh — check TRIPJACK_API_KEY and IP whitelist",
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

    // ── Detect "Invalid Access" / "Token expired" in 200-OK body ────────
    if (isBodyAuthError(data) && !tokenRefreshUsed) {
      tokenRefreshUsed = true;
      bustTripJackToken();
      const msg = extractTripJackError(data, "auth error");
      logger.warn({ context, attempt, msg }, "[tj-retry] body auth error — busting token and retrying");
      // Retry immediately without consuming a regular retry slot
      attempt--;
      continue;
    }

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
