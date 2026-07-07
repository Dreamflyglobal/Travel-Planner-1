/**
 * GET /api/tripjack-diag
 *
 * Returns TripJack configuration status so you can verify what is loaded on
 * any server (DigitalOcean, Replit, etc.) without exposing the full API key.
 *
 * Example:
 *   curl https://your-server.com/api/tripjack-diag
 *
 * Response shape:
 *   {
 *     baseUrl:        "https://api.tripjack.com",
 *     keyConfigured:  true,
 *     keySource:      "env" | "db" | "none",
 *     keyPrefix:      "AbCd****",   // first 4 chars + masked tail
 *     keyLength:      32,
 *     tokenExchange:  "ok" | "failed" | "skipped",
 *     tokenMessage:   "(reason if failed)",
 *     dbHasKey:       false,
 *   }
 */
import { Router, type IRouter } from "express";
import axios from "axios";
import { db, apiKeysTable } from "@workspace/db";
import { TRIPJACK_BASE } from "../lib/tripjack-auth.js";

const router: IRouter = Router();

router.get("/tripjack-diag", async (_req, res): Promise<void> => {
  try {
    const rows    = await db.select().from(apiKeysTable).limit(1);
    const dbRow   = rows[0];
    const dbKey   = dbRow?.flightApiKey?.trim() ?? "";
    const envKey  = (process.env["TRIPJACK_API_KEY"] ?? "").trim();

    const activeKey = dbKey || envKey;
    const keySource: "db" | "env" | "none" =
      dbKey  ? "db"  :
      envKey ? "env" :
               "none";

    const mask = (k: string) =>
      k.length <= 4 ? "****" : k.slice(0, 4) + "****";

    let tokenExchange: "ok" | "failed" | "skipped" = "skipped";
    let tokenMessage = "";

    if (activeKey) {
      try {
        const resp = await axios.post(
          `${TRIPJACK_BASE}/auth/v1/token`,
          { apiKey: activeKey },
          { headers: { "Content-Type": "application/json" }, timeout: 10_000 },
        );
        const data = resp.data;
        if (data?.status?.success === false) {
          const reason =
            data?.errors?.[0]?.message ??
            data?.status?.messages?.[0]?.description ??
            "rejected by TripJack";
          tokenExchange = "failed";
          tokenMessage  = reason;
        } else if (data?.tokenId || data?.data?.tokenId || data?.token) {
          tokenExchange = "ok";
        } else {
          tokenExchange = "failed";
          tokenMessage  = "tokenId not found in response";
        }
      } catch (err: any) {
        tokenExchange = "failed";
        tokenMessage  =
          err?.response?.data?.errors?.[0]?.message ??
          err?.response?.data?.error ??
          err?.message ??
          "network error";
      }
    }

    res.json({
      baseUrl:       TRIPJACK_BASE,
      keyConfigured: !!activeKey,
      keySource,
      keyPrefix:     activeKey ? mask(activeKey) : "(none)",
      keyLength:     activeKey.length,
      tokenExchange,
      tokenMessage:  tokenMessage || undefined,
      dbHasKey:      !!dbKey,
      note: "keyPrefix shows first 4 chars only — verify these match your TripJack API key",
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Diagnostic failed" });
  }
});

export default router;
