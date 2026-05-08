import { APP_NAME, APP_TAGLINE } from "./app-config.js";
import PDFDocument from "pdfkit";
import { sanitizeLocation, formatRoutePdfSafe } from "./location-utils.js";

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

    const routeY = 110;
    const col1 = margin;
    const col3 = W - margin - 80;

    // FROM — use sanitized city name
    doc.font("Helvetica-Bold").fontSize(36).fillColor(BLUE).text(fromCity, col1, routeY, { width: 140 });
    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("ORIGIN", col1, routeY + 42);

    // departure time
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1E293B").text(ticket.departure, col1, routeY + 56);

    // Arrow + duration (drawn as lines — no Unicode issues)
    const midX = W / 2 - 50;
    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text(ticket.duration, midX, routeY + 14, { width: 100, align: "center" });
    doc
      .moveTo(midX, routeY + 30)
      .lineTo(midX + 100, routeY + 30)
      .strokeColor(BLUE)
      .lineWidth(1.5)
      .stroke();
    // Arrow head
    doc
      .moveTo(midX + 90, routeY + 25)
      .lineTo(midX + 100, routeY + 30)
      .lineTo(midX + 90, routeY + 35)
      .strokeColor(BLUE)
      .lineWidth(1.5)
      .stroke();

    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("NON-STOP", midX, routeY + 38, { width: 100, align: "center" });

    // TO — use sanitized city name
    doc.font("Helvetica-Bold").fontSize(36).fillColor(BLUE).text(toCity, col3, routeY, { width: 140, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("DESTINATION", col3, routeY + 42, { width: 140, align: "right" });
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1E293B").text(ticket.arrival, col3, routeY + 56, { width: 140, align: "right" });

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

    // Stub text — use ASCII-safe route (PDFKit standard fonts don't support →)
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
        "This is an electronically generated ticket. Please carry a valid photo ID at the airport. " +
        "Check-in closes 45 minutes before departure for domestic flights. " +
        "For assistance call ${APP_NAME} Support.",
        margin,
        footerY + 16,
        { width: W - margin * 2, align: "center" }
      );
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(WHITE)
      .text("${APP_NAME} — ${APP_TAGLINE}", margin, footerY + 52, { width: W - margin * 2, align: "center" });

    doc.end();
  });
}
