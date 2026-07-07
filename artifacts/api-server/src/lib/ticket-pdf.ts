import { APP_NAME, APP_TAGLINE } from "./app-config.js";
import PDFDocument from "pdfkit";
import { sanitizeLocation } from "./location-utils.js";

export interface FlightTicketData {
  bookingId:     string;
  passengerName: string;
  passengerEmail:string;
  airline:       string;
  flightNum:     string;
  from:          string;
  to:            string;
  departure:     string;
  arrival:       string;
  duration:      string;
  date:          string;
  amount:        number;
  passengers:    number;
  paymentId?:    string;
  class?:        string;
  pnr?:          string;
  ticketNumbers?: string[];
  tjPassengers?:  Array<{ name: string; pnr: string; ticketNum: string; paxType: string }>;
}

const BLUE    = "#1E40AF";
const LIGHT   = "#EFF6FF";
const ACCENT  = "#F97316";
const GRAY    = "#64748B";
const BORDER  = "#CBD5E1";
const WHITE   = "#FFFFFF";

function hr(doc: PDFKit.PDFDocument, y: number) {
  doc
    .moveTo(50, y)
    .lineTo(545, y)
    .strokeColor(BORDER)
    .lineWidth(0.5)
    .stroke();
}

function labelValue(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string, accentValue = false) {
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(GRAY)
    .text(label.toUpperCase(), x, y);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(accentValue ? ACCENT : "#1E293B")
    .text(value, x, y + 13);
}

/**
 * Choose font size for a city name to ensure it fits in the route hero section.
 * PDFKit Helvetica-Bold: ~0.6× ratio means a 36pt char is ~21.6pt wide.
 * Available width per city = 165pt.
 */
function cityFontSize(city: string): number {
  const len = city.length;
  if (len <= 6)  return 34;
  if (len <= 8)  return 30;
  if (len <= 11) return 24;
  if (len <= 14) return 20;
  return 16;
}

export function generateFlightTicketPDF(ticket: FlightTicketData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];

    doc.on("data",  (c) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Sanitize route strings — strips encoding artifacts, IATA codes, normalises case
    const fromCity = sanitizeLocation(ticket.from) || ticket.from;
    const toCity   = sanitizeLocation(ticket.to)   || ticket.to;

    const W = 595;
    const margin = 50;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 90).fill(BLUE);

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(WHITE)
      .text(APP_NAME, margin, 24);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#93C5FD")
      .text("Explore the world", margin, 50);

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(WHITE)
      .text("FLIGHT TICKET", W - 160, 24, { width: 110, align: "right" });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#93C5FD")
      .text(`Booking ID: ${ticket.bookingId}`, W - 180, 44, { width: 130, align: "right" });

    // ── Route hero ──────────────────────────────────────────────────────────
    doc.rect(0, 90, W, 110).fill(LIGHT);

    const routeY = 108;
    const col1 = margin;
    const col3 = W - margin - 165;   // right-column start so text fits in 165pt

    const fromFs = cityFontSize(fromCity);
    const toFs   = cityFontSize(toCity);

    // Vertically center smaller fonts in the 44pt tall zone
    const fromY = routeY + Math.max(0, Math.round((34 - fromFs) * 0.4));
    const toY   = routeY + Math.max(0, Math.round((34 - toFs)   * 0.4));

    // FROM — use sanitized city name, no line-break to prevent word-wrapping
    doc
      .font("Helvetica-Bold")
      .fontSize(fromFs)
      .fillColor(BLUE)
      .text(fromCity, col1, fromY, { width: 165, lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(GRAY)
      .text("ORIGIN", col1, routeY + 46);
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#1E293B")
      .text(ticket.departure, col1, routeY + 59);

    // Arrow + duration (drawn as lines — no Unicode issues)
    const midX = W / 2 - 50;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(GRAY)
      .text(ticket.duration, midX, routeY + 16, { width: 100, align: "center" });
    doc
      .moveTo(midX, routeY + 32)
      .lineTo(midX + 100, routeY + 32)
      .strokeColor(BLUE)
      .lineWidth(1.5)
      .stroke();
    // Arrow head
    doc
      .moveTo(midX + 90, routeY + 27)
      .lineTo(midX + 100, routeY + 32)
      .lineTo(midX + 90, routeY + 37)
      .strokeColor(BLUE)
      .lineWidth(1.5)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(GRAY)
      .text("NON-STOP", midX, routeY + 40, { width: 100, align: "center" });

    // TO — use sanitized city name, right-aligned
    doc
      .font("Helvetica-Bold")
      .fontSize(toFs)
      .fillColor(BLUE)
      .text(toCity, col3, toY, { width: 165, align: "right", lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(GRAY)
      .text("DESTINATION", col3, routeY + 46, { width: 165, align: "right" });
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#1E293B")
      .text(ticket.arrival, col3, routeY + 59, { width: 165, align: "right" });

    // ── Passenger info ──────────────────────────────────────────────────────
    let y = 222;
    doc.rect(0, 200, W, 2).fill(ACCENT);

    y = 220;
    hr(doc, y + 60);

    const cols = [margin, 200, 360, 460];

    labelValue(doc, cols[0], y + 8,  "Passenger",      ticket.passengerName);
    labelValue(doc, cols[1], y + 8,  "Date",           ticket.date);
    labelValue(doc, cols[2], y + 8,  "Class",          ticket.class || "Economy");
    labelValue(doc, cols[3], y + 8,  "Pax",            String(ticket.passengers));

    y += 68;
    hr(doc, y + 60);

    labelValue(doc, cols[0], y + 8,  "Airline",        ticket.airline);
    labelValue(doc, cols[1], y + 8,  "Flight No.",     ticket.flightNum);
    labelValue(doc, cols[2], y + 8,  "Duration",       ticket.duration);
    labelValue(doc, cols[3], y + 8,  "Amount", `\u20B9${ticket.amount.toLocaleString("en-IN")}`, true);

    // ── PNR / Ticket Numbers ───────────────────────────────────────────────
    if (ticket.pnr || (ticket.ticketNumbers && ticket.ticketNumbers.length > 0)) {
      y += 68;
      hr(doc, y + 60);
      if (ticket.pnr) {
        labelValue(doc, cols[0], y + 8, "PNR", ticket.pnr, true);
      }
      if (ticket.ticketNumbers && ticket.ticketNumbers.length > 0) {
        labelValue(doc, cols[2], y + 8, "Ticket No.", ticket.ticketNumbers[0]);
      }
    }

    // ── Per-passenger details (if multiple passengers have ticket numbers) ─
    if (ticket.tjPassengers && ticket.tjPassengers.length > 0) {
      y += 68;
      hr(doc, y + 60);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748B")
        .text("PASSENGER DETAILS".toUpperCase(), cols[0], y + 8);
      y += 22;
      ticket.tjPassengers.forEach((pax, idx) => {
        const rowY = y + idx * 22;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#1E293B")
          .text(pax.name, cols[0], rowY, { width: 150 });
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#64748B")
          .text(pax.paxType, cols[1], rowY);
        if (pax.pnr) {
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#F97316")
            .text(`PNR: ${pax.pnr}`, cols[2], rowY, { width: 90 });
        }
        if (pax.ticketNum) {
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#64748B")
            .text(pax.ticketNum, cols[3], rowY, { width: 85 });
        }
      });
      y += Math.max(ticket.tjPassengers.length * 22, 22);
    }

    // ── Email ──────────────────────────────────────────────────────────────
    y += 68;
    hr(doc, y + 60);
    labelValue(doc, cols[0], y + 8, "Passenger Email", ticket.passengerEmail);
    if (ticket.paymentId) {
      labelValue(doc, cols[2], y + 8, "Payment Ref", ticket.paymentId);
    }

    // ── Barcode-style box ──────────────────────────────────────────────────
    y += 90;
    const barcodeY = y;
    // Dashed cut line
    doc
      .moveTo(margin, barcodeY)
      .lineTo(W - margin, barcodeY)
      .dash(4, { space: 4 })
      .strokeColor(BORDER)
      .lineWidth(0.8)
      .stroke()
      .undash();

    // Barcode-like stripes (decorative)
    const stripeX = W - 180;
    for (let i = 0; i < 40; i++) {
      const w = i % 3 === 0 ? 4 : 2;
      doc.rect(stripeX + i * 3.5, barcodeY + 16, w, 50).fill(i % 5 === 0 ? "#1E293B" : GRAY);
    }

    doc
      .font("Courier")
      .fontSize(8)
      .fillColor("#1E293B")
      .text(ticket.bookingId, stripeX, barcodeY + 72, { width: 140, align: "center" });

    // Stub text — use ASCII-safe "to" separator (PDFKit standard fonts don't support →)
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(BLUE)
      .text("BOARDING PASS", margin, barcodeY + 20);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(GRAY)
      .text(`${fromCity}  to  ${toCity}   |   ${ticket.departure}`, margin, barcodeY + 40);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#1E293B")
      .text(ticket.passengerName, margin, barcodeY + 58);

    // ── Footer ─────────────────────────────────────────────────────────────
    const footerY = 760;
    doc.rect(0, footerY, W, 82).fill(BLUE);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#93C5FD")
      .text(
        `This is an electronically generated ticket. Please carry a valid photo ID at the airport. ` +
        `Check-in closes 45 minutes before departure for domestic flights. ` +
        `For assistance contact ${APP_NAME} Support.`,
        margin,
        footerY + 16,
        { width: W - margin * 2, align: "center" }
      );
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(WHITE)
      .text(`${APP_NAME} — ${APP_TAGLINE}`, margin, footerY + 52, { width: W - margin * 2, align: "center" });

    doc.end();
  });
}
