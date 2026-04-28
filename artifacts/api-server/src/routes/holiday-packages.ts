import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { eq, sql, ilike, and, or } from "drizzle-orm";
import { db, packagesTable } from "@workspace/db";

const router: IRouter = Router();

// ── Itinerary templates ──────────────────────────────────────────────────────
const ITINERARY_TEMPLATES: Record<string, object[]> = {
  Goa: [
    { day: 1, title: "Arrival & North Goa Beach Evening", activities: ["Airport pickup", "Check-in at hotel", "Visit Calangute & Baga Beach", "Sunset at Fort Aguada", "Beach-side dinner with seafood"], meals: "Dinner", accommodation: "3★ Beach Resort" },
    { day: 2, title: "North Goa Sightseeing Tour", activities: ["Visit Basilica of Bom Jesus", "Old Goa churches tour", "Anjuna flea market", "Vagator Beach", "Nightlife at Tito's Lane"], meals: "Breakfast, Dinner", accommodation: "3★ Beach Resort" },
    { day: 3, title: "South Goa & Water Sports", activities: ["Colva Beach & Benaulim Beach", "Dolphin watching cruise", "Dudhsagar Waterfall visit", "Water sports: parasailing, jet ski", "Shopping at Panjim market"], meals: "Breakfast, Lunch", accommodation: "3★ Beach Resort" },
    { day: 4, title: "Checkout & Departure", activities: ["Morning beach walk", "Breakfast and checkout", "Last-minute souvenir shopping", "Airport/railway station drop"], meals: "Breakfast", accommodation: "—" },
  ],
  Kashmir: [
    { day: 1, title: "Arrival in Srinagar & Dal Lake", activities: ["Airport pickup in Srinagar", "Check-in to Houseboat on Dal Lake", "Shikara ride at sunset", "Dal Lake floating market visit", "Welcome Wazwan dinner"], meals: "Dinner", accommodation: "Houseboat, Dal Lake" },
    { day: 2, title: "Mughal Gardens & City Tour", activities: ["Shalimar Bagh (Mughal garden)", "Nishat Bagh garden", "Chashme Shahi garden", "Shankaracharya Temple visit", "Local handicraft shopping"], meals: "Breakfast, Dinner", accommodation: "Houseboat, Dal Lake" },
    { day: 3, title: "Gulmarg Day Trip", activities: ["Drive to Gulmarg (56km)", "Gondola cable car ride to Kongdoori", "Snow activities (season permitting)", "Meadow walk & photography", "Evening back to Srinagar"], meals: "Breakfast, Lunch", accommodation: "Houseboat, Dal Lake" },
    { day: 4, title: "Pahalgam Day Trip", activities: ["Drive to Pahalgam (95km)", "Betaab Valley visit", "Aru Valley nature walk", "Lidder River rafting", "Evening return to Srinagar"], meals: "Breakfast, Dinner", accommodation: "Houseboat, Dal Lake" },
    { day: 5, title: "Sonamarg Excursion & Departure", activities: ["Drive to Sonamarg (80km)", "Thajiwas Glacier pony ride", "Photography at Sindh River", "Return to Srinagar", "Airport drop"], meals: "Breakfast", accommodation: "—" },
  ],
  Kerala: [
    { day: 1, title: "Arrival in Kochi & Fort Kochi Tour", activities: ["Cochin airport pickup", "Chinese fishing nets visit", "Fort Kochi heritage walk", "Jew Town & Paradesi Synagogue", "Kathakali dance performance evening"], meals: "Dinner", accommodation: "Heritage Homestay, Fort Kochi" },
    { day: 2, title: "Munnar Hills – Tea & Spice Country", activities: ["Drive to Munnar (130km)", "Mattupetty Dam & Echo Point", "Tea Garden tour & factory visit", "Spice plantation walk", "Sunset at Top Station"], meals: "Breakfast, Lunch, Dinner", accommodation: "Tea Estate Resort, Munnar" },
    { day: 3, title: "Thekkady Wildlife & Spice Tour", activities: ["Drive to Thekkady (90km)", "Periyar Wildlife Sanctuary boat cruise", "Elephant interaction experience", "Spice garden guided tour", "Cultural bamboo rafting (optional)"], meals: "Breakfast, Dinner", accommodation: "Jungle Resort, Thekkady" },
    { day: 4, title: "Alleppey Houseboat & Backwaters", activities: ["Drive to Alleppey (100km)", "Board traditional Kerala houseboat", "Village walk along backwater canals", "Village fishing experience", "Sunset cruise"], meals: "Breakfast, Lunch, Dinner (on houseboat)", accommodation: "Luxury Houseboat, Alleppey" },
    { day: 5, title: "Kovalam Beach & Departure", activities: ["Morning cruise on backwaters", "Drive to Kovalam Beach (150km)", "Lighthouse Beach relaxation", "Ayurvedic massage session", "Thiruvananthapuram airport drop"], meals: "Breakfast, Lunch", accommodation: "—" },
  ],
  Rajasthan: [
    { day: 1, title: "Arrival in Jaipur – Pink City", activities: ["Jaipur airport/station pickup", "Check-in & freshen up", "City Palace visit", "Jantar Mantar observatory", "Hawa Mahal (Palace of Winds)", "Johri Bazaar evening shopping"], meals: "Dinner", accommodation: "Heritage Haveli, Jaipur" },
    { day: 2, title: "Jaipur Forts & Amber Palace", activities: ["Amber Fort elephant ride", "Sheesh Mahal (mirror palace)", "Nahargarh Fort sunset view", "Jal Mahal (water palace) photos", "Traditional Rajasthani dinner with folk music"], meals: "Breakfast, Dinner", accommodation: "Heritage Haveli, Jaipur" },
    { day: 3, title: "Jaisalmer – Golden City", activities: ["Drive/fly to Jaisalmer", "Jaisalmer Fort (living fort)", "Patwon ki Haveli", "Gadi Sagar Lake sunset", "Overnight desert camp arrangements"], meals: "Breakfast, Dinner", accommodation: "Desert Haveli, Jaisalmer" },
    { day: 4, title: "Sam Sand Dunes Desert Safari", activities: ["Morning fort walk", "Sam Sand Dunes camel safari", "Desert jeep safari", "Cultural evening – folk dance, bonfire", "Stargazing in the desert"], meals: "Breakfast, Dinner (at desert camp)", accommodation: "Luxury Desert Camp, Sam" },
    { day: 5, title: "Jodhpur – Blue City & Departure", activities: ["Drive to Jodhpur (275km)", "Mehrangarh Fort visit", "Jaswant Thada memorial", "Blue City old town walk", "Sardar Market shopping & departure"], meals: "Breakfast, Lunch", accommodation: "—" },
  ],
  Manali: [
    { day: 1, title: "Arrival in Manali & Old Town", activities: ["Bhuntar airport pickup", "Check-in at hotel", "Old Manali walk", "Hadimba Devi Temple visit", "Vashisht hot water springs"], meals: "Dinner", accommodation: "Mountain Resort, Manali" },
    { day: 2, title: "Solang Valley & Adventure Sports", activities: ["Solang Valley (13km)", "Ropeway / Gondola ride", "Zorbing, paragliding, snow scooter", "Beas River rafting", "Evening bonfire at camp"], meals: "Breakfast, Lunch, Dinner", accommodation: "Mountain Resort, Manali" },
    { day: 3, title: "Rohtang Pass Excursion", activities: ["Early morning drive to Rohtang Pass (51km)", "Snow play and photography", "Gulaba Valley meadows", "View of glaciers", "Return via Marhi dhaba lunch"], meals: "Breakfast, Lunch", accommodation: "Mountain Resort, Manali" },
    { day: 4, title: "Kullu & Manikaran", activities: ["Drive to Kullu (40km)", "Kullu shawl weaving tour", "Raghunath temple visit", "Manikaran hot springs & Gurudwara", "Parvati River valley scenic drive"], meals: "Breakfast, Dinner", accommodation: "Mountain Resort, Manali" },
    { day: 5, title: "Departure", activities: ["Morning leisure walk", "Breakfast and checkout", "Tibetan market souvenir shopping", "Bhuntar airport drop"], meals: "Breakfast", accommodation: "—" },
  ],
  Andaman: [
    { day: 1, title: "Arrival in Port Blair", activities: ["Port Blair airport pickup", "Cellular Jail visit", "Sound & Light Show at Cellular Jail", "Corbyn's Cove Beach evening", "Welcome dinner at seafood restaurant"], meals: "Dinner", accommodation: "3★ Hotel, Port Blair" },
    { day: 2, title: "Ross & North Bay Islands", activities: ["Ross Island (former British HQ)", "Snorkeling at North Bay Island", "Glass-bottom boat ride", "Rajiv Gandhi Water Sports Complex", "Aberdeen Bazaar evening shopping"], meals: "Breakfast, Lunch", accommodation: "3★ Hotel, Port Blair" },
    { day: 3, title: "Havelock Island – Radhanagar Beach", activities: ["Ferry to Havelock Island (90 mins)", "Check-in at eco resort", "Radhanagar Beach (Asia's best beach)", "Elephant Beach snorkeling trip", "Sunset viewing"], meals: "Breakfast, Dinner", accommodation: "Eco Resort, Havelock" },
    { day: 4, title: "Neil Island Exploration", activities: ["Ferry to Neil Island (45 mins)", "Natural Bridge Rock formation", "Bharatpur Beach water sports", "Sitapur Beach sunrise", "Return to Havelock"], meals: "Breakfast, Lunch", accommodation: "Eco Resort, Havelock" },
    { day: 5, title: "Departure from Port Blair", activities: ["Ferry back to Port Blair", "Samudrika Naval Marine Museum", "Local market shopping", "Airport departure"], meals: "Breakfast", accommodation: "—" },
  ],
  Maldives: [
    { day: 1, title: "Arrival & Resort Check-in", activities: ["Speedboat transfer to resort", "Overwater villa check-in", "Welcome cocktail & orientation", "Snorkeling at house reef", "Sunset deck dinner"], meals: "Dinner", accommodation: "Overwater Villa" },
    { day: 2, title: "Snorkeling & Water Sports", activities: ["Morning snorkeling at coral garden", "Glass-bottom kayaking", "Dolphin cruise", "Stand-up paddleboarding", "Beachfront barbecue"], meals: "Breakfast, Dinner", accommodation: "Overwater Villa" },
    { day: 3, title: "Diving & Spa Day", activities: ["Intro scuba diving session", "Visit marine biology centre", "Luxury spa treatment", "Private beach picnic", "Stargazing from the deck"], meals: "Breakfast, Lunch, Dinner", accommodation: "Overwater Villa" },
    { day: 4, title: "Island Hopping & Departure", activities: ["Local island village visit", "Traditional Maldivian breakfast", "Last snorkeling", "Checkout & speedboat transfer", "Airport departure"], meals: "Breakfast", accommodation: "—" },
  ],
  "Himachal Pradesh": [
    { day: 1, title: "Arrival in Shimla", activities: ["Chandigarh pickup & drive to Shimla", "Mall Road walk", "Christ Church visit", "Jakhu Temple trek", "Sunset at Shimla Ridge"], meals: "Dinner", accommodation: "Heritage Hotel, Shimla" },
    { day: 2, title: "Kufri & Chail", activities: ["Kufri snow valley visit", "Himalayan Nature Park", "Chail Palace visit", "Chail Cricket Ground (world's highest)", "Return to Shimla"], meals: "Breakfast, Dinner", accommodation: "Heritage Hotel, Shimla" },
    { day: 3, title: "Shimla to Manali Drive", activities: ["Scenic drive via Kullu valley", "Kullu Shawl factory visit", "Pandoh Dam stop", "Arrive Manali", "Evening at Old Manali"], meals: "Breakfast, Dinner", accommodation: "Mountain Resort, Manali" },
    { day: 4, title: "Solang Valley & Rohtang", activities: ["Solang Valley snow activities", "Ropeway ride", "Drive to Rohtang Pass", "Snow play & photography", "Return to Manali"], meals: "Breakfast, Lunch, Dinner", accommodation: "Mountain Resort, Manali" },
    { day: 5, title: "Hadimba & River Rafting", activities: ["Hadimba Temple visit", "Manu Temple", "Beas River rafting", "Tibetan Monastery", "Candlelight dinner"], meals: "Breakfast, Dinner", accommodation: "Mountain Resort, Manali" },
    { day: 6, title: "Leisure & Local Exploration", activities: ["Naggar Castle visit", "Jana Waterfall trek", "Rozy Falls", "Local market souvenir shopping", "Farewell dinner"], meals: "Breakfast, Dinner", accommodation: "Mountain Resort, Manali" },
    { day: 7, title: "Departure", activities: ["Breakfast & checkout", "Drive back to Chandigarh/Delhi", "En-route Kullu valley views", "Railway station / airport drop"], meals: "Breakfast", accommodation: "—" },
  ],
};

function getItineraryForDest(destination: string): object[] {
  const key = Object.keys(ITINERARY_TEMPLATES).find(
    (k) => destination.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(destination.toLowerCase())
  );
  return key ? ITINERARY_TEMPLATES[key] : [
    { day: 1, title: "Arrival & Check-in", activities: ["Airport/station pickup", "Hotel check-in", "Local area orientation", "Welcome dinner"], meals: "Dinner", accommodation: "Hotel" },
    { day: 2, title: "Main Attractions Tour", activities: ["Major sightseeing spots", "Local cuisine experience", "Cultural show"], meals: "Breakfast, Dinner", accommodation: "Hotel" },
    { day: 3, title: "Leisure & Activities", activities: ["Free time for shopping", "Adventure activities", "Spa or relaxation"], meals: "Breakfast", accommodation: "Hotel" },
    { day: 4, title: "Departure", activities: ["Breakfast and checkout", "Last-minute shopping", "Airport/station drop"], meals: "Breakfast", accommodation: "—" },
  ];
}

// ── Seed data ────────────────────────────────────────────────────────────────
const SEED_PACKAGES = [
  {
    name: "Goa Beach Bliss", destination: "Goa", type: "beach", duration: 4, nights: 3, category: "domestic",
    price: "12000", rating: "4.5", reviewCount: 1840, featured: true,
    imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80", "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&q=80"],
    highlights: ["Baga & Calangute Beach", "Fort Aguada", "Water Sports", "Old Goa Churches", "Seafood Dinners"],
    description: "Experience the sun, sand, and soul of India's party capital. Enjoy pristine beaches, vibrant nightlife, and fresh Goan seafood.",
    includes: ["Hotel (3★ Beach Resort)", "Daily breakfast", "Airport transfers", "Sightseeing by AC cab", "Tour escort"],
    exclusions: ["Flights", "Personal expenses", "Alcohol", "Adventure sports charges", "Room service"],
    createdBy: "admin",
  },
  {
    name: "Kashmir Paradise", destination: "Kashmir", type: "honeymoon", duration: 6, nights: 5, category: "domestic",
    price: "32000", rating: "4.8", reviewCount: 1120, featured: true,
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80", "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=800&q=80", "https://images.unsplash.com/photo-1455156218388-5e61b526818b?w=800&q=80"],
    highlights: ["Houseboat on Dal Lake", "Gulmarg Gondola", "Pahalgam Valley", "Shikara Ride", "Mughal Gardens"],
    description: "The paradise on Earth awaits you — snow-capped mountains, blooming gardens, and shimmering Dal Lake form the backdrop of your dream vacation.",
    includes: ["Houseboat accommodation", "All meals", "Shikara rides", "All transfers", "Sightseeing"],
    exclusions: ["Flights to/from Srinagar", "Gondola tickets", "Pony rides", "Personal expenses", "Travel insurance"],
    createdBy: "admin",
  },
  {
    name: "Kerala Backwaters & Hills", destination: "Kerala", type: "family", duration: 6, nights: 5, category: "domestic",
    price: "22000", rating: "4.6", reviewCount: 2310, featured: false,
    imageUrl: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80", "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80", "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80"],
    highlights: ["Houseboat on backwaters", "Munnar tea gardens", "Periyar Wildlife Sanctuary", "Ayurvedic spa", "Kathakali dance show"],
    description: "God's Own Country in all its glory — lush green hills, serene backwaters, spice-scented air, and unmatched Ayurvedic hospitality.",
    includes: ["Hotel + Houseboat stay", "Daily breakfast & dinner", "Houseboat meals", "AC transfers", "Wildlife safari"],
    exclusions: ["Flights", "Kathakali tickets", "Elephant rides", "Water sports", "Personal expenses"],
    createdBy: "admin",
  },
  {
    name: "Rajasthan Royal Tour", destination: "Rajasthan", type: "cultural", duration: 6, nights: 5, category: "domestic",
    price: "28000", rating: "4.7", reviewCount: 1560, featured: true,
    imageUrl: "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=800&q=80", "https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800&q=80", "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&q=80"],
    highlights: ["Amber Fort elephant ride", "Jaisalmer Desert Safari", "Sam Sand Dunes camp", "Heritage havelis", "Camel safari"],
    description: "Step into a royal world of majestic forts, golden deserts, and opulent palaces. Rajasthan's colours, culture, and cuisine will leave you spellbound.",
    includes: ["Heritage hotel stays", "Daily breakfast & dinner", "Elephant ride (Amber)", "Desert camp night", "All transfers"],
    exclusions: ["Flights", "Camel safari extra", "Museum entry fees", "Personal expenses", "Travel insurance"],
    createdBy: "admin",
  },
  {
    name: "Manali Adventure Escape", destination: "Manali", type: "adventure", duration: 5, nights: 4, category: "domestic",
    price: "18000", rating: "4.4", reviewCount: 980, featured: false,
    imageUrl: "https://images.unsplash.com/photo-1587213811864-49e7b31bb862?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1587213811864-49e7b31bb862?w=800&q=80", "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80", "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80"],
    highlights: ["Rohtang Pass (snow)", "Solang Valley skiing", "River rafting", "Paragliding", "Hadimba Temple"],
    description: "For thrill-seekers and mountain lovers — rivers to raft, snowy peaks to climb, and misty valleys to explore in the majestic Himalayas.",
    includes: ["Mountain resort stay", "Daily breakfast & dinner", "Rohtang Pass permit", "River rafting", "All transfers"],
    exclusions: ["Flights/train to Manali", "Skiing equipment", "Paragliding charges", "Personal expenses", "Travel insurance"],
    createdBy: "admin",
  },
  {
    name: "Andaman Island Getaway", destination: "Andaman", type: "beach", duration: 5, nights: 4, category: "domestic",
    price: "26000", rating: "4.6", reviewCount: 740, featured: false,
    imageUrl: "https://images.unsplash.com/photo-1562973597-2c63e0c1b1ad?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1562973597-2c63e0c1b1ad?w=800&q=80", "https://images.unsplash.com/photo-1500916434205-0c77489c6cf7?w=800&q=80", "https://images.unsplash.com/photo-1439405326854-014607f694d7?w=800&q=80"],
    highlights: ["Radhanagar Beach (Asia's best)", "Cellular Jail", "Snorkeling & scuba diving", "Havelock Island", "Glass-bottom boat ride"],
    description: "Turquoise waters, white-sand beaches, and vibrant coral reefs — the Andaman Islands are India's best-kept tropical secret.",
    includes: ["Hotel + Eco Resort stay", "Daily breakfast", "Ferry tickets", "Island transfers", "Snorkeling gear"],
    exclusions: ["Flights to Port Blair", "Scuba diving charges", "Water sports", "Personal expenses", "Liquor"],
    createdBy: "admin",
  },
  {
    name: "Maldives Luxury Escape", destination: "Maldives", type: "luxury", duration: 5, nights: 4, category: "international",
    price: "85000", rating: "4.9", reviewCount: 430, featured: true,
    imageUrl: "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=800&q=80", "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&q=80", "https://images.unsplash.com/photo-1540202403-b7abd6747a18?w=800&q=80"],
    highlights: ["Overwater villa", "Private beach", "Sunset dolphin cruise", "Snorkeling & diving", "Spa treatments"],
    description: "Ultimate luxury in the middle of the Indian Ocean — private overwater villas, crystal-clear lagoons, and world-class dining await you.",
    includes: ["Overwater villa stay", "All meals (full board)", "Speedboat transfers", "Snorkeling", "Sunset cruise"],
    exclusions: ["International flights", "Scuba diving courses", "Spa (extra)", "Excursions not listed", "Travel insurance"],
    createdBy: "admin",
  },
  {
    name: "Shimla–Manali Honeymoon", destination: "Himachal Pradesh", type: "honeymoon", duration: 7, nights: 6, category: "domestic",
    price: "24000", rating: "4.5", reviewCount: 860, featured: false,
    imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80", "https://images.unsplash.com/photo-1445257508802-b52e6e13b1ae?w=800&q=80", "https://images.unsplash.com/photo-1553428811-8a8a6e32e86a?w=800&q=80"],
    highlights: ["Mall Road Shimla", "Kufri snow valley", "Rohtang Pass", "Solang Valley", "Romantic candlelight dinner"],
    description: "The ultimate hill-station honeymoon — from colonial Shimla to adventurous Manali, paint your love story against a backdrop of snow peaks.",
    includes: ["Hotel stay (couple rooms)", "Daily breakfast & dinner", "All transfers", "Romantic dinner (1 night)", "Sightseeing"],
    exclusions: ["Flights/train", "Adventure sports", "Personal expenses", "Honeymoon suite upgrade", "Travel insurance"],
    createdBy: "admin",
  },
];

// ── Smart Pricing ─────────────────────────────────────────────────────────────

// Type-based default markup percentages
const PACKAGE_TYPE_MARKUP: Record<string, number> = {
  honeymoon: 30,
  luxury:    50,
  family:    20,
  friends:   15,
  budget:     5,
};

// Peak season months (1-indexed): Apr–Jun, Oct–Dec
const PEAK_MONTHS = new Set([4, 5, 6, 10, 11, 12]);
// Off-season months: Jul–Sep (monsoon)
const OFF_MONTHS  = new Set([7, 8, 9]);

function getEffectiveMarkupPct(pkg: typeof packagesTable.$inferSelect): number {
  // Admin-set markup takes priority over type-based default
  if (pkg.markupPct !== null && pkg.markupPct !== undefined) return Number(pkg.markupPct);
  // Use packageType (audience) first, then fall back to type field for overlap values
  return PACKAGE_TYPE_MARKUP[pkg.packageType ?? ""]
      ?? PACKAGE_TYPE_MARKUP[pkg.type ?? ""]
      ?? 0;
}

interface DateMarkup { pct: number; label: string; kind: "peak" | "offseason" | "weekend" | "normal" }

function getDateMarkupInfo(travelDate?: string): DateMarkup {
  if (!travelDate) return { pct: 0, label: "", kind: "normal" };
  const d = new Date(travelDate);
  if (isNaN(d.getTime())) return { pct: 0, label: "", kind: "normal" };
  const month   = d.getMonth() + 1;                    // 1–12
  const weekday = d.getDay();                          // 0=Sun 6=Sat
  const isWeekend = weekday === 0 || weekday === 6;
  if (PEAK_MONTHS.has(month)) {
    const pct = isWeekend ? 30 : 20;
    return { pct, label: `Peak Season (+${pct}%)`, kind: "peak" };
  }
  if (OFF_MONTHS.has(month)) {
    const pct = isWeekend ? 0 : -10;
    return pct < 0
      ? { pct, label: `Off-Season Deal (${pct}%)`, kind: "offseason" }
      : { pct: 0, label: "Weekend", kind: "weekend" };
  }
  if (isWeekend) return { pct: 10, label: "Weekend (+10%)", kind: "weekend" };
  return { pct: 0, label: "", kind: "normal" };
}

interface SmartPrice {
  basePrice:      number;   // raw DB base price
  typeMarkupPct:  number;   // % from package audience type
  typeMarkupAmt:  number;   // ₹ amount
  dateMarkupPct:  number;   // % from travel date
  dateMarkupAmt:  number;   // ₹ amount
  originalPrice:  number;   // base + type markup (no date) — shown as "was" price
  finalPrice:     number;   // original + date adjustment — what customer pays
  dateLabel:      string;   // human label for date markup ("Peak Season (+20%)" etc.)
  dateKind:       string;
}

function computeSmartPrice(
  pkg: typeof packagesTable.$inferSelect,
  travelDate?: string,
): SmartPrice {
  const base = Number(pkg.price);

  // If admin has set a full price override → bypass all markup
  if (pkg.adminPrice !== null && pkg.adminPrice !== undefined) {
    const adminFinal = Number(pkg.adminPrice);
    return {
      basePrice: base, typeMarkupPct: 0, typeMarkupAmt: 0,
      dateMarkupPct: 0, dateMarkupAmt: 0,
      originalPrice: adminFinal, finalPrice: adminFinal,
      dateLabel: "", dateKind: "normal",
    };
  }

  const typeMarkupPct = getEffectiveMarkupPct(pkg);
  const typeMarkupAmt = Math.round(base * typeMarkupPct / 100);
  const originalPrice = base + typeMarkupAmt;            // "was" price (no date)

  const { pct: dateMarkupPct, label: dateLabel, kind: dateKind } = getDateMarkupInfo(travelDate);
  const dateMarkupAmt = Math.round(base * dateMarkupPct / 100); // date adj on base price
  const finalPrice    = originalPrice + dateMarkupAmt;

  return { basePrice: base, typeMarkupPct, typeMarkupAmt, dateMarkupPct, dateMarkupAmt, originalPrice, finalPrice, dateLabel, dateKind };
}

// ── Auto-seed if table is empty ───────────────────────────────────────────────
export async function seedPackagesIfEmpty() {
  try {
    // Ensure package_type and markup_pct columns exist (non-destructive migrations)
    await db.execute(sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS package_type TEXT`);
    await db.execute(sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS markup_pct NUMERIC(5,2)`);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(packagesTable);
    if (count === 0) {
      logger.info("[holiday-packages] Seeding packages into DB…");
      for (const pkg of SEED_PACKAGES) {
        await db.insert(packagesTable).values({
          ...pkg,
          itinerary: getItineraryForDest(pkg.destination) as unknown as null,
        });
      }
      logger.info(`[holiday-packages] Seeded ${SEED_PACKAGES.length} packages.`);
    }
  } catch (err) {
    logger.error("[holiday-packages] Seed error:", err);
  }
}

// ── Package-type activity overlays ────────────────────────────────────────────
const PKG_TYPE_OVERLAYS: Record<string, {
  extraActivities: string[];
  accommodationSuffix: string;
  mealSuffix: string;
}> = {
  honeymoon: {
    extraActivities: [
      "Couples spa & aromatherapy massage",
      "Candlelight dinner by the pool",
      "Private sunset photography session",
      "Rose petal room decoration",
      "Champagne welcome & romantic turndown",
    ],
    accommodationSuffix: " (Deluxe Couple Suite)",
    mealSuffix: " (Candlelight Dinner included)",
  },
  family: {
    extraActivities: [
      "Kid-friendly beach / snow games",
      "Family group photo session",
      "Children's activity corner",
      "Family picnic with packed lunch",
    ],
    accommodationSuffix: " (Family Suite)",
    mealSuffix: "",
  },
  friends: {
    extraActivities: [
      "Group adventure sports session",
      "Street food & local nightlife tour",
      "Group bonfire & music night",
      "Pub crawl / bar hopping",
    ],
    accommodationSuffix: " (Shared Rooms / Dorm)",
    mealSuffix: "",
  },
  budget: {
    extraActivities: [
      "Local market bargain shopping",
      "Budget street food lunch",
      "Free public viewpoints & attractions",
    ],
    accommodationSuffix: " (Budget Hotel)",
    mealSuffix: "",
  },
  luxury: {
    extraActivities: [
      "Private luxury spa treatment",
      "Fine dining at rooftop restaurant",
      "Helicopter / seaplane sightseeing",
      "Personal butler & concierge service",
    ],
    accommodationSuffix: " (5★ Luxury Suite)",
    mealSuffix: " (Fine Dining experience)",
  },
};

function applyPackageType(
  days: { day: number; title: string; activities: string[]; meals: string; accommodation: string }[],
  packageType: string,
): typeof days {
  const overlay = PKG_TYPE_OVERLAYS[packageType];
  if (!overlay) return days;
  return days.map((d, i) => {
    const isLast = i === days.length - 1;
    const extraAct = overlay.extraActivities[i % overlay.extraActivities.length];
    return {
      ...d,
      activities: isLast ? d.activities : [...d.activities, extraAct],
      accommodation: isLast ? d.accommodation : (d.accommodation + (d.accommodation === "—" ? "" : overlay.accommodationSuffix)),
      meals: isLast ? d.meals : (d.meals + (i === 1 ? overlay.mealSuffix : "")),
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapPackage(p: typeof packagesTable.$inferSelect, includeAdminPrices = false, travelDate?: string) {
  const pricing = computeSmartPrice(p, travelDate);
  const base: Record<string, unknown> = {
    id: p.id,
    name: p.name,
    destination: p.destination,
    type: p.type,
    duration: p.duration,
    nights: p.nights,
    durationLabel: `${p.duration}D/${p.nights}N`,
    pricePerPerson:  pricing.finalPrice,         // what customers see
    originalPrice:   pricing.originalPrice,      // "was" price (type markup, no date)
    pricingBreakdown: {
      basePrice:     pricing.basePrice,
      typeMarkupPct: pricing.typeMarkupPct,
      typeMarkupAmt: pricing.typeMarkupAmt,
      dateMarkupPct: pricing.dateMarkupPct,
      dateMarkupAmt: pricing.dateMarkupAmt,
      dateLabel:     pricing.dateLabel,
      dateKind:      pricing.dateKind,
    },
    rating: Number(p.rating),
    ratingCount: p.reviewCount,
    images: p.images && p.images.length > 0 ? p.images : (p.imageUrl ? [p.imageUrl] : []),
    highlights: p.highlights,
    description: p.description ?? "",
    inclusions: p.includes,
    exclusions: p.exclusions,
    itinerary: normaliseItinerary(p.itinerary),
    packageType: p.packageType ?? null,
    category: p.category ?? null,
    markupPct: p.markupPct !== null && p.markupPct !== undefined ? Number(p.markupPct) : null,
    featured: p.featured,
    isEnabled: p.isEnabled,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
  };

  // Admin-only fields
  if (includeAdminPrices) {
    base.aiPrice    = p.aiPrice    !== null ? Number(p.aiPrice)    : null;
    base.adminPrice = p.adminPrice !== null ? Number(p.adminPrice) : null;
    base.basePrice  = Number(p.price);
  }

  return base;
}

// ── GET /holiday-packages/generate-itinerary ─────────────────────────────────
// Used by admin "Generate with AI" button.
// Returns an itinerary template for the given destination, trimmed/padded to duration.
// Optional ?packageType=honeymoon|family|friends|budget|luxury applies type-specific overlay.
router.get("/holiday-packages/generate-itinerary", async (req, res): Promise<void> => {
  try {
    const { destination = "", duration: durationStr = "4", packageType = "" } = req.query as Record<string, string>;
    const duration = Math.max(1, Math.min(20, Number(durationStr) || 4));

    let rawDays = getItineraryForDest(destination) as {
      day: number; title: string; activities: string[];
      meals: string; accommodation: string;
    }[];

    if (rawDays.length < duration) {
      // Pad extra days
      while (rawDays.length < duration) {
        const n = rawDays.length + 1;
        rawDays.push({
          day: n,
          title: n === duration ? "Departure" : `Day ${n} — Leisure & Exploration`,
          activities: n === duration
            ? ["Breakfast and checkout", "Last-minute souvenir shopping", "Airport/station drop"]
            : ["Morning at leisure", "Visit local markets", "Cultural activity", "Evening free"],
          meals: n === duration ? "Breakfast" : "Breakfast, Dinner",
          accommodation: n === duration ? "—" : "Hotel",
        });
      }
    }

    // Re-number and trim to requested duration
    rawDays = rawDays.slice(0, duration).map((d, i) => ({ ...d, day: i + 1 }));

    // Apply package-type overlay (honeymoon / family / friends / budget / luxury)
    if (packageType) {
      rawDays = applyPackageType(rawDays, packageType) as typeof rawDays;
    }

    // Convert to standardised output format: {day, title, description, meals, hotel}
    const days = rawDays.map((d) => ({
      day: d.day,
      title: d.title,
      description: Array.isArray(d.activities) ? d.activities.join(", ") : (d.activities ?? ""),
      meals: d.meals,
      hotel: d.accommodation ?? "",
    }));

    res.json({ itinerary: days, packageType: packageType || null });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to generate itinerary" });
  }
});

// ── GET /holiday-packages ─────────────────────────────────────────────────────
// ?includeDisabled=true  → admin view (shows all packages)
// ?travelDate=YYYY-MM-DD → apply date-based pricing
// default               → customer view (enabled only)
router.get("/holiday-packages", async (req, res): Promise<void> => {
  try {
    const { destination, type, includeDisabled, travelDate } = req.query as Record<string, string>;
    const isAdminView = includeDisabled === "true";

    let query = db.select().from(packagesTable).$dynamic();

    const conditions: ReturnType<typeof eq>[] = [];

    // For non-admin views, only show enabled packages
    if (!isAdminView) {
      conditions.push(eq(packagesTable.isEnabled, true));
    }

    if (destination) {
      conditions.push(ilike(packagesTable.destination, `%${destination}%`) as ReturnType<typeof eq>);
    }
    if (type) {
      conditions.push(eq(packagesTable.type, type));
    }
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query.orderBy(packagesTable.id);
    res.json(rows.map((p) => mapPackage(p, isAdminView, travelDate)));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to fetch packages" });
  }
});

// ── GET /holiday-packages/check-destination ────────────────────────────────
// Check if an AI package already exists for a destination
router.get("/holiday-packages/check-destination", async (req, res): Promise<void> => {
  try {
    const { destination } = req.query as Record<string, string>;
    if (!destination) { res.status(400).json({ error: "destination required" }); return; }

    const [existing] = await db
      .select()
      .from(packagesTable)
      .where(
        and(
          eq(packagesTable.createdBy, "ai"),
          ilike(packagesTable.destination, destination.trim()) as ReturnType<typeof eq>
        )
      )
      .limit(1);

    if (existing) {
      res.json({ exists: true, package: mapPackage(existing, true) });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to check destination" });
  }
});

// ── GET /holiday-packages/:id ─────────────────────────────────────────────────
// ?travelDate=YYYY-MM-DD → apply date-based pricing
router.get("/holiday-packages/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, id));
    if (!pkg) { res.status(404).json({ error: "Package not found" }); return; }
    const isAdminView = req.query.admin === "true";
    const travelDate  = req.query.travelDate as string | undefined;
    res.json(mapPackage(pkg, isAdminView, travelDate));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to fetch package" });
  }
});

// ── Helper: parse itinerary from string or array ──────────────────────────────
function parseItinerary(raw: unknown): object[] | null {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) return raw as object[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as object[]; } catch { return null; }
  }
  return null;
}

// ── Helper: normalise itinerary to {day, title, description, meals, hotel} ────
// Handles legacy rows that have activities:string[] + accommodation instead of description + hotel
function normaliseItinerary(raw: unknown): object[] | null {
  const parsed = parseItinerary(raw);
  if (!parsed) return null;
  return parsed.map((d: any) => ({
    day:         d.day,
    title:       d.title ?? "",
    description: d.description
      ?? (Array.isArray(d.activities) ? d.activities.join(", ") : (d.activities ?? "")),
    meals:       d.meals ?? "",
    hotel:       d.hotel ?? d.accommodation ?? "",
  }));
}

// ── POST /holiday-packages ────────────────────────────────────────────────────
router.post("/holiday-packages", async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      name: string; destination: string; type?: string;
      duration?: number; nights?: number;
      pricePerPerson?: number;   // admin-created price
      aiPrice?: number;          // AI-generated price
      adminPrice?: number;       // admin override price
      markupPct?: number | null; // custom markup %; null = use type-based default
      images?: string[]; highlights?: string[]; description?: string;
      inclusions?: string[]; exclusions?: string[];
      itinerary?: object[] | string; packageType?: string; category?: string;
      featured?: boolean; createdBy?: string; isEnabled?: boolean;
    };

    if (!body.name || !body.destination) {
      res.status(400).json({ error: "name and destination are required" });
      return;
    }

    const isAI = body.createdBy === "ai";

    // For AI packages: require aiPrice; for admin: require pricePerPerson
    if (isAI && body.aiPrice === undefined) {
      res.status(400).json({ error: "aiPrice is required for AI-generated packages" });
      return;
    }
    if (!isAI && body.pricePerPerson === undefined && body.adminPrice === undefined) {
      res.status(400).json({ error: "pricePerPerson is required" });
      return;
    }

    const duration = body.duration ?? 3;
    const nights   = body.nights   ?? (duration - 1);

    // base price: for AI use aiPrice, for admin use pricePerPerson
    const basePrice = isAI
      ? String(body.aiPrice!)
      : String(body.pricePerPerson ?? body.adminPrice);

    // Parse itinerary — accept JSON string or array
    const itinerary = parseItinerary(body.itinerary) ?? getItineraryForDest(body.destination);

    const [inserted] = await db.insert(packagesTable).values({
      name:        body.name,
      destination: body.destination,
      type:        body.type      ?? "beach",
      duration,
      nights,
      price:       basePrice,
      aiPrice:     body.aiPrice    !== undefined ? String(body.aiPrice)    : null,
      adminPrice:  body.adminPrice !== undefined ? String(body.adminPrice) : null,
      images:      body.images    ?? [],
      imageUrl:    (body.images ?? [])[0] ?? null,
      highlights:  body.highlights ?? [],
      description: body.description ?? null,
      includes:    body.inclusions  ?? [],
      exclusions:  body.exclusions  ?? [],
      itinerary:   itinerary as unknown as null,
      packageType: body.packageType ?? null,
      category:    body.category    ?? null,
      markupPct:   body.markupPct !== undefined && body.markupPct !== null ? String(body.markupPct) : null,
      featured:    body.featured  ?? false,
      isEnabled:   body.isEnabled ?? true,
      createdBy:   body.createdBy ?? "admin",
    }).returning();

    res.status(201).json(mapPackage(inserted, true));
  } catch (err) {
    logger.error("SAVE ERROR [POST /holiday-packages]:", err);
    res.status(500).json({ error: "Failed to create package – check itinerary format" });
  }
});

// ── PATCH /holiday-packages/:id ───────────────────────────────────────────────
// Quick update: price controls, enable/disable — used by admin panel
router.patch("/holiday-packages/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const body = req.body as Partial<{
      adminPrice: number | null;
      markupPct:  number | null;
      isEnabled: boolean;
      featured: boolean;
    }>;

    const updateData: Record<string, unknown> = {};
    if ("adminPrice" in body) {
      updateData.adminPrice = body.adminPrice !== null && body.adminPrice !== undefined
        ? String(body.adminPrice) : null;
    }
    if ("markupPct" in body) {
      updateData.markupPct = body.markupPct !== null && body.markupPct !== undefined
        ? String(body.markupPct) : null;
    }
    if ("isEnabled" in body) updateData.isEnabled = body.isEnabled;
    if ("featured"  in body) updateData.featured  = body.featured;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No updatable fields provided" });
      return;
    }

    const [updated] = await db
      .update(packagesTable)
      .set(updateData as Parameters<typeof db.update>[0])
      .where(eq(packagesTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Package not found" }); return; }
    res.json(mapPackage(updated, true));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to update package" });
  }
});

// ── PUT /holiday-packages/:id ─────────────────────────────────────────────────
router.put("/holiday-packages/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const body = req.body as Partial<{
      name: string; destination: string; type: string;
      duration: number; nights: number;
      pricePerPerson: number; adminPrice: number | null;
      markupPct: number | null;
      images: string[]; highlights: string[]; description: string;
      inclusions: string[]; exclusions: string[];
      itinerary: object[] | string; packageType: string | null; category: string | null;
      featured: boolean; isEnabled: boolean;
    }>;

    const updateData: Record<string, unknown> = {};
    if (body.name        !== undefined) updateData.name        = body.name;
    if (body.destination !== undefined) updateData.destination = body.destination;
    if (body.type        !== undefined) updateData.type        = body.type;
    if (body.duration    !== undefined) updateData.duration    = body.duration;
    if (body.nights      !== undefined) updateData.nights      = body.nights;
    if (body.pricePerPerson !== undefined) updateData.price    = String(body.pricePerPerson);
    if ("adminPrice" in body) {
      updateData.adminPrice = body.adminPrice !== null && body.adminPrice !== undefined
        ? String(body.adminPrice)
        : null;
    }
    if (body.images      !== undefined) { updateData.images    = body.images; updateData.imageUrl = body.images[0] ?? null; }
    if (body.highlights  !== undefined) updateData.highlights  = body.highlights;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.inclusions  !== undefined) updateData.includes    = body.inclusions;
    if (body.exclusions  !== undefined) updateData.exclusions  = body.exclusions;
    if (body.itinerary   !== undefined) {
      // Accept itinerary as JSON string or array
      const parsed = parseItinerary(body.itinerary);
      if (parsed === null || !Array.isArray(parsed)) {
        res.status(400).json({ error: "Invalid itinerary format – must be a valid JSON array" });
        return;
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "Itinerary cannot be empty" });
        return;
      }
      updateData.itinerary = parsed;
    }
    if ("packageType" in body) updateData.packageType = body.packageType ?? null;
    if ("category"    in body) updateData.category    = body.category    ?? null;
    if ("markupPct"   in body) {
      updateData.markupPct = body.markupPct !== null && body.markupPct !== undefined
        ? String(body.markupPct) : null;
    }
    if (body.featured    !== undefined) updateData.featured    = body.featured;
    if (body.isEnabled   !== undefined) updateData.isEnabled   = body.isEnabled;

    const [updated] = await db.update(packagesTable).set(updateData as Parameters<typeof db.update>[0]).where(eq(packagesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Package not found" }); return; }
    res.json(mapPackage(updated, true));
  } catch (err) {
    logger.error("SAVE ERROR [PUT /holiday-packages/:id]:", err);
    res.status(500).json({ error: "Failed to update package – check itinerary format" });
  }
});

// ── DELETE /holiday-packages/:id ──────────────────────────────────────────────
router.delete("/holiday-packages/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(packagesTable).where(eq(packagesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to delete package" });
  }
});

export default router;
