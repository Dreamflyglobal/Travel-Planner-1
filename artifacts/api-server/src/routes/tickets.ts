import { Router } from "express";
import { generateFlightTicketPDF, type FlightTicketData } from "../lib/ticket-pdf.js";
import { sendBookingConfirmationEmail } from "../lib/email-service.js";

const router = Router();

/**
 * POST /api/tickets/generate
 * Accepts booking details, returns a PDF file as a download.
 */
router.post("/generate", async (req, res) => {
  try {
    const ticket: FlightTicketData = req.body;

    if (!ticket.bookingId || !ticket.from || !ticket.to) {
      return res.status(400).json({ error: "Missing required ticket fields" });
    }

    const pdfBuffer = await generateFlightTicketPDF(ticket);

    res.set({
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="Dream Fly Global-Ticket-${ticket.bookingId}.pdf"`,
      "Content-Length":      pdfBuffer.length,
    });

    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("ticket/generate error:", err);
    res.status(500).json({ error: err.message || "Failed to generate ticket" });
  }
});

/**
 * POST /api/tickets/send-email
 * Generates the PDF and emails it to the passenger.
 * Returns JSON with { success, emailSent, reason? }.
 */
router.post("/send-email", async (req, res) => {
  try {
    const ticket: FlightTicketData = req.body;

    if (!ticket.bookingId || !ticket.passengerEmail) {
      return res.status(400).json({ error: "Missing bookingId or passengerEmail" });
    }

    const pdfBuffer = await generateFlightTicketPDF(ticket);
    const { sent, reason } = await sendBookingConfirmationEmail(ticket, pdfBuffer);

    res.json({ success: true, emailSent: sent, reason });
  } catch (err: any) {
    console.error("ticket/send-email error:", err);
    res.status(500).json({ error: err.message || "Failed to send email" });
  }
});

export default router;
