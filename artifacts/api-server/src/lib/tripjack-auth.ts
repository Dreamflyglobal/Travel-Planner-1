import axios from "axios";
import { getProviderConfig } from "./provider-config.js";

export const TRIPJACK_BASE = "https://apitest.tripjack.com";

interface TokenCache {
  token:     string;
  expiresAt: number;
}

let cache: TokenCache | null = null;

function isValid(c: TokenCache | null): boolean {
  return !!c && Date.now() < c.expiresAt;
}

export async function getTripJackApiKey(): Promise<string> {
  const cfg = await getProviderConfig();
  return cfg.flightApiKey || process.env.TRIPJACK_API_KEY || "";
}

/**
 * Extract a human-readable error from TripJack's response body.
 * TripJack uses: { errors: [{ message: "..." }] }  OR  { status: { messages: [{ description: "..." }] } }
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

/**
 * Two-step TripJack authentication.
 * Step 1: POST /auth/v1/token { apiKey } → Bearer token
 * Step 2: caller uses Authorization: Bearer <token>
 *
 * Throws if:
 *   - No API key configured
 *   - Token endpoint returns an error (propagates exact TripJack error message)
 */
export async function getTripJackToken(): Promise<string> {
  if (isValid(cache)) return cache!.token;

  const apiKey = await getTripJackApiKey();
  if (!apiKey) {
    throw new Error(
      "TripJack API key is not configured. Please set it in Admin → API Keys and save."
    );
  }

  console.log("[tripjack-auth] Step 1: POST /auth/v1/token");
  const { data } = await axios.post(
    `${TRIPJACK_BASE}/auth/v1/token`,
    { apiKey },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 10_000,
    }
  );
  console.log("[tripjack-auth] Token response:", JSON.stringify(data));

  const tokenValue: string =
    data?.token?.value
    ?? data?.token
    ?? data?.access_token
    ?? data?.data?.token
    ?? "";

  if (!tokenValue) {
    const reason = extractTripJackError(data, "No token in response");
    throw new Error(`TripJack authentication failed: ${reason}`);
  }

  const expiryMs: number =
    typeof data?.token?.expiry === "number"
      ? data.token.expiry * 1000
      : Date.now() + 25 * 60 * 1000;

  cache = { token: tokenValue, expiresAt: expiryMs - 5 * 60 * 1000 };
  console.log("[tripjack-auth] Token cached, expires:", new Date(cache.expiresAt).toISOString());
  return tokenValue;
}

/**
 * Build Authorization header for TripJack API calls.
 * Always uses Bearer token — never falls back to raw apikey header.
 */
export async function getTripJackHeaders(): Promise<Record<string, string>> {
  const token = await getTripJackToken();
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

/** Invalidate cached token (call on 401 from a downstream TripJack call) */
export function bustTripJackToken(): void {
  cache = null;
}
