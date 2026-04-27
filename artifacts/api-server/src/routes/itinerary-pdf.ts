import { Router } from "express";
import { generateHolidayItineraryPDF } from "../lib/holiday-pdf.js";
import { APP_NAME } from "../lib/app-config.js";

const router = Router();

/**
 * GET /api/itinerary-pdf
 * Generates and streams a holiday itinerary PDF.
 *
 * Query params:
 *   name     - Customer name
 *   phone    - Customer phone
 *   dest     - Destination (Goa, Kashmir, etc.)
 *   duration - Trip duration (e.g. "4D/3N")
 *   people   - Number of travellers
 *   date     - Travel date (optional)
 *   pkg      - Package name (optional)
 *   price    - Price per person in INR (optional)
 *   total    - Total price in INR (optional)
 */
router.get("/", async (req, res) => {
  try {
    const {
      name     = "Guest",
      phone    = "",
      dest     = "Goa",
      duration = "4D/3N",
      people   = "2",
      date,
      pkg,
      price,
      total,
    } = req.query as Record<string, string>;

    const pdfBuffer = await generateHolidayItineraryPDF({
      customerName:   name,
      phone,
      destination:    dest,
      duration,
      people:         parseInt(people) || 2,
      travelDate:     date,
      packageName:    pkg,
      pricePerPerson: price  ? parseInt(price)  : undefined,
      totalPrice:     total  ? parseInt(total)  : undefined,
    });

    const filename = `${APP_NAME}_${dest.replace(/\s+/g, "_")}_Itinerary.pdf`;

    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length",      pdfBuffer.length);
    res.setHeader("Cache-Control",       "no-store");
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("[itinerary-pdf] Error:", err);
    res.status(500).json({ error: "Failed to generate PDF", detail: err.message });
  }
});

export default router;
