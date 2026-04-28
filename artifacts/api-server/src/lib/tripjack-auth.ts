/**
 * TripJack API authentication — token manager.
 *
 * TripJack uses a two-step auth flow for booking APIs:
 *   1. POST /auth/v1/token  { apiKey }  → { tokenId, status }
 *   2. All subsequent requests: Authorization: Bearer <tokenId>
 *
 * The token is cached in memory and reused until it expires (or is busted
 * after receiving an "Invalid Access" / "Token expired" response).
 *
 * If the token exchange fails (e.g. IP not yet whitelisted in TripJack portal),
 * the implementation falls back to direct `apikey` header so nothing breaks
 * while waiting for IP approval.
 *
 * The API key is taken from:
 *   1. Admin → Provider Config (DB)
 *   2. TRIPJACK_API_KEY environment variable
 *
 * Base URL is taken from TRIPJACK_BASE_URL env var, defaulting to the
 * sandbox endpoint. Set TRIPJACK_BASE_URL=https://api.tripjack.com for production.
 */

import axios from "axios";
import { logger } from "./logger.js";
import { getProviderConfig } from "./provider-config.js";

/** TripJack API base URL — override with TRIPJACK_BASE_URL env var */
export const TRIPJACK_BASE =
  process.env["TRIPJACK_BASE_URL"] ?? "https://apitest.tripjack.com";

/** Resolve the TripJack API key (DB config takes precedence over env var) */
export async function getTripJackApiKey(): Promise<string> {
  const cfg = await getProviderConfig();
  return cfg.flightApiKey || process.env["TRIPJACK_API_KEY"] || "";
}

// ── In-memory token cache ─────────────────────────────────────────────────

interface TokenCache {
  tokenId:   string;
  expiresAt: number; // ms since epoch
}

let _tokenCache: TokenCache | null = null;

/** Token lifetime buffer — refresh 5 min before actual expiry */
const TOKEN_BUFFER_MS = 5 * 60 * 1000;
/** Default token TTL when TripJack doesn't return an explicit expiry */
const DEFAULT_TTL_MS  = 23 * 60 * 60 * 1000; // 23 hours

function isCacheValid(): boolean {
  return _tokenCache !== null && Date.now() < _tokenCache.expiresAt - TOKEN_BUFFER_MS;
}

/**
 * Invalidate the cached token so the next call to getTripjackToken()
 * or getTripJackHeaders() will fetch a fresh one.
 *
 * Call this when TripJack returns "Invalid Access" or "Token expired".
 */
export function bustTripJackToken(): void {
  if (_tokenCache) {
    logger.info("[tripjack-auth] Busting cached token — will re-authenticate on next call");
    _tokenCache = null;
  }
}

/**
 * Fetch a fresh auth token from TripJack's token endpoint.
 * POST /auth/v1/token  { apiKey }  → { tokenId, status }
 *
 * Returns null if the exchange fails (IP not whitelisted, endpoint unavailable, etc.)
 * so the caller can fall back to direct apikey header.
 */
async function fetchFreshToken(apiKey: string): Promise<string | null> {
  const url = `${TRIPJACK_BASE}/auth/v1/token`;
  logger.info("[tripjack-auth] Fetching fresh token from:", url);

  try {
    const resp = await axios.post(
      url,
      { apiKey },               // TripJack expects capital K
      { headers: { "Content-Type": "application/json" }, timeout: 10_000 },
    );

    const data = resp.data;

    // Check for application-level failure inside a 200 response
    if (data?.status?.success === false) {
      const reason =
        data?.errors?.[0]?.message ??
        data?.status?.messages?.[0]?.description ??
        "Token exchange rejected by TripJack";
      logger.warn("[tripjack-auth] Token exchange failed:", reason, "— falling back to apikey header");
      return null;
    }

    // TripJack returns tokenId at root or inside data
    const tokenId: string | undefined =
      data?.tokenId ??
      data?.data?.tokenId ??
      data?.token;

    if (!tokenId) {
      logger.warn("[tripjack-auth] Token not found in response — falling back to apikey header");
      return null;
    }

    // Use explicit expiry from response if present; otherwise assume DEFAULT_TTL_MS
    const expiresInMs: number =
      typeof data?.tokenExpiry === "number"
        ? data.tokenExpiry
        : typeof data?.expiresIn === "number"
          ? data.expiresIn * 1000
          : DEFAULT_TTL_MS;

    _tokenCache = { tokenId, expiresAt: Date.now() + expiresInMs };

    logger.info(
      "[tripjack-auth] Token obtained — expires in",
      Math.round(expiresInMs / 60_000),
      "min | prefix:", tokenId.slice(0, 8) + "…",
    );

    return tokenId;
  } catch (err: any) {
    const status  = err.response?.status;
    const message = err.response?.data?.errors?.[0]?.message ?? err.message;
    logger.warn(
      "[tripjack-auth] Token fetch failed (HTTP", status ?? "network", "):", message,
      "— falling back to apikey header",
    );
    return null;
  }
}

/**
 * Return a valid TripJack Bearer token if one can be obtained.
 * Returns null when the token exchange is unavailable (IP not whitelisted, etc.).
 * Uses the in-memory cache to avoid redundant auth calls.
 */
export async function getTripjackToken(): Promise<string | null> {
  const apiKey = await getTripJackApiKey();
  if (!apiKey) return null;

  if (isCacheValid()) return _tokenCache!.tokenId;
  return fetchFreshToken(apiKey);
}

/**
 * Build the headers required for every TripJack API request (fareQuote, SSR, book …).
 *
 * Strategy:
 *   1. Try to get a Bearer token via /auth/v1/token exchange
 *   2. If that fails, fall back to direct `apikey` header
 *
 * Returns: { "Authorization": "Bearer <tokenId>", ... }
 *      or: { "apikey": "<key>", ... }
 *
 * Throws only if no API key is configured at all.
 */
export async function getTripJackHeaders(): Promise<Record<string, string>> {
  const apiKey = await getTripJackApiKey();

  if (!apiKey) {
    throw new Error(
      "TripJack API key is not configured. Please set TRIPJACK_API_KEY or configure it in Admin → Provider Settings."
    );
  }

  // Try Bearer token first
  const token = await getTripjackToken();
  if (token) {
    logger.info("[tripjack-auth] Using Bearer token | Base URL:", TRIPJACK_BASE);
    return {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
    };
  }

  // Fall back to direct API key header
  logger.info(
    "[tripjack-auth] Using direct apikey header (token exchange unavailable) | Base URL:", TRIPJACK_BASE,
  );
  return {
    "apikey":        apiKey,
    "Content-Type":  "application/json",
  };
}

/**
 * Extract a human-readable error from TripJack's response body.
 * TripJack error shapes:
 *   { errors: [{ message: "..." }] }
 *   { status: { messages: [{ description: "..." }] } }
 *   { message: "..." }
 *   { error: "..." }
 */
export function extractTripJackError(data: any, fallback: string): string {
  return (
    data?.errors?.[0]?.message
    ?? data?.status?.messages?.[0]?.description
    ?? data?.message
    ?? data?.error
    ?? fallback
  );
}
