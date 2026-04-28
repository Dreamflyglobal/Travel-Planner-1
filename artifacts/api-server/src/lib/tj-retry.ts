/**
 * Shared TripJack API client with:
 *  - Fresh token on every retry (bust cache between attempts)
 *  - 2 automatic retries on transient / busy failures
 *  - 15-second per-attempt timeout
 *  - "Server busy" detection inside a 200-OK body
 *  - Structured logging: traceId, resultIndex, attempt, status
 */
import axios from "axios";
import {
  getTripJackHeaders,
  bustTripJackToken,
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
 *  Attempt 1 → uses cached token
 *  Attempt 2 → busts token, gets fresh one, waits 1 s
 *  Attempt 3 → busts token, gets fresh one, waits 2 s
 *
 * Retried automatically on:
 *  · HTTP 5xx / network error / ECONNABORTED / ETIMEDOUT
 *  · HTTP 401 (stale token)
 *  · 200-OK body that contains a "busy / timeout / airline-error" message
 *
 * Throws with `isAuthError = true` if we can't even get a token.
 * Throws with `isTransient = true` after all retries are exhausted on a busy-type error.
 */
export async function tjPostWithRetry(
  path: string,
  body: unknown,
  options: TjPostOptions = {},
): Promise<any> {
  const { maxRetries = 2, timeoutMs = 15_000, context = path } = options;
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    // ── On retry: force a fresh token and wait ───────────────────────────
    if (attempt > 1) {
      bustTripJackToken();
      const delay = (attempt - 1) * 1000;
      logger.info({ context, attempt, delay }, `[tj-retry] retrying after ${delay}ms`);
      await sleep(delay);
    }

    // ── Fetch auth headers ───────────────────────────────────────────────
    let headers: Record<string, string>;
    try {
      headers = await getTripJackHeaders();
    } catch (authErr: any) {
      logger.error({ context, attempt, err: authErr.message }, "[tj-retry] token fetch failed");
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

      // 401 → stale token → bust and retry
      if (httpStatus === 401) {
        bustTripJackToken();
        logger.warn({ context, attempt }, "[tj-retry] 401 stale token — busting and retrying");
        if (attempt < totalAttempts) continue;
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

      // Exhausted / non-retryable — surface a clean message
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

      if (attempt < totalAttempts) continue; // retry

      // All retries exhausted on a busy response
      const e = new Error("Temporary airline issue. Please try again.") as any;
      e.isTransient  = true;
      e.tripjackMsg  = msg;
      throw e;
    }

    return data;
  }

  // Should never reach here
  throw new Error("Unexpected retry loop exit");
}

/**
 * Build a standardised error response for Express routes.
 * Maps auth / transient errors to user-friendly messages.
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
