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
 * Attempt to exchange the stored API key for a short-lived Bearer token.
 *
 * TripJack auth endpoint: POST /auth/v1/token  { apiKey }
 * Response: { token: { value: "...", expiry: <unix_seconds> }, status: { success: true } }
 *
 * Returns null if the token endpoint is unavailable — callers should then
 * fall back to sending the raw apikey header directly.
 */
export async function tryGetTripJackToken(): Promise<string | null> {
  if (isValid(cache)) return cache!.token;

  const apiKey = await getTripJackApiKey();
  if (!apiKey) return null;

  try {
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
      const desc =
        data?.status?.messages?.[0]?.description
        ?? data?.message
        ?? "No token in response";
      console.warn("[tripjack-auth] Token fetch returned no value:", desc);
      return null;
    }

    const expiryMs: number =
      typeof data?.token?.expiry === "number"
        ? data.token.expiry * 1000
        : Date.now() + 25 * 60 * 1000;

    cache = { token: tokenValue, expiresAt: expiryMs - 5 * 60 * 1000 };
    console.log("[tripjack-auth] Token cached, expires:", new Date(cache.expiresAt).toISOString());
    return tokenValue;
  } catch (err: any) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message;
    console.warn(`[tripjack-auth] Token fetch failed (HTTP ${status ?? "network"}): ${msg} — will use apikey header`);
    return null;
  }
}

/**
 * Build the correct auth headers for a TripJack API call:
 * - Attempts Bearer token first
 * - Falls back to raw apikey header if token endpoint is unavailable
 */
export async function getTripJackHeaders(): Promise<Record<string, string>> {
  const apiKey = await getTripJackApiKey();
  if (!apiKey) throw new Error("TripJack API key is not configured. Set it in Admin → API Keys.");

  const token = await tryGetTripJackToken();
  if (token) {
    return {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    };
  }

  // Token endpoint unavailable — fall back to direct apikey header
  console.log("[tripjack-auth] Using apikey header (token endpoint not available)");
  return {
    "Content-Type": "application/json",
    "apikey":       apiKey,
  };
}

/** Invalidate cached token (e.g. on 401 from a downstream call) */
export function bustTripJackToken(): void {
  cache = null;
}
