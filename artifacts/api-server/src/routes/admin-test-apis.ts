import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import axios from "axios";
import { db, apiKeysTable } from "@workspace/db";
import { verifyToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";
import { bustTripJackToken, TRIPJACK_BASE } from "../lib/tripjack-auth.js";

const router = Router();

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
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

async function getKeys() {
  const rows = await db.select().from(apiKeysTable).limit(1);
  const row  = rows[0] ?? {};
  return {
    tripjackKey:    (row as any).flightApiKey    || process.env["TRIPJACK_API_KEY"]    || "",
    razorpayKey:    (row as any).paymentApiKey   || process.env["RAZORPAY_KEY_ID"]     || "",
    razorpaySecret: (row as any).paymentApiSecret|| process.env["RAZORPAY_KEY_SECRET"] || "",
    hotelbedsKey:   (row as any).hotelApiKey     || process.env["HOTELBEDS_API_KEY"]   || "",
    hotelbedsSecret:(row as any).hotelApiSecret  || process.env["HOTELBEDS_SECRET"]    || "",
  };
}

// ── TripJack two-step auth helper ─────────────────────────────────────────
// Step 1: POST /auth/token { apiKey } → get Bearer token
// Step 2: use Authorization: Bearer <token> on all subsequent calls

const TRIPJACK_TEST_PAYLOAD = {
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

async function fetchTripJackToken(apiKey: string): Promise<string> {
  console.log("[tripjack-test] Step 1: POST /auth/v1/token");
  const { data } = await axios.post(
    `${TRIPJACK_BASE}/auth/v1/token`,
    { apiKey },
    { headers: { "Content-Type": "application/json" }, timeout: 10_000 }
  );
  console.log("[tripjack-test] Token response:", JSON.stringify(data));

  const token: string =
    data?.token?.value
    ?? data?.token
    ?? data?.access_token
    ?? data?.data?.token
    ?? "";

  if (!token) {
    const desc =
      data?.status?.messages?.[0]?.description
      ?? data?.message
      ?? "No token returned";
    throw new Error(`TripJack token error: ${desc}`);
  }
  return token;
}

function parseTripJackSearchResult(body: any): { ok: boolean; message: string } {
  const statusBlock = body?.status;
  if (statusBlock?.success === false) {
    const desc = statusBlock?.messages?.[0]?.description
      || statusBlock?.messages?.[0]?.code
      || body?.message
      || "Authentication or validation error";
    return { ok: false, message: `TripJack error: ${desc}` };
  }
  if (body?.searchResult || body?.tripInfos || statusBlock?.success === true) {
    return { ok: true, message: "TripJack API key is valid and working." };
  }
  const fallback = body?.message || body?.error || "Unexpected response from TripJack";
  return { ok: false, message: `TripJack error: ${fallback}` };
}

// ── POST /api/admin/test-tripjack ─────────────────────────────────────────
router.post("/admin/test-tripjack", requireAdmin, async (_req, res) => {
  try {
    const { tripjackKey } = await getKeys();
    if (!tripjackKey) {
      return res.json({ success: true, ok: false, message: "TripJack API key is not configured. Set it in Admin → API Keys and save first." });
    }

    const token = await fetchTripJackToken(tripjackKey.trim());

    const { data: body } = await axios.post(
      `${TRIPJACK_BASE}/fms/v1/air/search`,
      TRIPJACK_TEST_PAYLOAD,
      {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        timeout: 15_000,
      }
    );
    console.log("[test-tripjack] response:", JSON.stringify(body));

    const { ok, message } = parseTripJackSearchResult(body);
    return res.json({ success: true, ok, message });
  } catch (err: any) {
    bustTripJackToken();
    const msg = err.response?.data?.status?.messages?.[0]?.description
      || err.response?.data?.message
      || err.message;
    logger.error({ err }, "[test-tripjack] failed");
    return res.json({ success: true, ok: false, message: `TripJack error: ${msg}` });
  }
});

// ── POST /api/test-tripjack-real ───────────────────────────────────────────
// Two-step: (1) get token from /auth/token, (2) call /fms/v1/air/search
// Full response logged and returned to frontend.
router.post("/test-tripjack-real", requireAdmin, async (_req, res) => {
  try {
    const { tripjackKey } = await getKeys();
    if (!tripjackKey) {
      return res.json({ success: false, ok: false, message: "TripJack API key is not configured. Set it in Admin → API Keys and save first." });
    }

    // Step 1 — get token
    let token: string;
    try {
      token = await fetchTripJackToken(tripjackKey.trim());
    } catch (tokenErr: any) {
      const msg = tokenErr.response?.data?.status?.messages?.[0]?.description
        || tokenErr.response?.data?.message
        || tokenErr.message;
      console.error("[test-tripjack-real] Token fetch failed:", msg);
      return res.json({ success: false, ok: false, message: `TripJack token error: ${msg}` });
    }

    // Step 2 — call search API
    console.log("[test-tripjack-real] Step 2: POST /fms/v1/air/search");
    console.log("[test-tripjack-real] Payload:", JSON.stringify(TRIPJACK_TEST_PAYLOAD));

    const { data } = await axios.post(
      `${TRIPJACK_BASE}/fms/v1/air/search`,
      TRIPJACK_TEST_PAYLOAD,
      {
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        timeout: 15_000,
      }
    );

    console.log("[test-tripjack-real] response.data:", JSON.stringify(data));

    const { ok, message } = parseTripJackSearchResult(data);
    return res.json({ success: true, ok, message, data });
  } catch (err: any) {
    bustTripJackToken();
    const msg = err.response?.data?.status?.messages?.[0]?.description
      || err.response?.data?.message
      || err.message;
    logger.error({ err }, "[test-tripjack-real] failed");
    return res.json({ success: false, ok: false, message: `TripJack error: ${msg}` });
  }
});

// ── POST /api/admin/test-razorpay ─────────────────────────────────────────
router.post("/admin/test-razorpay", requireAdmin, async (_req, res) => {
  try {
    const { razorpayKey, razorpaySecret } = await getKeys();
    if (!razorpayKey) {
      return res.json({ success: true, ok: false, message: "Razorpay Key ID is not configured. Set it in Admin → API Keys and save first." });
    }
    if (!razorpaySecret) {
      return res.json({ success: true, ok: false, message: "Razorpay Key Secret is not configured. Save both Key ID and Key Secret before testing." });
    }

    const credentials = Buffer.from(`${razorpayKey.trim()}:${razorpaySecret.trim()}`).toString("base64");
    const r = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await r.json().catch(() => ({}));
    console.log("[test-razorpay] status:", r.status);

    if (r.status === 200) {
      const mode = razorpayKey.startsWith("rzp_live_") ? "live" : "test";
      return res.json({ success: true, ok: true, message: `Razorpay credentials verified (${mode} mode).` });
    }
    if (r.status === 401) {
      return res.json({ success: true, ok: false, message: "Razorpay rejected the credentials. Check your Key ID and Key Secret." });
    }
    const msg = body?.error?.description || body?.error || `HTTP ${r.status}`;
    return res.json({ success: true, ok: false, message: `Razorpay error: ${msg}` });
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.code === "ABORT_ERR") {
      return res.json({ success: true, ok: false, message: "Razorpay did not respond within 10 seconds." });
    }
    logger.error({ err }, "[test-razorpay] failed");
    return res.json({ success: true, ok: false, message: `Could not reach Razorpay: ${err.message}` });
  }
});

// ── POST /api/admin/test-hotelbeds ────────────────────────────────────────
router.post("/admin/test-hotelbeds", requireAdmin, async (_req, res) => {
  try {
    const { hotelbedsKey, hotelbedsSecret } = await getKeys();
    if (!hotelbedsKey) {
      return res.json({ success: true, ok: false, message: "HotelBeds API Key is not configured. Set it in Admin → API Keys and save first." });
    }
    if (!hotelbedsSecret) {
      return res.json({ success: true, ok: false, message: "HotelBeds API Secret is not configured. Save both API Key and API Secret before testing." });
    }

    const ts  = Math.floor(Date.now() / 1000).toString();
    const sig = crypto.createHash("sha256").update(hotelbedsKey.trim() + hotelbedsSecret.trim() + ts).digest("hex");

    const r = await fetch("https://api.test.hotelbeds.com/hotel-content-api/1.0/status", {
      headers: {
        "Api-key":   hotelbedsKey.trim(),
        "X-Signature": sig,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await r.json().catch(() => ({}));
    console.log("[test-hotelbeds] response:", JSON.stringify(body));

    if (r.status === 200) {
      return res.json({ success: true, ok: true, message: "HotelBeds credentials verified." });
    }
    const msg = body?.error?.message || body?.message || `HTTP ${r.status}`;
    return res.json({ success: true, ok: false, message: `HotelBeds error: ${msg}` });
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.code === "ABORT_ERR") {
      return res.json({ success: true, ok: false, message: "HotelBeds did not respond within 10 seconds." });
    }
    logger.error({ err }, "[test-hotelbeds] failed");
    return res.json({ success: true, ok: false, message: `Could not reach HotelBeds: ${err.message}` });
  }
});

// ── POST /api/admin/api-settings (alias for /api/admin/api-keys) ──────────
// Accepts: { tripjackKey, razorpayKey, razorpaySecret, hotelbedsKey, hotelbedsSecret }
// Maps to the canonical field names and forwards to the existing storage logic
router.post("/admin/api-settings", requireAdmin, async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, string>;
    const update: Record<string, string | null> = {};

    const fieldMap: Record<string, string> = {
      tripjackKey:     "flightApiKey",
      razorpayKey:     "paymentApiKey",
      razorpaySecret:  "paymentApiSecret",
      hotelbedsKey:    "hotelApiKey",
      hotelbedsSecret: "hotelApiSecret",
    };
    for (const [alias, canonical] of Object.entries(fieldMap)) {
      if (b[alias] !== undefined) {
        const v = String(b[alias]).trim();
        update[canonical] = v || null;
      }
    }

    if (Object.keys(update).length > 0) {
      const rows = await db.select().from(apiKeysTable).limit(1);
      if (rows.length === 0) {
        await db.insert(apiKeysTable).values({ ...update, updatedAt: new Date() } as any);
      } else {
        const { eq } = await import("drizzle-orm");
        await db.update(apiKeysTable).set({ ...update, updatedAt: new Date() } as any).where(eq(apiKeysTable.id, rows[0].id));
      }
    }
    return res.json({ success: true, message: "API settings saved." });
  } catch (err: any) {
    logger.error({ err }, "[api-settings] POST failed");
    return res.status(500).json({ success: false, error: "Failed to save API settings" });
  }
});

export default router;
