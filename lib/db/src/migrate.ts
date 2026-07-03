/**
 * Dream Fly Global — Database Migration Runner
 *
 * Handles two scenarios automatically:
 *
 *   1. Fresh database (new DigitalOcean droplet, CI):
 *      Tables don't exist → all migrations run in order.
 *
 *   2. Existing database (created via `pnpm db:push` in dev):
 *      Tables exist but drizzle's tracking table doesn't →
 *      baseline-stamps all migrations as applied, then future
 *      migrations run normally.
 *
 * Run:  pnpm db:migrate
 *
 * DATABASE_URL is loaded automatically from the project root .env file.
 * If DATABASE_URL is already set in the environment (platform injection),
 * the .env file value is ignored (override: false).
 */

import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load .env from project root before importing db (which checks DATABASE_URL)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenvConfig({ path: path.resolve(__dirname, "../../../.env"), override: false });

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const migrationsFolder = path.join(__dirname, "../migrations");

// Must match drizzle-orm's PgDialect.migrate() defaults exactly
const DRIZZLE_SCHEMA = "drizzle";
const DRIZZLE_TABLE  = "__drizzle_migrations";
const FULL_TABLE     = `"${DRIZZLE_SCHEMA}"."${DRIZZLE_TABLE}"`;

// ── helpers ───────────────────────────────────────────────────────────────────

async function tableExistsInSchema(schema: string, table: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Hash formula used by drizzle-orm internally:
 * SHA-256 of the raw SQL file bytes — no normalization.
 * Must match exactly or migrate() won't recognise the stamp.
 */
function migrationHash(rawSql: string): string {
  return createHash("sha256").update(rawSql).digest("hex");
}

async function stampAllMigrations(): Promise<void> {
  // Mirror what drizzle-orm's migrate() creates so hashes are recognised
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
      [hash, entry.when],
    );
    console.log(`  📌  Stamped: ${entry.tag}`);
    console.log(`       hash : ${hash.slice(0, 16)}…`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🔄  Dream Fly Global — Database Migration Runner");
  console.log("─".repeat(52));

  try {
    const trackingExists = await tableExistsInSchema(DRIZZLE_SCHEMA, DRIZZLE_TABLE);
    const appTablesExist = await tableExistsInSchema("public", "users");

    // Tracking table may exist but be empty (e.g. from a previous failed run)
    let trackingHasRows = false;
    if (trackingExists) {
      const r = await pool.query(`SELECT 1 FROM ${FULL_TABLE} LIMIT 1`);
      trackingHasRows = (r.rowCount ?? 0) > 0;
    }

    if (appTablesExist && !trackingHasRows) {
      console.log("  ℹ️   Existing database detected.");
      console.log("  📌  Baseline-stamping migrations so future runs are incremental…");
      console.log("");
      await stampAllMigrations();
      console.log("");
      console.log("  ✅  Baseline complete — future migrations will run normally.");
    } else if (!appTablesExist) {
      console.log("  🆕  Fresh database — all migrations will be applied.");
    } else {
      console.log("  ✅  Migration tracking already initialised.");
    }

    console.log("");
    console.log("▶   Running drizzle-orm migrate()…");

    // On a stamped DB: no-op (all folderMillis ≤ last created_at).
    // On a fresh DB: creates all 21 tables.
    // On subsequent runs: applies only new migrations.
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
