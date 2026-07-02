import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { logger } from "./logger.js";
import { UPLOADS_DIR } from "./uploads.js";

type BrandingRow = {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  [key: string]: unknown;
};

async function dataUrlToFile(dataUrl: string, prefix: string): Promise<string | null> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const [, mime, b64] = m;
  const ext = (mime?.split("/")?.[1] ?? "bin").replace("svg+xml", "svg").replace("vnd.microsoft.icon", "ico");
  const filename = `${prefix}-migrated-${Date.now()}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(b64!, "base64"));
  return `/uploads/${filename}`;
}

export async function migrateLogoToFile(): Promise<void> {
  try {
    const [row] = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.namespace, "branding"))
      .limit(1);

    if (!row) return;

    const data: BrandingRow = JSON.parse(row.data);
    let changed = false;

    if (typeof data.logoUrl === "string" && data.logoUrl.startsWith("data:")) {
      const fileUrl = await dataUrlToFile(data.logoUrl, "logo");
      if (fileUrl) {
        data.logoUrl = fileUrl;
        changed = true;
        logger.info({ fileUrl }, "[migrate-logo] Logo data URL converted to file");
      }
    }

    if (typeof data.faviconUrl === "string" && data.faviconUrl.startsWith("data:")) {
      const fileUrl = await dataUrlToFile(data.faviconUrl, "favicon");
      if (fileUrl) {
        data.faviconUrl = fileUrl;
        changed = true;
        logger.info({ fileUrl }, "[migrate-logo] Favicon data URL converted to file");
      }
    }

    if (!changed) return;

    const json = JSON.stringify(data);
    await db
      .insert(appSettingsTable)
      .values({ namespace: "branding", data: json, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettingsTable.namespace,
        set: { data: json, updatedAt: new Date() },
      });

    logger.info("[migrate-logo] Branding settings updated in DB");
  } catch (err) {
    logger.warn({ err }, "[migrate-logo] Non-critical: migration failed, will retry on next start");
  }
}
