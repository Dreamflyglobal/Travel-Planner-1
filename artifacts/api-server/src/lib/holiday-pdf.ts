import PDFDocument from "pdfkit";

export interface HolidayItineraryData {
  customerName:  string;
  phone:         string;
  destination:   string;
  duration:      string;
  people:        number;
  travelDate?:   string;
  packageName?:  string;
  pricePerPerson?: number;
  totalPrice?:   number;
  inclusions?:   string[];
}

// ── Destination itineraries (mirrored from frontend) ─────────────────────────
const ITINERARIES: Record<string, Array<{ day: number; title: string; activities: string[]; meals: string }>> = {
  Goa: [
    { day: 1, title: "Arrival & North Goa Beach Evening", activities: ["Airport pickup", "Check-in at resort", "Calangute & Baga Beach", "Sunset at Fort Aguada", "Beachside seafood dinner"], meals: "Dinner" },
    { day: 2, title: "North Goa Sightseeing", activities: ["Basilica of Bom Jesus", "Old Goa churches tour", "Anjuna flea market", "Vagator Beach", "Nightlife at Tito's Lane"], meals: "Breakfast, Dinner" },
    { day: 3, title: "South Goa & Water Sports", activities: ["Colva & Benaulim Beach", "Dolphin watching cruise", "Dudhsagar Waterfall", "Parasailing & jet ski", "Panjim market shopping"], meals: "Breakfast, Lunch" },
    { day: 4, title: "Checkout & Departure", activities: ["Morning beach walk", "Breakfast and checkout", "Souvenir shopping", "Airport drop"], meals: "Breakfast" },
  ],
  Kashmir: [
    { day: 1, title: "Arrival & Dal Lake", activities: ["Airport pickup in Srinagar", "Houseboat check-in on Dal Lake", "Shikara ride at sunset", "Dal Lake floating market"], meals: "Dinner" },
    { day: 2, title: "Mughal Gardens Tour", activities: ["Shalimar Bagh", "Nishat Bagh", "Chashme Shahi", "Shankaracharya Temple", "Local handicraft shopping"], meals: "Breakfast, Dinner" },
    { day: 3, title: "Gulmarg Day Trip", activities: ["Drive to Gulmarg", "Gondola cable car ride", "Snow activities", "Meadow walk", "Return to Srinagar"], meals: "Breakfast, Lunch" },
    { day: 4, title: "Pahalgam Excursion", activities: ["Drive to Pahalgam", "Betaab Valley", "Aru Valley nature walk", "Lidder River rafting"], meals: "Breakfast, Dinner" },
    { day: 5, title: "Sonamarg & Departure", activities: ["Sonamarg Glacier pony ride", "Sindh River photography", "Return to Srinagar", "Airport drop"], meals: "Breakfast" },
  ],
  Kerala: [
    { day: 1, title: "Arrival in Kochi", activities: ["Cochin airport pickup", "Chinese fishing nets", "Fort Kochi heritage walk", "Kathakali dance show"], meals: "Dinner" },
    { day: 2, title: "Munnar Tea Country", activities: ["Drive to Munnar", "Mattupetty Dam", "Tea Garden factory tour", "Spice plantation walk"], meals: "Breakfast, Lunch, Dinner" },
    { day: 3, title: "Thekkady Wildlife", activities: ["Periyar boat cruise", "Elephant interaction", "Spice garden tour", "Bamboo rafting"], meals: "Breakfast, Dinner" },
    { day: 4, title: "Alleppey Houseboat", activities: ["Board Kerala houseboat", "Village walk along canals", "Village fishing", "Sunset cruise"], meals: "All meals on houseboat" },
    { day: 5, title: "Kovalam & Departure", activities: ["Morning backwater cruise", "Kovalam Beach", "Ayurvedic spa session", "Airport drop"], meals: "Breakfast, Lunch" },
  ],
  Rajasthan: [
    { day: 1, title: "Jaipur – Pink City", activities: ["Airport pickup", "City Palace", "Jantar Mantar", "Hawa Mahal", "Johri Bazaar shopping"], meals: "Dinner" },
    { day: 2, title: "Amber Fort & Forts", activities: ["Amber Fort elephant ride", "Sheesh Mahal mirror palace", "Nahargarh Fort sunset", "Jal Mahal photos"], meals: "Breakfast, Dinner" },
    { day: 3, title: "Jaisalmer – Golden City", activities: ["Drive to Jaisalmer", "Jaisalmer Fort", "Patwon ki Haveli", "Gadi Sagar Lake"], meals: "Breakfast, Dinner" },
    { day: 4, title: "Sam Sand Dunes Desert Safari", activities: ["Camel safari at Sam Dunes", "Jeep safari", "Folk dance & bonfire", "Stargazing in the desert"], meals: "Breakfast, Dinner at camp" },
    { day: 5, title: "Jodhpur & Departure", activities: ["Drive to Jodhpur", "Mehrangarh Fort", "Blue City walk", "Sardar Market & departure"], meals: "Breakfast, Lunch" },
  ],
  Manali: [
    { day: 1, title: "Arrival in Manali", activities: ["Airport pickup", "Old Manali walk", "Hadimba Devi Temple", "Vashisht hot springs"], meals: "Dinner" },
    { day: 2, title: "Solang Valley Adventure", activities: ["Solang Valley", "Gondola ride", "Zorbing & paragliding", "River rafting", "Bonfire camp"], meals: "Breakfast, Lunch, Dinner" },
    { day: 3, title: "Rohtang Pass", activities: ["Early drive to Rohtang Pass", "Snow play & photography", "Gulaba Valley meadows", "Glacier views"], meals: "Breakfast, Lunch" },
    { day: 4, title: "Kullu & Manikaran", activities: ["Kullu shawl weaving tour", "Manikaran hot springs", "Raghunath Temple", "Parvati River drive"], meals: "Breakfast, Dinner" },
    { day: 5, title: "Departure", activities: ["Morning Himalayan walk", "Breakfast & checkout", "Tibetan market shopping", "Airport drop"], meals: "Breakfast" },
  ],
  Andaman: [
    { day: 1, title: "Port Blair Arrival", activities: ["Airport pickup", "Cellular Jail visit", "Sound & Light Show", "Seafood dinner"], meals: "Dinner" },
    { day: 2, title: "Ross & North Bay Islands", activities: ["Ross Island British HQ ruins", "North Bay snorkeling", "Glass-bottom boat ride", "Market shopping"], meals: "Breakfast, Lunch" },
    { day: 3, title: "Havelock Island", activities: ["Ferry to Havelock", "Radhanagar Beach", "Elephant Beach snorkeling", "Sunset viewing"], meals: "Breakfast, Dinner" },
    { day: 4, title: "Neil Island", activities: ["Ferry to Neil Island", "Natural Bridge Rock", "Bharatpur Beach sports", "Sitapur Beach sunrise"], meals: "Breakfast, Lunch" },
    { day: 5, title: "Departure", activities: ["Ferry back to Port Blair", "Naval Marine Museum", "Souvenir shopping", "Airport drop"], meals: "Breakfast" },
  ],
};

function getItinerary(destination: string) {
  const key = Object.keys(ITINERARIES).find(
    (k) => destination.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(destination.toLowerCase())
  );
  return ITINERARIES[key ?? "Goa"] ?? ITINERARIES["Goa"];
}

// ── Color palette ─────────────────────────────────────────────────────────────
const PURPLE  = "#6D28D9";
const LIGHT_P = "#EDE9FE";
const WHITE   = "#FFFFFF";
const DARK    = "#1E293B";
const GRAY    = "#64748B";
const GREEN   = "#059669";
const ACCENT  = "#F59E0B";
const BORDER  = "#E2E8F0";

function hr(doc: PDFKit.PDFDocument, y: number, color = BORDER) {
  doc.moveTo(50, y).lineTo(545, y).strokeColor(color).lineWidth(0.5).stroke();
}

function badge(doc: PDFKit.PDFDocument, x: number, y: number, text: string, bg: string, fg: string, w = 80) {
  doc.rect(x, y, w, 16).fill(bg);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(fg)
    .text(text, x, y + 4, { width: w, align: "center" });
}

export function generateHolidayItineraryPDF(data: HolidayItineraryData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data",  (c) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W      = 595;
    const margin = 50;
    const itin   = getItinerary(data.destination);

    // ── Cover header ─────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 110).fill(PURPLE);

    // Brand
    doc.font("Helvetica-Bold").fontSize(24).fillColor(WHITE)
      .text("Dream Fly Global", margin, 22);
    doc.font("Helvetica").fontSize(9).fillColor("#C4B5FD")
      .text("Explore the world", margin, 50);

    // Doc title
    doc.font("Helvetica-Bold").fontSize(11).fillColor(WHITE)
      .text("HOLIDAY ITINERARY", W - 190, 22, { width: 140, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#C4B5FD")
      .text(`Prepared for: ${data.customerName}`, W - 190, 42, { width: 140, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#C4B5FD")
      .text(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), W - 190, 58, { width: 140, align: "right" });

    // Destination hero strip
    doc.rect(0, 110, W, 72).fill(LIGHT_P);
    doc.font("Helvetica-Bold").fontSize(32).fillColor(PURPLE)
      .text(data.destination, margin, 120);
    doc.font("Helvetica").fontSize(11).fillColor(GRAY)
      .text(data.packageName || `${data.destination} Holiday Package`, margin, 158);

    // Meta badges
    const badgeY = 128;
    const badgeX = W - 260;
    badge(doc, badgeX,       badgeY,      data.duration,                    PURPLE,  WHITE, 80);
    badge(doc, badgeX + 88,  badgeY,      `${data.people} Traveller${data.people > 1 ? "s" : ""}`, GREEN, WHITE, 88);
    if (data.travelDate) {
      badge(doc, badgeX,     badgeY + 22, data.travelDate, ACCENT, WHITE, 180);
    }

    // ── Customer info ─────────────────────────────────────────────────────────
    let y = 200;
    doc.rect(0, y, W, 2).fill(ACCENT);
    y += 10;

    doc.font("Helvetica-Bold").fontSize(13).fillColor(DARK).text("Traveller Details", margin, y); y += 20;
    hr(doc, y); y += 10;

    const col1 = margin;
    const col2 = 230;
    const col3 = 390;

    // row 1
    doc.font("Helvetica").fontSize(8).fillColor(GRAY).text("NAME", col1, y);
    doc.font("Helvetica").fontSize(8).fillColor(GRAY).text("CONTACT", col2, y);
    doc.font("Helvetica").fontSize(8).fillColor(GRAY).text("NO. OF TRAVELLERS", col3, y);
    y += 12;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(data.customerName, col1, y);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(data.phone || "—", col2, y);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(String(data.people), col3, y);
    y += 24;
    hr(doc, y); y += 12;

    // ── Day-wise Itinerary ────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(14).fillColor(PURPLE).text("Day-Wise Itinerary", margin, y); y += 22;

    for (const day of itin) {
      // Check if we need a new page
      const estimatedHeight = 28 + day.activities.length * 14 + 20;
      if (y + estimatedHeight > 780) {
        doc.addPage();
        y = 50;
        // Repeat header on new page
        doc.rect(0, 0, W, 30).fill(PURPLE);
        doc.font("Helvetica-Bold").fontSize(10).fillColor(WHITE)
          .text("Dream Fly Global  •  Holiday Itinerary", margin, 10);
        doc.font("Helvetica").fontSize(9).fillColor("#C4B5FD")
          .text(data.destination, W - margin - 80, 10, { width: 80, align: "right" });
        y = 45;
      }

      // Day header row
      doc.rect(margin, y, W - margin * 2, 24).fill(LIGHT_P);
      doc.rect(margin, y, 36, 24).fill(PURPLE);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE)
        .text(`D${day.day}`, margin, y + 8, { width: 36, align: "center" });
      doc.font("Helvetica-Bold").fontSize(11).fillColor(PURPLE)
        .text(day.title, margin + 44, y + 7);
      y += 28;

      // Activities
      for (const act of day.activities) {
        if (y > 780) { doc.addPage(); y = 50; }
        doc.rect(margin + 8, y + 4, 4, 4).fill(PURPLE);
        doc.font("Helvetica").fontSize(9).fillColor(DARK)
          .text(act, margin + 20, y, { width: W - margin * 2 - 30 });
        y += 14;
      }

      // Meals row
      doc.font("Helvetica").fontSize(8).fillColor(GRAY)
        .text(`Meals: ${day.meals}`, margin + 8, y, { width: 300 });
      y += 18;
    }

    // ── Inclusions ────────────────────────────────────────────────────────────
    if (y + 120 > 800) { doc.addPage(); y = 50; }
    y += 4;
    hr(doc, y, PURPLE); y += 12;

    doc.font("Helvetica-Bold").fontSize(13).fillColor(GREEN).text("What's Included", margin, y); y += 18;

    const inclusions = data.inclusions?.length
      ? data.inclusions
      : ["Hotel accommodation", "Daily breakfast", "Airport transfers", "AC vehicle for sightseeing", "Tour escort assistance"];

    for (const inc of inclusions) {
      if (y > 780) { doc.addPage(); y = 50; }
      doc.font("Helvetica").fontSize(8).fillColor(GREEN).text("✓", margin, y);
      doc.font("Helvetica").fontSize(9).fillColor(DARK).text(inc, margin + 14, y);
      y += 15;
    }
    y += 8;

    // ── Price Summary ─────────────────────────────────────────────────────────
    if (data.pricePerPerson && y + 90 < 800) {
      hr(doc, y, BORDER); y += 12;
      doc.font("Helvetica-Bold").fontSize(13).fillColor(DARK).text("Price Summary", margin, y); y += 18;

      const priceTotal = data.totalPrice || (data.pricePerPerson * data.people);

      doc.font("Helvetica").fontSize(9).fillColor(GRAY)
        .text(`₹${data.pricePerPerson.toLocaleString("en-IN")} × ${data.people} traveller${data.people > 1 ? "s" : ""}`, margin, y);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
        .text(`₹${priceTotal.toLocaleString("en-IN")}`, W - margin - 100, y, { width: 100, align: "right" });
      y += 20;

      // Total box
      doc.rect(margin, y, W - margin * 2, 32).fill(PURPLE);
      doc.font("Helvetica-Bold").fontSize(12).fillColor(WHITE)
        .text("TOTAL PACKAGE PRICE", margin + 12, y + 10);
      doc.font("Helvetica-Bold").fontSize(16).fillColor(WHITE)
        .text(`₹${priceTotal.toLocaleString("en-IN")}`, W - margin - 130, y + 8, { width: 120, align: "right" });
      y += 44;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = 810;
    doc.rect(0, footerY, W, 32).fill(PURPLE);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE)
      .text("Dream Fly Global ✈️  |  Explore the world with confidence", margin, footerY + 11, { align: "center", width: W - margin * 2 });

    doc.end();
  });
}
