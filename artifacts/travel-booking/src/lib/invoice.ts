import jsPDF from "jspdf";
import { APP_NAME, APP_SUPPORT_PHONE, APP_SUPPORT_EMAIL, APP_INITIALS } from "@/lib/app-config";
import { sanitizeLocation, sanitizeBookingTitle } from "@/lib/location-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvoiceData {
  bookingId: string;
  bookingType: "flight" | "bus" | "hotel" | "package";
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  passengers: number;
  travelDate: string;
  checkoutDate?: string;
  totalAmount: number;
  paymentId: string;
  paymentStatus: string;
  timestamp: string;
  title: string;
  /** Base64 data URL of the company logo (e.g. from branding settings). */
  logoDataUrl?: string;
  selectedSeats?: string[];
  roomType?: string;
  // Hotel-specific
  hotelName?: string;
  hotelCity?: string;
  hotelNights?: number;
  hotelRooms?: number;
  hotelAdults?: number;
  // Flight-specific
  flightAirline?: string;
  flightNumber?: string;
  flightFrom?: string;
  flightTo?: string;
  flightDeparture?: string;
  flightArrival?: string;
  flightDuration?: string;
  // Bus-specific
  busOperator?: string;
  busType?: string;
  busFrom?: string;
  busTo?: string;
  busBoardingPoint?: string;
  busDroppingPoint?: string;
  busDeparture?: string;
  busArrival?: string;
}

export interface StoredInvoice extends InvoiceData {
  invoiceNumber: string;
  generatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANY = {
  name:    APP_NAME,
  tagline: "Your Ultimate Travel Companion",
  brand:   APP_NAME,
  phone:   APP_SUPPORT_PHONE,
  email:   APP_SUPPORT_EMAIL,
  website: "www.dreamflyglobal.in",
  gst:     "GSTIN: Applied For",
  address: "India",
};

const LS_KEY = "ww_invoices";

// ─── Storage helpers ─────────────────────────────────────────────────────────

export function getStoredInvoices(): StoredInvoice[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function storeInvoice(inv: StoredInvoice) {
  const list = getStoredInvoices();
  const exists = list.findIndex((i) => i.bookingId === inv.bookingId);
  if (exists >= 0) {
    list[exists] = inv;
  } else {
    list.unshift(inv);
  }
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

/**
 * Derive a professional invoice number from a booking reference.
 *
 * New sequential IDs:
 *   FLT-BK-000001  → FLT-INV-000001
 *   BUS-BK-000042  → BUS-INV-000042
 *   HTL-BK-000003  → HTL-INV-000003
 *   HLD-BK-000001  → HLD-INV-000001
 *
 * Legacy sequential IDs (backward-compat):
 *   FLY00001  → DFG-FLY-INV-00001
 *
 * Legacy random IDs (backward-compat):
 *   BK-M0TSAIDR + bookingType "bus" → BUS-INV-M0TSAIDR
 *   BK-M0TSAIDR (no type)           → DFG-INV-M0TSAIDR
 *
 * @param bookingId    The booking reference string.
 * @param bookingType  Optional booking type used to choose a better prefix for legacy IDs.
 */
export function invoiceNumber(bookingId: string, bookingType?: string): string {
  // New format: FLT-BK-000001 → FLT-INV-000001
  const newFmt = bookingId.match(/^(FLT|BUS|HTL|HLD|ACT|VISA|INS|CAR)-BK-(\d+)$/i);
  if (newFmt) {
    return `${newFmt[1].toUpperCase()}-INV-${newFmt[2]}`;
  }
  // New FLY variant: FLY-BK-000001 → FLY-INV-000001
  const flyFmt = bookingId.match(/^FLY-BK-(\d+)$/i);
  if (flyFmt) {
    return `FLY-INV-${flyFmt[1]}`;
  }
  // Legacy sequential: FLY00001 → DFG-FLY-INV-00001
  const legacyFmt = bookingId.match(/^(FLY|BUS|HOT|HOL|ACT|VISA|INS|CAR)(\d+)$/i);
  if (legacyFmt) {
    return `DFG-${legacyFmt[1].toUpperCase()}-INV-${legacyFmt[2]}`;
  }
  // For all other formats, use booking type prefix if available
  const stripped = bookingId.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-8);
  const typePrefix = bookingType
    ? (({ flight: "FLT", bus: "BUS", hotel: "HTL", package: "HLD" } as Record<string, string>)[bookingType] ?? "DFG")
    : "DFG";
  return `${typePrefix}-INV-${stripped}`;
}

// ─── Colour palette ───────────────────────────────────────────────────────────

const C = {
  primary:    [249, 115, 22]  as [number, number, number],  // orange-500
  dark:       [15,  23,  42]  as [number, number, number],  // slate-900
  mid:        [71,  85,  105] as [number, number, number],  // slate-600
  light:      [148, 163, 184] as [number, number, number],  // slate-400
  bg:         [248, 250, 252] as [number, number, number],  // slate-50
  white:      [255, 255, 255] as [number, number, number],
  green:      [22,  163, 74]  as [number, number, number],  // green-600
  divider:    [226, 232, 240] as [number, number, number],  // slate-200
};

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Converts any logo URL (data URL, absolute URL, or /uploads/ path) into a
 * base64 data URL suitable for jsPDF addImage. Returns null on failure.
 */
async function resolveLogoDataUrl(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  // Already a data URL — use directly
  if (logoUrl.startsWith("data:")) return logoUrl;
  // URL or path — fetch and convert to base64
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateInvoicePDF(data: InvoiceData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const invNum = invoiceNumber(data.bookingId, data.bookingType);
  const generatedAt = new Date().toISOString();

  // ── Sanitize title: fix !' corruption, letter-by-letter spacing, reformat routes ──
  const cleanTitle = sanitizeBookingTitle(data.title) || data.title;

  // ── Store for admin ──────────────────────────────────────────────────────
  storeInvoice({ ...data, title: cleanTitle, invoiceNumber: invNum, generatedAt });

  // ── Resolve logo to a data URL (fetch from URL if necessary) ─────────────
  const logoDataUrl = await resolveLogoDataUrl(data.logoDataUrl);

  // ── Header strip ─────────────────────────────────────────────────────────
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, W, 42, "F");

  // Logo: use uploaded branding logo if resolved, else fall back to initials circle
  if (logoDataUrl) {
    try {
      const mimeMatch = logoDataUrl.match(/^data:image\/(\w+);/);
      const fmt = mimeMatch ? mimeMatch[1].toUpperCase() : "PNG";
      doc.addImage(logoDataUrl, fmt === "JPG" ? "JPEG" : fmt, 10, 7, 22, 22);
    } catch {
      doc.setFillColor(...C.primary);
      doc.circle(22, 18, 9, "F");
      doc.setTextColor(...C.white);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(APP_INITIALS, 22, 21, { align: "center" });
    }
  } else {
    doc.setFillColor(...C.primary);
    doc.circle(22, 18, 9, "F");
    doc.setTextColor(...C.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(APP_INITIALS, 22, 21, { align: "center" });
  }

  // Company name
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.white);
  doc.text(COMPANY.name, 36, 17);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.light);
  doc.text(COMPANY.tagline, 36, 23);
  doc.text(`${COMPANY.phone}  |  ${COMPANY.email}`, 36, 29);
  doc.text(`${COMPANY.brand}  |  ${COMPANY.address}`, 36, 34);

  // "TAX INVOICE" label on right
  doc.setFillColor(...C.primary);
  doc.roundedRect(140, 8, 55, 14, 2, 2, "F");
  doc.setTextColor(...C.white);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", 167.5, 17, { align: "center" });

  // ── Invoice meta bar ──────────────────────────────────────────────────────
  doc.setFillColor(...C.bg);
  doc.rect(0, 42, W, 28, "F");

  const leftX = 14;
  const col2 = 85, col3 = 152;
  const metaY = 52;

  doc.setTextColor(...C.mid);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("INVOICE NUMBER", leftX, metaY - 5);
  doc.text("BOOKING ID", col2, metaY - 5);
  doc.text("INVOICE DATE", col3, metaY - 5);

  // Highlight boxes for Booking ID and Invoice Number
  doc.setFillColor(...C.primary);
  doc.roundedRect(leftX - 1, metaY - 1, 65, 9, 1.5, 1.5, "F");
  doc.setTextColor(...C.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(invNum, leftX + 2, metaY + 5.5);

  doc.setFillColor(30, 64, 175); // blue-800
  doc.roundedRect(col2 - 1, metaY - 1, 55, 9, 1.5, 1.5, "F");
  doc.setTextColor(...C.white);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(data.bookingId, col2 + 2, metaY + 5.5);

  doc.setTextColor(...C.dark);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(new Date(generatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), col3, metaY + 5);

  // Divider
  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.3);
  doc.line(0, 70, W, 70);

  // ── Two-column: Bill To + Service Details ────────────────────────────────
  let y = 80;

  // Bill To
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.primary);
  doc.text("BILL TO", leftX, y - 4);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.dark);
  doc.text(data.passengerName, leftX, y + 1);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.mid);
  doc.text(data.passengerEmail, leftX, y + 7);
  doc.text(data.passengerPhone, leftX, y + 13);

  // Service info (right column)
  const svcX = 110;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.primary);
  doc.text("SERVICE DETAILS", svcX, y - 4);

  const isHotel  = data.bookingType === "hotel";
  const isFlight = data.bookingType === "flight";
  const isBus    = data.bookingType === "bus";
  const dateStr  = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const svcRows: [string, string][] = [
    ["Service Type", data.bookingType.charAt(0).toUpperCase() + data.bookingType.slice(1)],
  ];

  if (isFlight) {
    const airlineLabel = data.flightAirline
      ? `${data.flightAirline}${data.flightNumber ? ` (${data.flightNumber})` : ""}`
      : cleanTitle.slice(0, 36);
    svcRows.push(["Airline", airlineLabel]);
    if (data.flightFrom && data.flightTo) svcRows.push(["Route", `${sanitizeLocation(data.flightFrom) || data.flightFrom} \u2192 ${sanitizeLocation(data.flightTo) || data.flightTo}`]);
    svcRows.push(["Travel Date", dateStr(data.travelDate)]);
    if (data.flightDeparture) svcRows.push(["Departure", data.flightDeparture]);
    if (data.flightArrival)   svcRows.push(["Arrival",   data.flightArrival]);
    if (data.flightDuration)  svcRows.push(["Duration",  data.flightDuration]);
    if (data.selectedSeats?.length) svcRows.push(["Seats", data.selectedSeats.join(", ")]);
    svcRows.push(["Passengers", String(data.passengers)]);
  } else if (isBus) {
    const opLabel = data.busOperator
      ? `${data.busOperator}${data.busType ? ` (${data.busType})` : ""}`
      : cleanTitle.slice(0, 36);
    svcRows.push(["Operator", opLabel]);
    if (data.busFrom && data.busTo) svcRows.push(["Route", `${sanitizeLocation(data.busFrom) || data.busFrom} \u2192 ${sanitizeLocation(data.busTo) || data.busTo}`]);
    svcRows.push(["Travel Date", dateStr(data.travelDate)]);
    const boardingLabel = data.busBoardingPoint
      ? `${data.busBoardingPoint}${data.busDeparture ? ` @ ${data.busDeparture}` : ""}`
      : undefined;
    if (boardingLabel) svcRows.push(["Boarding", boardingLabel]);
    const droppingLabel = data.busDroppingPoint
      ? `${data.busDroppingPoint}${data.busArrival ? ` @ ${data.busArrival}` : ""}`
      : undefined;
    if (droppingLabel) svcRows.push(["Dropping", droppingLabel]);
    if (data.selectedSeats?.length) svcRows.push(["Seats", data.selectedSeats.join(", ")]);
    svcRows.push(["Passengers", String(data.passengers)]);
  } else if (isHotel) {
    if (data.hotelName) svcRows.push(["Hotel Name", data.hotelName.length > 28 ? data.hotelName.slice(0, 28) + "…" : data.hotelName]);
    if (data.hotelCity) svcRows.push(["City", sanitizeLocation(data.hotelCity) || data.hotelCity]);
    svcRows.push(["Check-in",  dateStr(data.travelDate)]);
    if (data.checkoutDate) svcRows.push(["Check-out", dateStr(data.checkoutDate)]);
    if (data.hotelNights)  svcRows.push(["Nights", String(data.hotelNights)]);
    if (data.roomType)     svcRows.push(["Room Type", data.roomType.toUpperCase()]);
    if (data.hotelRooms)   svcRows.push(["Rooms", String(data.hotelRooms)]);
    const guestLine = data.hotelAdults ? `${data.hotelAdults} Adult${data.hotelAdults > 1 ? "s" : ""}` : undefined;
    if (guestLine)         svcRows.push(["Guests", guestLine]);
  } else {
    svcRows.push(["Description", cleanTitle.length > 36 ? cleanTitle.slice(0, 36) + "…" : cleanTitle]);
    svcRows.push(["Travel Date", dateStr(data.travelDate)]);
    if (data.checkoutDate) svcRows.push(["Checkout Date", dateStr(data.checkoutDate)]);
    if (data.selectedSeats?.length) svcRows.push(["Seats", data.selectedSeats.join(", ")]);
  }

  svcRows.forEach(([label, val], i) => {
    const rowY = y + 1 + i * 6.5;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.mid);
    doc.text(label + ":", svcX, rowY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.dark);
    doc.text(val, svcX + 32, rowY);
  });

  const svcBlockHeight = Math.max(34, svcRows.length * 6.5 + 4);
  y += svcBlockHeight;

  // ── Item table ────────────────────────────────────────────────────────────
  y += 10;

  // Table header
  doc.setFillColor(...C.dark);
  doc.rect(leftX, y, W - 28, 9, "F");

  const cols = { desc: leftX + 3, qty: 120, rate: 150, amt: 175 };
  doc.setTextColor(...C.white);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("Description", cols.desc, y + 5.5);
  doc.text("Qty", cols.qty, y + 5.5, { align: "center" });
  doc.text("Rate", cols.rate, y + 5.5, { align: "center" });
  doc.text("Amount", cols.amt, y + 5.5, { align: "center" });

  y += 9;

  // Single item row
  const isHotelItem = data.bookingType === "hotel";
  const itemQty  = isHotelItem ? (data.hotelNights || 1) : (data.passengers || 1);
  const itemRate = Math.round(data.totalAmount / itemQty);
  const itemQtyLabel = isHotelItem
    ? `${itemQty} Night${itemQty > 1 ? "s" : ""}`
    : String(itemQty);

  doc.setFillColor(255, 255, 255);
  doc.rect(leftX, y, W - 28, 10, "F");
  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.2);
  doc.rect(leftX, y, W - 28, 10);

  doc.setTextColor(...C.dark);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");

  // Build a clean "Type – Operator – From → To" description line
  let descFull: string;
  if (isHotelItem) {
    descFull = `Hotel – ${data.hotelName || cleanTitle}${data.roomType ? " · " + data.roomType : ""}`;
  } else if (isBus) {
    const busRoute = data.busFrom && data.busTo
      ? `${sanitizeLocation(data.busFrom)} \u2192 ${sanitizeLocation(data.busTo)}`
      : cleanTitle;
    const busOp = data.busOperator ? ` – ${data.busOperator}` : "";
    descFull = `Bus${busOp} – ${busRoute}`;
  } else if (isFlight) {
    const flightRoute = data.flightFrom && data.flightTo
      ? `${sanitizeLocation(data.flightFrom)} \u2192 ${sanitizeLocation(data.flightTo)}`
      : cleanTitle;
    const airline = data.flightAirline
      ? ` – ${data.flightAirline}${data.flightNumber ? " " + data.flightNumber : ""}`
      : "";
    descFull = `Flight${airline} – ${flightRoute}`;
  } else {
    descFull = `${data.bookingType.charAt(0).toUpperCase() + data.bookingType.slice(1)} – ${cleanTitle}`;
  }
  doc.text(descFull.length > 52 ? descFull.slice(0, 52) + "…" : descFull, cols.desc, y + 6.5);

  doc.setFont("helvetica", "bold");
  doc.text(itemQtyLabel, cols.qty, y + 6.5, { align: "center" });
  doc.text(`Rs. ${itemRate.toLocaleString("en-IN")}`, cols.rate, y + 6.5, { align: "center" });
  doc.text(`Rs. ${data.totalAmount.toLocaleString("en-IN")}`, cols.amt, y + 6.5, { align: "center" });

  y += 10;

  // Convenience fee row (if any — show Rs 0 for clarity)
  doc.setFillColor(...C.bg);
  doc.rect(leftX, y, W - 28, 8, "F");
  doc.setDrawColor(...C.divider);
  doc.rect(leftX, y, W - 28, 8);

  doc.setTextColor(...C.mid);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Convenience Fee (non-refundable)", cols.desc, y + 5.2);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.dark);
  doc.text("1", cols.qty, y + 5.2, { align: "center" });
  doc.text("Included", cols.rate, y + 5.2, { align: "center" });
  doc.text("Included", cols.amt, y + 5.2, { align: "center" });

  y += 8;

  // ── Totals block ──────────────────────────────────────────────────────────
  const totX = 120;
  y += 4;

  const totRows: [string, string, boolean][] = [
    ["Subtotal",       `Rs. ${data.totalAmount.toLocaleString("en-IN")}`, false],
    ["Taxes & Fees",   "Included",                                        false],
    ["Total Paid",     `Rs. ${data.totalAmount.toLocaleString("en-IN")}`, true],
  ];

  totRows.forEach(([label, val, isBold]) => {
    doc.setDrawColor(...C.divider);
    doc.setLineWidth(0.2);
    doc.line(totX, y, W - 14, y);
    y += 7;
    doc.setFontSize(isBold ? 10 : 8.5);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setTextColor(isBold ? C.primary[0] : C.mid[0], isBold ? C.primary[1] : C.mid[1], isBold ? C.primary[2] : C.mid[2]);
    doc.text(label, totX + 2, y - 1);
    doc.setTextColor(isBold ? C.primary[0] : C.dark[0], isBold ? C.primary[1] : C.dark[1], isBold ? C.primary[2] : C.dark[2]);
    doc.text(val, W - 16, y - 1, { align: "right" });
  });

  // ── Payment confirmed badge ───────────────────────────────────────────────
  y += 8;
  doc.setFillColor(220, 252, 231);
  doc.roundedRect(leftX, y, 80, 12, 2, 2, "F");
  doc.setFillColor(...C.green);
  doc.circle(leftX + 7, y + 6, 3.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("✓", leftX + 7, y + 7.5, { align: "center" });
  doc.setTextColor(22, 101, 52);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("PAYMENT CONFIRMED", leftX + 13, y + 4.5);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.green);
  doc.text(`Payment ID: ${data.paymentId}`, leftX + 13, y + 9.5);

  // ── Important notes ───────────────────────────────────────────────────────
  y += 22;
  doc.setFillColor(...C.bg);
  doc.roundedRect(leftX, y, W - 28, 30, 2, 2, "F");

  doc.setTextColor(...C.primary);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("IMPORTANT INFORMATION", leftX + 4, y + 7);

  const notes = [
    "Please carry a valid government-issued photo ID during your journey.",
    "Check-in opens 2 hours before departure for flights.",
    `For cancellations or changes, contact us at ${COMPANY.phone}`,
    `This is a ${APP_NAME} branded invoice. Provider details are not disclosed.`,
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.mid);
  notes.forEach((note, i) => {
    doc.text(`• ${note}`, leftX + 4, y + 14 + i * 5);
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.dark);
  doc.rect(0, 272, W, 25, "F");

  doc.setTextColor(...C.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Thank you for choosing ${APP_NAME}!`, W / 2, 280, { align: "center" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.light);
  doc.text(`${COMPANY.phone}  |  ${COMPANY.email}  |  ${COMPANY.website}`, W / 2, 285.5, { align: "center" });
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}  |  ${COMPANY.gst}`, W / 2, 290.5, { align: "center" });

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`${APP_NAME}-Invoice-${data.bookingId}.pdf`);
}

// ─── WhatsApp helper ──────────────────────────────────────────────────────────

export function openWhatsAppConfirmation(data: InvoiceData) {
  const serviceEmoji = { flight: "✈️", hotel: "🏨", bus: "🚌", package: "🌴" }[data.bookingType] ?? "📋";
  const hotelLines = data.bookingType === "hotel"
    ? `*Hotel:* ${data.hotelName || data.title}\n` +
      (data.hotelCity ? `*City:* ${data.hotelCity}\n` : "") +
      `*Check-in:* ${new Date(data.travelDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}\n` +
      (data.checkoutDate ? `*Check-out:* ${new Date(data.checkoutDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}\n` : "") +
      (data.hotelNights ? `*Nights:* ${data.hotelNights}\n` : "") +
      (data.hotelAdults ? `*Guests:* ${data.hotelAdults} Adult${data.hotelAdults > 1 ? "s" : ""}\n` : "") +
      (data.roomType ? `*Room Type:* ${data.roomType}\n` : "")
    : `*Service:* ${data.title}\n` +
      `*Travel Date:* ${new Date(data.travelDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}\n`;
  const message =
    `Hi ${data.passengerName.split(" ")[0]}! ${serviceEmoji}\n\n` +
    `Your booking with *${APP_NAME}* is confirmed! 🎉\n\n` +
    `*Booking ID:* ${data.bookingId}\n` +
    hotelLines +
    `*Amount Paid:* ₹${data.totalAmount.toLocaleString("en-IN")}\n\n` +
    `Your invoice has been generated and can be downloaded from My Bookings on the ${APP_NAME} app.\n\n` +
    `For support: ${COMPANY.phone}\n` +
    `Happy Travels! 🗺️ – Team ${APP_NAME}`;

  window.open(`https://wa.me/${data.passengerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
}

// ─── Mailto helper ────────────────────────────────────────────────────────────

export function openEmailConfirmation(data: InvoiceData) {
  const subject = encodeURIComponent(`Booking Confirmed – ${APP_NAME} | ${data.bookingId}`);
  const body = encodeURIComponent(
    `Dear ${data.passengerName},\n\n` +
    `Your booking with ${APP_NAME} has been confirmed!\n\n` +
    `Booking ID:    ${data.bookingId}\n` +
    (data.bookingType === "hotel"
      ? `Hotel:         ${data.hotelName || data.title}\n` +
        (data.hotelCity ? `City:          ${data.hotelCity}\n` : "") +
        `Check-in:      ${new Date(data.travelDate).toLocaleDateString("en-IN")}\n` +
        (data.checkoutDate ? `Check-out:     ${new Date(data.checkoutDate).toLocaleDateString("en-IN")}\n` : "") +
        (data.hotelNights ? `Nights:        ${data.hotelNights}\n` : "") +
        (data.roomType ? `Room Type:     ${data.roomType}\n` : "") +
        (data.hotelAdults ? `Guests:        ${data.hotelAdults} Adult${data.hotelAdults > 1 ? "s" : ""}\n` : "")
      : `Service:       ${data.title}\n` +
        `Travel Date:   ${new Date(data.travelDate).toLocaleDateString("en-IN")}\n` +
        `Passengers:    ${data.passengers}\n`) +
    `Amount Paid:   ₹${data.totalAmount.toLocaleString("en-IN")}\n` +
    `Payment ID:    ${data.paymentId}\n\n` +
    `Please download your invoice from My Bookings on the ${APP_NAME} platform.\n\n` +
    `For any queries, reach us at:\n` +
    `📞 ${COMPANY.phone}\n` +
    `📧 ${COMPANY.email}\n\n` +
    `Thank you for choosing ${APP_NAME}!\n` +
    `Team ${APP_NAME}`
  );
  window.location.href = `mailto:${data.passengerEmail}?subject=${subject}&body=${body}`;
}
