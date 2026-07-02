import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { requireAdmin } from "../middlewares/auth.js";

const router: IRouter = Router();

const VALID_NAMESPACES = new Set([
  "branding", "site", "website", "notification",
  "markup_convenience", "markup_hidden", "markup_agent", "markup_simple",
  "paymentmode", "autorefund",
  "cms",
  "activities",
  "blocked_users",
]);

// ── GET /settings/:namespace ──────────────────────────────────────────────────
router.get("/settings/:namespace", async (req, res): Promise<void> => {
  const ns = req.params.namespace?.toLowerCase();
  if (!VALID_NAMESPACES.has(ns)) {
    res.status(400).json({ error: "Invalid namespace" });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.namespace, ns))
      .limit(1);
    const data = row ? JSON.parse(row.data) : {};
    res.json(data);
  } catch (err) {
    logger.error({ err, ns }, "[settings] GET failed");
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// ── GET /settings/verify/all  (admin only) ────────────────────────────────────
router.get("/settings/verify/all", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(appSettingsTable);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try { result[row.namespace] = JSON.parse(row.data); } catch { result[row.namespace] = row.data; }
    }
    res.json({
      ok: true,
      count: rows.length,
      namespaces: Object.keys(result),
      settings: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "[settings] verify/all failed");
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// ── PUT /settings/:namespace  (admin only) ────────────────────────────────────
router.put("/settings/:namespace", requireAdmin, async (req, res): Promise<void> => {
  const ns = req.params.namespace?.toLowerCase();
  if (!VALID_NAMESPACES.has(ns)) {
    res.status(400).json({ error: "Invalid namespace" });
    return;
  }
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "Body must be a JSON object" });
      return;
    }
    const json = JSON.stringify(body);

    await db
      .insert(appSettingsTable)
      .values({ namespace: ns, data: json, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettingsTable.namespace,
        set:    { data: json, updatedAt: new Date() },
      });

    logger.info({ ns }, "[settings] saved");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, ns }, "[settings] PUT failed");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
