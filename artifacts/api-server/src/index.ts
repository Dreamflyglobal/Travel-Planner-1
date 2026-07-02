import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { recoverPendingFollowUps } from "./lib/followup-scheduler.js";
import { seedPackagesIfEmpty } from "./routes/holiday-packages.js";
import { startDailyOfferCron } from "./lib/marketing-scheduler.js";
import { connectMongoDB } from "./config/db.js";
import { migrateLogoToFile } from "./lib/migrate-logo.js";

const rawPort = process.env["PORT"] || "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Attempt MongoDB connection before starting the server.
// connectMongoDB() never throws — it logs errors internally and resolves either way.
await connectMongoDB();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  recoverPendingFollowUps().catch((e) =>
    logger.error({ err: e }, "Follow-up recovery failed")
  );

  seedPackagesIfEmpty().catch((e) =>
    logger.error({ err: e }, "Package seed failed")
  );

  startDailyOfferCron();

  // One-time migration: convert any data-URL logos stored in the DB to files
  // so the branding API response is small and the logo URL can be cached.
  migrateLogoToFile().catch((e) =>
    logger.warn({ err: e }, "Logo migration failed (non-critical)")
  );
});
