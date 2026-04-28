import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db, apiKeysTable } from "@workspace/db";
import { verifyToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";

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

// ── POST /api/admin/test-tripjack ─────────────────────────────────────────
router.post("/admin/test-tripjack", requireAdmin, async (_req, res) => {
  try {
    const { tripjackKey } = await getKeys();
    if (!tripjackKey) {
      return res.json({ success: true, ok: false, message: "TripJack API key is not configured. Set it in Admin → API Keys and save first." });
    }

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

    const r = await fetch("https://apitest.tripjack.com/fms/v1/air/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: tripjackKey.trim() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });

    const body: any = await r.json().catch(() => ({}));
    console.log("[test-tripjack] response:", JSON.stringify(body));

    if (r.status === 200) {
      return res.json({ success: true, ok: true, message: "TripJack API key is valid and working." });
    }
    const msg = body?.message || body?.error || body?.errors?.[0] || `HTTP ${r.status}`;
    return res.json({ success: true, ok: false, message: `TripJack error: ${msg}` });
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.code === "ABORT_ERR") {
      return res.json({ success: true, ok: false, message: "TripJack did not respond within 12 seconds." });
    }
    logger.error({ err }, "[test-tripjack] failed");
    return res.json({ success: true, ok: false, message: `Could not reach TripJack: ${err.message}` });
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
