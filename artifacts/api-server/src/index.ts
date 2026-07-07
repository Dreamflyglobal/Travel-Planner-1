import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { recoverPendingFollowUps } from "./lib/followup-scheduler.js";
import { seedPackagesIfEmpty } from "./routes/holiday-packages.js";
import { startDailyOfferCron } from "./lib/marketing-scheduler.js";
import { migrateLogoToFile } from "./lib/migrate-logo.js";
import { startTjBookingPoller } from "./lib/tj-booking-poller.js";

const rawPort = process.env["PORT"] || "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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

  // Start background TripJack booking status poller — updates pending bookings
  // to CONFIRMED and writes PNR/ticket numbers once TripJack confirms them.
  startTjBookingPoller();

  // One-time migration: convert any data-URL logos stored in the DB to files
  // so the branding API response is small and the logo URL can be cached.
  migrateLogoToFile().catch((e) =>
    logger.warn({ err: e }, "Logo migration failed (non-critical)")
  );
});
