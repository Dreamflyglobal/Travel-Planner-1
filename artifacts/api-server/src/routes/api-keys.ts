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
  const envFlight  = process.env["TRIPJACK_API_KEY"] ?? "";
  const envHotel   = process.env["HOTELBEDS_API_KEY"] ?? "";
  const envBus     = process.env["RAPIDAPI_KEY"] ?? "";
  const envTboKey  = process.env["TBO_API_KEY"] ?? "";

  const flightDb      = row?.flightApiKey      ?? "";
  const busDb         = row?.busApiKey         ?? "";
  const hotelDb       = row?.hotelApiKey       ?? "";
  const payKeyDb      = row?.paymentApiKey     ?? "";
  const paySecretDb   = row?.paymentApiSecret  ?? "";
  const tboApiKeyDb   = row?.tboApiKey         ?? "";
  const flightProvider = row?.flightProvider   ?? "tripjack";

  const flight    = flightDb    || envFlight;
  const bus       = busDb       || envBus;
  const hotel     = hotelDb     || envHotel;
  const tboKey    = tboApiKeyDb || envTboKey;

  return {
    keys: {
      flightApiKey:     { masked: maskKey(flight),    set: !!flight,    source: flightDb    ? "db" : envFlight  ? "env" : "none" },
      busApiKey:        { masked: maskKey(bus),        set: !!bus,        source: busDb       ? "db" : envBus     ? "env" : "none" },
      hotelApiKey:      { masked: maskKey(hotel),      set: !!hotel,      source: hotelDb     ? "db" : envHotel   ? "env" : "none" },
      paymentApiKey:    { masked: maskKey(payKeyDb || process.env["RAZORPAY_KEY_ID"] || ""),    set: !!(payKeyDb || process.env["RAZORPAY_KEY_ID"]),    source: payKeyDb    ? "db" : process.env["RAZORPAY_KEY_ID"]    ? "env" : "none" },
      paymentApiSecret: { masked: maskKey(paySecretDb || process.env["RAZORPAY_KEY_SECRET"] || ""), set: !!(paySecretDb || process.env["RAZORPAY_KEY_SECRET"]), source: paySecretDb ? "db" : process.env["RAZORPAY_KEY_SECRET"] ? "env" : "none" },
      tboApiKey:        { masked: maskKey(tboKey),     set: !!tboKey,     source: tboApiKeyDb ? "db" : envTboKey  ? "env" : "none" },
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
      flight:  row.flightApiKey     || process.env["TRIPJACK_API_KEY"] || "",
      bus:     row.busApiKey        || process.env["RAPIDAPI_KEY"]     || "",
      hotel:   row.hotelApiKey      || process.env["HOTELBEDS_API_KEY"]|| "",
      payment: row.paymentApiKey    || process.env["RAZORPAY_KEY_ID"]  || "",
      tbo:     row.tboApiKey        || process.env["TBO_API_KEY"]      || "",
    };

    const key = map[which] ?? "";
    if (!key) {
      return res.json({ success: false, ok: false, message: "No key configured for this provider." });
    }
    const looksValid = key.trim().length >= 8;
    return res.json({
      success: true,
      ok: looksValid,
      message: looksValid ? "Key is set and looks well-formed." : "Key is configured but appears too short.",
    });
  } catch (err) {
    logger.error({ err }, "[api-keys] test failed");
    return res.status(500).json({ success: false, error: "Test failed" });
  }
});

export default router;
