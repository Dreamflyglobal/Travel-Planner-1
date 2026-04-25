import jsPDF from "jspdf";

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
  name: "Dream Fly Global",
  tagline: "Your Ultimate Travel Companion",
  brand: "DreamFly Global",
  phone: "+91 9000978856",
  email: "support@dreamflyglobal.com",
  website: "www.dreamflyglobal.in",
  gst: "GSTIN: Applied For",
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

function invoiceNumber(bookingId: string) {
  return `WW-INV-${bookingId.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-8)}`;
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

export function generateInvoicePDF(data: InvoiceData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const invNum = invoiceNumber(data.bookingId);
  const generatedAt = new Date().toISOString();

  // ── Store for admin ──────────────────────────────────────────────────────
  storeInvoice({ ...data, invoiceNumber: invNum, generatedAt });

  // ── Header strip ─────────────────────────────────────────────────────────
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, W, 42, "F");

  // Logo circle
  doc.setFillColor(...C.primary);
  doc.circle(22, 18, 9, "F");
  doc.setTextColor(...C.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("WW", 22, 21, { align: "center" });

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
  doc.rect(0, 42, W, 22, "F");

  const leftX = 14;
  const col2 = 80, col3 = 140;
  const metaY = 50;

  doc.setTextColor(...C.mid);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("INVOICE NUMBER", leftX, metaY - 3);
  doc.text("BOOKING ID", col2, metaY - 3);
  doc.text("INVOICE DATE", col3, metaY - 3);

  doc.setTextColor(...C.dark);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(invNum, leftX, metaY + 2);
  doc.text(data.bookingId, col2, metaY + 2);
  doc.text(new Date(generatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), col3, metaY + 2);

  // Divider
  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.3);
  doc.line(0, 64, W, 64);

  // ── Two-column: Bill To + Service Details ────────────────────────────────
  let y = 74;

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
      : data.title.slice(0, 36);
    svcRows.push(["Airline", airlineLabel]);
    if (data.flightFrom && data.flightTo) svcRows.push(["Route", `${data.flightFrom} → ${data.flightTo}`]);
    svcRows.push(["Travel Date", dateStr(data.travelDate)]);
    if (data.flightDeparture) svcRows.push(["Departure", data.flightDeparture]);
    if (data.flightArrival)   svcRows.push(["Arrival",   data.flightArrival]);
    if (data.flightDuration)  svcRows.push(["Duration",  data.flightDuration]);
    if (data.selectedSeats?.length) svcRows.push(["Seats", data.selectedSeats.join(", ")]);
    svcRows.push(["Passengers", String(data.passengers)]);
  } else if (isBus) {
    const opLabel = data.busOperator
      ? `${data.busOperator}${data.busType ? ` (${data.busType})` : ""}`
      : data.title.slice(0, 36);
    svcRows.push(["Operator", opLabel]);
    if (data.busFrom && data.busTo) svcRows.push(["Route", `${data.busFrom} → ${data.busTo}`]);
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
    if (data.hotelCity) svcRows.push(["City", data.hotelCity]);
    svcRows.push(["Check-in",  dateStr(data.travelDate)]);
    if (data.checkoutDate) svcRows.push(["Check-out", dateStr(data.checkoutDate)]);
    if (data.hotelNights)  svcRows.push(["Nights", String(data.hotelNights)]);
    if (data.roomType)     svcRows.push(["Room Type", data.roomType.toUpperCase()]);
    if (data.hotelRooms)   svcRows.push(["Rooms", String(data.hotelRooms)]);
    const guestLine = data.hotelAdults ? `${data.hotelAdults} Adult${data.hotelAdults > 1 ? "s" : ""}` : undefined;
    if (guestLine)         svcRows.push(["Guests", guestLine]);
  } else {
    svcRows.push(["Description", data.title.length > 36 ? data.title.slice(0, 36) + "…" : data.title]);
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
  const descFull = isHotelItem
    ? `Hotel – ${data.hotelName || data.title}${data.roomType ? " · " + data.roomType : ""}`
    : `${data.bookingType.charAt(0).toUpperCase() + data.bookingType.slice(1)} – ${data.title}`;
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
    "For cancellations or changes, contact us at " + COMPANY.phone,
    "This is a Dream Fly Global branded invoice. Provider details are not disclosed.",
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
  doc.text("Thank you for choosing Dream Fly Global!", W / 2, 280, { align: "center" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.light);
  doc.text(`${COMPANY.phone}  |  ${COMPANY.email}  |  ${COMPANY.website}`, W / 2, 285.5, { align: "center" });
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}  |  ${COMPANY.gst}`, W / 2, 290.5, { align: "center" });

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`Dream Fly Global-Invoice-${data.bookingId}.pdf`);
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
    `Your booking with *Dream Fly Global* is confirmed! 🎉\n\n` +
    `*Booking ID:* ${data.bookingId}\n` +
    hotelLines +
    `*Amount Paid:* ₹${data.totalAmount.toLocaleString("en-IN")}\n\n` +
    `Your invoice has been generated and can be downloaded from My Bookings on the Dream Fly Global app.\n\n` +
    `For support: ${COMPANY.phone}\n` +
    `Happy Travels! 🗺️ – Team Dream Fly Global`;

  window.open(`https://wa.me/${data.passengerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
}

// ─── Mailto helper ────────────────────────────────────────────────────────────

export function openEmailConfirmation(data: InvoiceData) {
  const subject = encodeURIComponent(`Booking Confirmed – Dream Fly Global | ${data.bookingId}`);
  const body = encodeURIComponent(
    `Dear ${data.passengerName},\n\n` +
    `Your booking with Dream Fly Global has been confirmed!\n\n` +
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
    `Please download your invoice from My Bookings on the Dream Fly Global platform.\n\n` +
    `For any queries, reach us at:\n` +
    `📞 ${COMPANY.phone}\n` +
    `📧 ${COMPANY.email}\n\n` +
    `Thank you for choosing Dream Fly Global!\n` +
    `Team Dream Fly Global – DreamFly Global`
  );
  window.location.href = `mailto:${data.passengerEmail}?subject=${subject}&body=${body}`;
}
