import { Router, type IRouter } from "express";
import { AppSettingsModel } from "../models/app-settings.model.js";
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
    const doc = await AppSettingsModel.findOne({ namespace: ns }).lean();
    res.json(doc?.data ?? {});
  } catch (err) {
    logger.error({ err, ns }, "[settings] GET failed");
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// ── GET /settings/verify/all  (admin only) ────────────────────────────────────
router.get("/settings/verify/all", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const docs = await AppSettingsModel.find({}).lean();
    const result: Record<string, unknown> = {};
    for (const doc of docs) {
      result[doc.namespace] = doc.data;
    }
    res.json({
      ok: true,
      count: docs.length,
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

    await AppSettingsModel.findOneAndUpdate(
      { namespace: ns },
      { $set: { namespace: ns, data: body, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    logger.info({ ns }, "[settings] saved to MongoDB");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, ns }, "[settings] PUT failed");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
