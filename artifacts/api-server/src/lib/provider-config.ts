import { db, apiKeysTable } from "@workspace/db";

type ProviderConfig = {
  flightProvider: "tripjack" | "tbo";
  flightApiKey: string;
  tboApiKey: string;
  paymentKeyId: string;
  paymentKeySecret: string;
  cachedAt: number;
};

let cache: ProviderConfig | null = null;
const CACHE_TTL_MS = 30_000;

async function loadFromDb(): Promise<ProviderConfig> {
  try {
    const rows = await db.select().from(apiKeysTable).limit(1);
    const row = rows[0];
    const rawProvider = (row?.flightProvider ?? "tripjack").toLowerCase();
    const flightProvider: ProviderConfig["flightProvider"] =
      rawProvider === "tbo" ? "tbo" : "tripjack";

    return {
      flightProvider,
      flightApiKey:    row?.flightApiKey    || process.env["TRIPJACK_API_KEY"]    || "",
      tboApiKey:       row?.tboApiKey       || process.env["TBO_API_KEY"]         || "",
      paymentKeyId:    row?.paymentApiKey   || process.env["RAZORPAY_KEY_ID"]     || "",
      paymentKeySecret: row?.paymentApiSecret || process.env["RAZORPAY_KEY_SECRET"] || "",
      cachedAt:        Date.now(),
    };
  } catch {
    return {
      flightProvider:  "tripjack",
      flightApiKey:    process.env["TRIPJACK_API_KEY"]    || "",
      tboApiKey:       process.env["TBO_API_KEY"]         || "",
      paymentKeyId:    process.env["RAZORPAY_KEY_ID"]     || "",
      paymentKeySecret: process.env["RAZORPAY_KEY_SECRET"] || "",
      cachedAt:        Date.now(),
    };
  }
}

export async function getProviderConfig(): Promise<ProviderConfig> {
  if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) return cache;
  cache = await loadFromDb();
  return cache;
}

export function bustProviderCache(): void {
  cache = null;
}
