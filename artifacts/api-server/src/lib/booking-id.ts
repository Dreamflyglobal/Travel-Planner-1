import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Maps booking type → display prefix for sequential IDs.
 */
const TYPE_PREFIX: Record<string, string> = {
  flight:    "FLY",
  bus:       "BUS",
  hotel:     "HOT",
  package:   "HOL",
  holiday:   "HOL",
  activity:  "ACT",
  activities:"ACT",
  visa:      "VISA",
  insurance: "INS",
  car:       "CAR",
  cars:      "CAR",
};

/**
 * Atomically increment the counter for this prefix and return the next
 * sequential booking reference, e.g. "FLY00001", "BUS00042", "HOT00003".
 *
 * Uses INSERT … ON CONFLICT DO UPDATE so the table row is created on first use.
 */
export async function nextBookingRef(bookingType: string): Promise<string> {
  const prefix = TYPE_PREFIX[bookingType.toLowerCase()] ?? "BKG";

  const result = await db.execute(sql`
    INSERT INTO booking_counters (type, counter)
    VALUES (${prefix}, 1)
    ON CONFLICT (type) DO UPDATE
    SET counter = booking_counters.counter + 1
    RETURNING counter
  `);

  const counter = Number((result.rows[0] as { counter: number }).counter);
  const padded  = String(counter).padStart(5, "0");
  return `${prefix}${padded}`;
}

/**
 * Derive a professional invoice number from a booking reference.
 *
 * New IDs:  FLY00001  → DFG-FLY-INV-00001
 *           BUS00042  → DFG-BUS-INV-00042
 *           HOT00003  → DFG-HOT-INV-00003
 * Legacy:   BK-M0TSAIDR → DFG-INV-M0TSAIDR   (backward compat)
 */
export function deriveInvoiceNumber(bookingRef: string): string {
  const newFmt = bookingRef.match(/^(FLY|BUS|HOT|HOL|ACT|VISA|INS|CAR)(\d+)$/i);
  if (newFmt) {
    return `DFG-${newFmt[1].toUpperCase()}-INV-${newFmt[2]}`;
  }
  const stripped = bookingRef.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-8);
  return `DFG-INV-${stripped}`;
}

/**
 * Derive a ticket number from a booking reference.
 *
 * New IDs:  FLY00001  → DFG-FLY-TKT-00001
 *           BUS00042  → DFG-BUS-TKT-00042
 * Legacy:   BK-M0TSAIDR → DFG-TKT-M0TSAIDR
 */
export function deriveTicketNumber(bookingRef: string): string {
  const newFmt = bookingRef.match(/^(FLY|BUS|HOT|HOL|ACT|VISA|INS|CAR)(\d+)$/i);
  if (newFmt) {
    return `DFG-${newFmt[1].toUpperCase()}-TKT-${newFmt[2]}`;
  }
  const stripped = bookingRef.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-8);
  return `DFG-TKT-${stripped}`;
}
