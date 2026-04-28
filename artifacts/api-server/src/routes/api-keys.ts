import { Router, type Request, type Response, type NextFunction } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";
import { bustProviderCache } from "../lib/provider-config.js";

const router = Router();

const PROVIDER_OPTIONS = ["tripjack", "tbo"] as const;

const KEY_FIELDS = [
  "flightApiKey",
  "busApiKey",
  "hotelApiKey",
  "hotelApiSecret",
  "paymentApiKey",
  "paymentApiSecret",
  "tboApiKey",
] as const;

type KeyField = (typeof KEY_FIELDS)[number];

type KeysRow = {
  id: number;
  flightApiKey: string | null;
  busApiKey: string | null;
  hotelApiKey: string | null;
  hotelApiSecret: string | null;
  paymentApiKey: string | null;
  paymentApiSecret: string | null;
  flightProvider: string | null;
  tboApiKey: string | null;
  updatedAt: Date;
};

function maskKey(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "****";
  return `****${trimmed.slice(-4)}`;
}

function buildMaskedResponse(row: KeysRow | null) {
  const envFlight      = process.env["TRIPJACK_API_KEY"]    ?? "";
  const envHotel       = process.env["HOTELBEDS_API_KEY"]   ?? "";
  const envHotelSecret = process.env["HOTELBEDS_SECRET"]    ?? "";
  const envBus         = process.env["RAPIDAPI_KEY"]        ?? "";
  const envTboKey      = process.env["TBO_API_KEY"]         ?? "";

  const flightDb       = row?.flightApiKey     ?? "";
  const busDb          = row?.busApiKey        ?? "";
  const hotelDb        = row?.hotelApiKey      ?? "";
  const hotelSecretDb  = row?.hotelApiSecret   ?? "";
  const payKeyDb       = row?.paymentApiKey    ?? "";
  const paySecretDb    = row?.paymentApiSecret ?? "";
  const tboApiKeyDb    = row?.tboApiKey        ?? "";
  const flightProvider = row?.flightProvider   ?? "tripjack";

  const flight       = flightDb      || envFlight;
  const bus          = busDb         || envBus;
  const hotel        = hotelDb       || envHotel;
  const hotelSecret  = hotelSecretDb || envHotelSecret;
  const tboKey       = tboApiKeyDb   || envTboKey;

  return {
    keys: {
      flightApiKey:     { masked: maskKey(flight),       set: !!flight,       source: flightDb      ? "db" : envFlight      ? "env" : "none" },
      busApiKey:        { masked: maskKey(bus),           set: !!bus,           source: busDb         ? "db" : envBus         ? "env" : "none" },
      hotelApiKey:      { masked: maskKey(hotel),         set: !!hotel,         source: hotelDb       ? "db" : envHotel       ? "env" : "none" },
      hotelApiSecret:   { masked: maskKey(hotelSecret),   set: !!hotelSecret,   source: hotelSecretDb ? "db" : envHotelSecret ? "env" : "none" },
      paymentApiKey:    { masked: maskKey(payKeyDb    || process.env["RAZORPAY_KEY_ID"]     || ""), set: !!(payKeyDb    || process.env["RAZORPAY_KEY_ID"]),     source: payKeyDb    ? "db" : process.env["RAZORPAY_KEY_ID"]     ? "env" : "none" },
      paymentApiSecret: { masked: maskKey(paySecretDb || process.env["RAZORPAY_KEY_SECRET"] || ""), set: !!(paySecretDb || process.env["RAZORPAY_KEY_SECRET"]), source: paySecretDb ? "db" : process.env["RAZORPAY_KEY_SECRET"] ? "env" : "none" },
      tboApiKey:        { masked: maskKey(tboKey),        set: !!tboKey,        source: tboApiKeyDb   ? "db" : envTboKey       ? "env" : "none" },
    },
    flightProvider,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

async function getOrCreateRow(): Promise<KeysRow> {
  const existing = await db.select().from(apiKeysTable).limit(1);
  if (existing.length > 0) return existing[0] as KeysRow;
  const inserted = await db.insert(apiKeysTable).values({}).returning();
  return inserted[0] as KeysRow;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  try {
    const payload = verifyToken(header.slice(7));
    if (payload.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }
    (req as Request & { admin?: typeof payload }).admin = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

// ── GET /api/admin/api-keys ────────────────────────────────────────────────
router.get("/admin/api-keys", requireAdmin, async (_req, res) => {
  try {
    const row = await getOrCreateRow();
    return res.json({ success: true, ...buildMaskedResponse(row) });
  } catch (err) {
    logger.error({ err }, "[api-keys] GET failed");
    return res.status(500).json({ success: false, error: "Failed to load API keys" });
  }
});

// ── POST /api/admin/api-keys ───────────────────────────────────────────────
router.post("/admin/api-keys", requireAdmin, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Partial<Record<KeyField | "flightProvider", string>>;
    const update: Partial<Record<KeyField | "flightProvider", string | null>> = {};

    for (const field of KEY_FIELDS) {
      const value = body[field];
      if (value === undefined) continue;
      if (typeof value !== "string") {
        return res.status(400).json({ success: false, error: `${field} must be a string` });
      }
      const trimmed = value.trim();
      update[field] = trimmed.length === 0 ? null : trimmed;
    }

    if (body.flightProvider !== undefined) {
      const p = (body.flightProvider ?? "").toLowerCase().trim();
      if (!PROVIDER_OPTIONS.includes(p as any)) {
        return res.status(400).json({ success: false, error: `flightProvider must be one of: ${PROVIDER_OPTIONS.join(", ")}` });
      }
      update.flightProvider = p;
    }

    const row = await getOrCreateRow();
    if (Object.keys(update).length > 0) {
      await db
        .update(apiKeysTable)
        .set({ ...update, updatedAt: new Date() })
        .where(eq(apiKeysTable.id, row.id));
      bustProviderCache();
    }

    const refreshed = await getOrCreateRow();
    return res.json({ success: true, ...buildMaskedResponse(refreshed) });
  } catch (err) {
    logger.error({ err }, "[api-keys] POST failed");
    return res.status(500).json({ success: false, error: "Failed to save API keys" });
  }
});

// ── POST /api/admin/api-keys/test ──────────────────────────────────────────
router.post("/admin/api-keys/test", requireAdmin, async (req, res) => {
  const which = (req.body?.which ?? "") as string;
  if (!["flight", "bus", "hotel", "payment", "tbo"].includes(which)) {
    return res.status(400).json({ success: false, error: "Invalid 'which' value" });
  }

  try {
    const row = await getOrCreateRow();
    const map: Record<string, string> = {
      flight:  row.flightApiKey    || process.env["TRIPJACK_API_KEY"]  || "",
      bus:     row.busApiKey       || process.env["RAPIDAPI_KEY"]      || "",
      hotel:   row.hotelApiKey     || process.env["HOTELBEDS_API_KEY"] || "",
      payment: row.paymentApiKey   || process.env["RAZORPAY_KEY_ID"]   || "",
      tbo:     row.tboApiKey       || process.env["TBO_API_KEY"]       || "",
    };
    const secretMap: Record<string, string> = {
      payment: row.paymentApiSecret || process.env["RAZORPAY_KEY_SECRET"] || "",
      hotel:   row.hotelApiSecret   || process.env["HOTELBEDS_SECRET"]    || "",
    };

    const key = map[which] ?? "";
    if (!key) {
      return res.json({ success: true, ok: false, message: "No API key configured for this provider. Set one above and save first." });
    }

    // ── TripJack live probe — two-step: get token, then call search ────────
    if (which === "flight") {
      const payload = {
        searchQuery: {
          cabinClass: "ECONOMY",
          paxInfo: { ADULT: 1, CHILD: 0, INFANT: 0 },
          routeInfos: [
            {
              fromCityOrAirport: { code: "DEL" },
              toCityOrAirport:   { code: "BOM" },
              travelDate: "2026-05-10",
            },
          ],
          searchModifiers: { isDirectFlight: false },
        },
      };

      try {
        // Step 1 — fetch Bearer token from TripJack auth endpoint
        const tokenRes = await fetch("https://apitest.tripjack.com/auth/v1/token", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ apiKey: key.trim() }),
          signal:  AbortSignal.timeout(10_000),
        });
        const tokenBody: any = await tokenRes.json().catch(() => ({}));
        console.log("[api-keys] TripJack token response:", JSON.stringify(tokenBody));

        const token: string =
          tokenBody?.token?.value
          ?? tokenBody?.token
          ?? tokenBody?.access_token
          ?? tokenBody?.data?.token
          ?? "";

        if (!token) {
          const desc =
            tokenBody?.status?.messages?.[0]?.description
            ?? tokenBody?.message
            ?? "No token returned";
          return res.json({ success: true, ok: false, message: `TripJack token error: ${desc}` });
        }

        // Step 2 — call search with Bearer token
        const r = await fetch("https://apitest.tripjack.com/fms/v1/air/search", {
          method:  "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body:    JSON.stringify(payload),
          signal:  AbortSignal.timeout(15_000),
        });

        const body: any = await r.json().catch(() => ({}));
        console.log("[api-keys] TripJack search response:", JSON.stringify(body));

        const statusBlock = body?.status;
        if (statusBlock?.success === false) {
          const desc = statusBlock?.messages?.[0]?.description
            || statusBlock?.messages?.[0]?.code
            || body?.message
            || "Authentication or validation error";
          return res.json({ success: true, ok: false, message: `TripJack error: ${desc}` });
        }
        if (body?.searchResult || body?.tripInfos || statusBlock?.success === true) {
          return res.json({ success: true, ok: true, message: "TripJack API key is valid and working." });
        }
        const fallback = body?.message || body?.error || `HTTP ${r.status}`;
        return res.json({ success: true, ok: false, message: `TripJack error: ${fallback}` });
      } catch (err: any) {
        if (err.name === "TimeoutError" || err.code === "ABORT_ERR") {
          return res.json({ success: true, ok: false, message: "TripJack did not respond within 15 seconds. Check your network or try again." });
        }
        return res.json({ success: true, ok: false, message: `Could not reach TripJack: ${err.message}` });
      }
    }

    // ── Razorpay live probe ────────────────────────────────────────────────
    if (which === "payment") {
      const secret = secretMap.payment;
      if (!secret) {
        return res.json({ success: true, ok: false, message: "Razorpay Key Secret is not configured. Save both Key ID and Key Secret before testing." });
      }
      try {
        const credentials = Buffer.from(`${key}:${secret}`).toString("base64");
        const r = await fetch("https://api.razorpay.com/v1/orders?count=1", {
          headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const body: any = await r.json().catch(() => ({}));

        if (r.status === 401) {
          return res.json({ success: true, ok: false, message: "Razorpay rejected the credentials. Check your Key ID and Key Secret." });
        }
        if (!r.ok) {
          const msg = body?.error?.description || body?.error || `HTTP ${r.status}`;
          return res.json({ success: true, ok: false, message: `Razorpay error: ${msg}` });
        }
        const mode = key.startsWith("rzp_live_") ? "live" : "test";
        return res.json({ success: true, ok: true, message: `Razorpay credentials verified (${mode} mode).` });
      } catch (err: any) {
        if (err.name === "TimeoutError" || err.code === "ABORT_ERR") {
          return res.json({ success: true, ok: false, message: "Razorpay did not respond within 10 seconds." });
        }
        return res.json({ success: true, ok: false, message: `Could not reach Razorpay: ${err.message}` });
      }
    }

    // ── HotelBeds live probe (X-Signature auth) ───────────────────────────
    if (which === "hotel") {
      const secret = secretMap.hotel;
      if (!secret) {
        return res.json({ success: true, ok: false, message: "HotelBeds API Secret is not configured. Save both API Key and API Secret before testing." });
      }
      try {
        const ts  = Math.floor(Date.now() / 1000).toString();
        const sig = (await import("crypto")).default.createHash("sha256").update(key.trim() + secret.trim() + ts).digest("hex");
        const r   = await fetch("https://api.test.hotelbeds.com/hotel-content-api/1.0/status", {
          headers: { "Api-key": key.trim(), "X-Signature": sig, "Accept": "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const body: any = await r.json().catch(() => ({}));
        console.log("[api-keys] HotelBeds response:", JSON.stringify(body));
        if (r.status === 200) {
          return res.json({ success: true, ok: true, message: "HotelBeds credentials verified." });
        }
        const msg = body?.error?.message || body?.message || `HTTP ${r.status}`;
        return res.json({ success: true, ok: false, message: `HotelBeds error: ${msg}` });
      } catch (err: any) {
        if (err.name === "TimeoutError" || err.code === "ABORT_ERR") {
          return res.json({ success: true, ok: false, message: "HotelBeds did not respond within 10 seconds." });
        }
        return res.json({ success: true, ok: false, message: `Could not reach HotelBeds: ${err.message}` });
      }
    }

    // ── TBO / Bus — format check only (no public test endpoint) ────────────
    const looksValid = key.trim().length >= 8;
    const providerLabels: Record<string, string> = {
      tbo:   "TBO",
      bus:   "Bus provider",
      hotel: "Hotel provider",
    };
    const label = providerLabels[which] ?? which;
    return res.json({
      success: true,
      ok: looksValid,
      message: looksValid
        ? `${label} key is configured and looks well-formed. Live validation is not available for this provider.`
        : `${label} key is configured but appears too short — please double-check it.`,
    });

  } catch (err) {
    logger.error({ err }, "[api-keys] test failed");
    return res.status(500).json({ success: false, error: "Test failed" });
  }
});

export default router;
