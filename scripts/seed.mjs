/**
 * Seed script — populates default data for a fresh PostgreSQL database.
 * Run with: pnpm db:seed  (or: node scripts/seed.mjs)
 *
 * DATABASE_URL must be set before running.
 */

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set. Exiting.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  return pool.query(sql, params);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function upsertSetting(namespace, data) {
  await query(
    `INSERT INTO app_settings (namespace, data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (namespace)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [namespace, JSON.stringify(data)]
  );
  console.log(`  ✅  app_settings["${namespace}"] seeded`);
}

// ─── Booking counters ─────────────────────────────────────────────────────────

async function seedBookingCounters() {
  console.log("\n📦  Seeding booking_counters…");
  const types = ["FLY", "BUS", "HOT", "HOL", "TRN", "VIS"];
  for (const type of types) {
    await query(
      `INSERT INTO booking_counters (type, counter)
       VALUES ($1, 0)
       ON CONFLICT (type) DO NOTHING`,
      [type]
    );
    console.log(`  ✅  booking_counters["${type}"] seeded`);
  }
}

// ─── Admin settings (all namespaces) ─────────────────────────────────────────

async function seedAppSettings() {
  console.log("\n⚙️   Seeding app_settings namespaces…");

  await upsertSetting("branding", {
    siteName: "Dream Fly Global",
    tagline: "Explore the world",
    primaryColor: "#FF5A1F",
    secondaryColor: "#1A1A2E",
    logoUrl: "",
    faviconUrl: "",
    footerText: "© 2025 Dream Fly Global. All rights reserved.",
    supportEmail: "support@dreamflyglobal.com",
    supportPhone: "+91 98765 43210",
    whatsappNumber: "+91 98765 43210",
    address: "Mumbai, India",
  });

  await upsertSetting("site", {
    maintenanceMode: false,
    maintenanceMessage: "We'll be back shortly. Thank you for your patience.",
    allowGuestBooking: true,
    requirePhoneVerification: false,
    defaultCurrency: "INR",
    defaultLanguage: "en",
    timezone: "Asia/Kolkata",
    maxPassengersPerBooking: 9,
  });

  await upsertSetting("website", {
    heroTitle: "Fly to your Dream Destinations ✈️",
    heroSubtitle: "Search hundreds of airlines. Find the best fares in seconds.",
    heroImageUrl: "",
    showTestimonials: true,
    showPopularDestinations: true,
    showOfferBanner: false,
    offerBannerText: "",
    announcementBar: "",
    announcementBarEnabled: false,
  });

  await upsertSetting("notification", {
    emailEnabled: true,
    whatsappEnabled: false,
    smsEnabled: false,
    bookingConfirmationEmail: true,
    bookingConfirmationWhatsapp: false,
    adminNotifyEmail: "admin@dreamflyglobal.com",
    sendWelcomeMessage: true,
    abandonedLeadAlerts: true,
  });

  await upsertSetting("markup_simple", {
    flight: { domestic: 0, international: 0 },
    bus: 0,
    hotel: 0,
    holiday: 0,
    train: 0,
  });

  await upsertSetting("markup_convenience", {
    flight: { domestic: 0, international: 0 },
    bus: 0,
    hotel: 0,
    holiday: 0,
    train: 0,
    type: "fixed",
  });

  await upsertSetting("markup_hidden", {
    flight: { domestic: 0, international: 0 },
    bus: 0,
    hotel: 0,
    holiday: 0,
    train: 0,
  });

  await upsertSetting("markup_agent", {
    defaultCommissionPct: 5,
    flightDomestic: 5,
    flightInternational: 7,
    bus: 4,
    hotel: 6,
    holiday: 8,
  });

  await upsertSetting("paymentmode", {
    razorpayEnabled: true,
    upiEnabled: true,
    cardEnabled: true,
    netbankingEnabled: true,
    emiEnabled: false,
    walletEnabled: true,
    codEnabled: false,
    testMode: true,
  });

  await upsertSetting("autorefund", {
    enabled: false,
    refundWindowHours: 24,
    refundPercentage: 100,
    excludeConvenienceFee: true,
    autoApproveBelow: 5000,
    notifyAdminOnRefund: true,
  });

  await upsertSetting("cms", {
    aboutUs: "",
    termsAndConditions: "",
    privacyPolicy: "",
    refundPolicy: "",
    faqs: [],
    contactPageText: "",
  });

  await upsertSetting("activities", {
    enabled: true,
    categories: ["Adventure", "Culture", "Nature", "City Tours", "Water Sports", "Wellness"],
    defaultDuration: "Half Day",
    bookingLeadTime: 24,
  });

  await upsertSetting("blocked_users", {
    phones: [],
    emails: [],
    reason: "blocked_users list",
  });
}

// ─── Destinations ─────────────────────────────────────────────────────────────

async function seedDestinations() {
  console.log("\n🌍  Seeding destinations…");
  const destinations = [
    { name: "Goa", country: "India", package_count: 12, starting_price: 8999, rating: 4.5 },
    { name: "Manali", country: "India", package_count: 8, starting_price: 12999, rating: 4.6 },
    { name: "Kerala", country: "India", package_count: 15, starting_price: 10999, rating: 4.7 },
    { name: "Rajasthan", country: "India", package_count: 10, starting_price: 9999, rating: 4.5 },
    { name: "Andaman", country: "India", package_count: 6, starting_price: 18999, rating: 4.8 },
    { name: "Dubai", country: "UAE", package_count: 9, starting_price: 34999, rating: 4.6 },
    { name: "Bali", country: "Indonesia", package_count: 7, starting_price: 29999, rating: 4.7 },
    { name: "Thailand", country: "Thailand", package_count: 8, starting_price: 24999, rating: 4.6 },
    { name: "Singapore", country: "Singapore", package_count: 5, starting_price: 39999, rating: 4.5 },
    { name: "Maldives", country: "Maldives", package_count: 4, starting_price: 59999, rating: 4.9 },
  ];

  for (const d of destinations) {
    await query(
      `INSERT INTO destinations (name, country, package_count, starting_price, rating)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [d.name, d.country, d.package_count, d.starting_price, d.rating]
    );
    console.log(`  ✅  destination: ${d.name}`);
  }
}

// ─── Followup settings ────────────────────────────────────────────────────────

async function seedFollowupSettings() {
  console.log("\n🔔  Seeding followup_settings…");
  await query(
    `INSERT INTO followup_settings (enabled, msg_10min, msg_2hr, msg_24hr)
     VALUES (true,
       'Hi {name}, just checking 😊\nDid you see your {destination} itinerary? Our travel expert is ready to help you plan the perfect trip!',
       'We have limited slots for your {destination} trip 🌴\nLet us know if you want to customize your plan. Our expert can create a tailored package just for you!',
       'Special offer 🎉\nGet ₹500 OFF if you confirm your {destination} booking today!\nOffer valid for the next 24 hours only. Call us now to avail!')
     ON CONFLICT DO NOTHING`
  );
  console.log("  ✅  followup_settings seeded");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀  Dream Fly Global — PostgreSQL Seed Script");
  console.log("━".repeat(50));

  try {
    await seedBookingCounters();
    await seedAppSettings();
    await seedDestinations();
    await seedFollowupSettings();

    console.log("\n" + "━".repeat(50));
    console.log("✅  Seed complete. Database is ready for use.");
  } catch (err) {
    console.error("\n❌  Seed failed:", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
