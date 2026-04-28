/**
 * TripJack API authentication.
 *
 * TripJack does NOT use a Bearer token exchange.
 * Every request must include:
 *   "apikey": <TRIPJACK_API_KEY>
 *   "Content-Type": "application/json"
 *
 * The API key is taken from:
 *   1. Admin → Provider Config (DB)
 *   2. TRIPJACK_API_KEY environment variable
 *
 * Base URL is taken from TRIPJACK_BASE_URL env var, defaulting to the
 * sandbox endpoint. Set TRIPJACK_BASE_URL to override (e.g. production).
 */

import { getProviderConfig } from "./provider-config.js";

/** TripJack API base URL — override with TRIPJACK_BASE_URL env var */
export const TRIPJACK_BASE =
  process.env["TRIPJACK_BASE_URL"] ?? "https://apitest.tripjack.com";

/** Resolve the TripJack API key (DB config takes precedence over env var) */
export async function getTripJackApiKey(): Promise<string> {
  const cfg = await getProviderConfig();
  return cfg.flightApiKey || process.env["TRIPJACK_API_KEY"] || "";
}

/**
 * Build the headers required for every TripJack API request.
 *
 * TripJack authentication is a single `apikey` header — no token exchange.
 *
 * Throws if no API key is configured.
 */
export async function getTripJackHeaders(): Promise<Record<string, string>> {
  const apiKey = await getTripJackApiKey();

  if (!apiKey) {
    throw new Error(
      "TripJack API key is not configured. Please set TRIPJACK_API_KEY or configure it in Admin → Provider Settings."
    );
  }

  console.log(
    "[tripjack-auth] Using TripJack API Key:",
    apiKey.slice(0, 6) + "…" + apiKey.slice(-4),   // log partial key — safe
    "| Base URL:", TRIPJACK_BASE,
  );

  return {
    "apikey":        apiKey,
    "Content-Type":  "application/json",
  };
}

/**
 * No-op — kept for backward compatibility with code that called bustTripJackToken()
 * after a 401. There is no token cache to bust with direct API-key auth.
 */
export function bustTripJackToken(): void {
  // nothing to do — no cached token
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
