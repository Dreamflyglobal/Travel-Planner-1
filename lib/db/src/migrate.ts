/**
 * Safe migration runner — handles two scenarios:
 *
 * 1. Fresh database (DigitalOcean, CI, new env):
 *    Tables do not exist → runs all migrations in order.
 *
 * 2. Existing database (created via `db:push` in dev):
 *    Tables exist but drizzle's tracking table doesn't →
 *    baseline-stamps all migrations as "applied" in the correct
 *    drizzle schema, then migrate() skips them cleanly.
 *
 * Run:  pnpm db:migrate
 *   or: pnpm --filter @workspace/db run migrate
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.join(__dirname, "../migrations");

// drizzle-orm defaults — must match PgDialect.migrate()
const DRIZZLE_SCHEMA = "drizzle";
const DRIZZLE_TABLE  = "__drizzle_migrations";
const FULL_TABLE     = `"${DRIZZLE_SCHEMA}"."${DRIZZLE_TABLE}"`;

// ── helpers ──────────────────────────────────────────────────────────────────

async function tableExistsInSchema(schema: string, table: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  return (r.rowCount ?? 0) > 0;
}

async function publicTableExists(name: string): Promise<boolean> {
  return tableExistsInSchema("public", name);
}

/** drizzle-orm hash = SHA-256 of raw SQL file bytes (no normalization) */
function migrationHash(rawSql: string): string {
  return createHash("sha256").update(rawSql).digest("hex");
}

async function stampAllMigrations(): Promise<void> {
  // Ensure drizzle schema + tracking table exist (mirrors what migrate() does)
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${DRIZZLE_SCHEMA}"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${FULL_TABLE} (
      id         SERIAL PRIMARY KEY,
      hash       TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const journalPath = path.join(migrationsFolder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };

  for (const entry of journal.entries) {
    const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const rawSql  = readFileSync(sqlPath, "utf-8");
    const hash    = migrationHash(rawSql);

    await pool.query(
      `INSERT INTO ${FULL_TABLE} (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when]
    );
    console.log(`  📌  Stamped: ${entry.tag}`);
    console.log(`       hash  : ${hash.slice(0, 16)}…`);
    console.log(`       when  : ${entry.when}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🔄  Dream Fly Global — Database Migration Runner");
  console.log("─".repeat(52));

  try {
    const trackingExists  = await tableExistsInSchema(DRIZZLE_SCHEMA, DRIZZLE_TABLE);
    const appTablesExist  = await publicTableExists("users");

    // Check whether tracking table has any stamped rows
    let trackingHasRows = false;
    if (trackingExists) {
      const r = await pool.query(`SELECT 1 FROM ${FULL_TABLE} LIMIT 1`);
      trackingHasRows = (r.rowCount ?? 0) > 0;
    }

    if (appTablesExist && !trackingHasRows) {
      // Existing push-created DB (or previous failed run left an empty table)
      // → baseline-stamp so migrate() sees them as already applied
      console.log("  ℹ️   Existing database detected (from db:push).");
      console.log("  📌  Baseline-stamping migrations into drizzle schema…");
      console.log("");
      await stampAllMigrations();
      console.log("");
      console.log("  ✅  Baseline complete.");
      console.log("      Future schema changes will run via migrate() normally.");
    } else if (!appTablesExist) {
      console.log("  🆕  Fresh database — all migrations will be applied.");
    } else {
      console.log("  ✅  Migration tracking already initialised.");
    }

    console.log("");
    console.log("▶   Running drizzle-orm migrate()…");

    // Applies any migration whose folderMillis > lastDbMigration.created_at
    // On a stamped DB this is a no-op; on a fresh DB this creates all tables.
    await migrate(db, { migrationsFolder });

    console.log("");
    console.log("✅  Migration complete — database is up to date.");
  } catch (err) {
    console.error("\n❌  Migration failed:", (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
