import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Key-value settings store. One row per namespace (branding, site, website, notification).
 * `data` is a JSON-serialised object.  Using text so PostgreSQL doesn't require JSONB extension.
 */
export const appSettingsTable = pgTable("app_settings", {
  namespace: text("namespace").primaryKey(),
  data:      text("data").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppSettingsRow = typeof appSettingsTable.$inferSelect;
