import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Maps booking type → display prefix for sequential IDs.
 */
const TYPE_PREFIX: Record<string, string> = {
  flight:    "FLT",
  bus:       "BUS",
  hotel:     "HTL",
  package:   "HLD",
  holiday:   "HLD",
  activity:  "ACT",
  activities:"ACT",
  visa:      "VISA",
  insurance: "INS",
  car:       "CAR",
  cars:      "CAR",
};

/**
 * Atomically increment the counter for this prefix and return the next
 * sequential booking reference, e.g. "FLT-BK-000001", "BUS-BK-000042", "HTL-BK-000003".
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
  const padded  = String(counter).padStart(6, "0");
  return `${prefix}-BK-${padded}`;
}

/**
 * Derive a professional invoice number from a booking reference.
 *
 * New IDs:  FLT-BK-000001  → FLT-INV-000001
 *           BUS-BK-000042  → BUS-INV-000042
 *           HTL-BK-000003  → HTL-INV-000003
 *           HLD-BK-000001  → HLD-INV-000001
 * Legacy:   FLY00001       → DFG-FLY-INV-00001   (backward compat)
 *           BK-M0TSAIDR    → DFG-INV-M0TSAIDR    (backward compat)
 */
export function deriveInvoiceNumber(bookingRef: string): string {
  // New format: FLT-BK-000001 → FLT-INV-000001
  const newFmt = bookingRef.match(/^(FLT|BUS|HTL|HLD|ACT|VISA|INS|CAR)-BK-(\d+)$/i);
  if (newFmt) {
    return `${newFmt[1].toUpperCase()}-INV-${newFmt[2]}`;
  }
  // Legacy format: FLY00001 → DFG-FLY-INV-00001
  const legacyFmt = bookingRef.match(/^(FLY|BUS|HOT|HOL|ACT|VISA|INS|CAR)(\d+)$/i);
  if (legacyFmt) {
    return `DFG-${legacyFmt[1].toUpperCase()}-INV-${legacyFmt[2]}`;
  }
  const stripped = bookingRef.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-8);
  return `DFG-INV-${stripped}`;
}

/**
 * Derive a ticket number from a booking reference.
 *
 * New IDs:  FLT-BK-000001  → FLT-TKT-000001
 *           BUS-BK-000042  → BUS-TKT-000042
 * Legacy:   FLY00001       → DFG-FLY-TKT-00001
 *           BK-M0TSAIDR    → DFG-TKT-M0TSAIDR
 */
export function deriveTicketNumber(bookingRef: string): string {
  // New format: FLT-BK-000001 → FLT-TKT-000001
  const newFmt = bookingRef.match(/^(FLT|BUS|HTL|HLD|ACT|VISA|INS|CAR)-BK-(\d+)$/i);
  if (newFmt) {
    return `${newFmt[1].toUpperCase()}-TKT-${newFmt[2]}`;
  }
  // Legacy format: FLY00001 → DFG-FLY-TKT-00001
  const legacyFmt = bookingRef.match(/^(FLY|BUS|HOT|HOL|ACT|VISA|INS|CAR)(\d+)$/i);
  if (legacyFmt) {
    return `DFG-${legacyFmt[1].toUpperCase()}-TKT-${legacyFmt[2]}`;
  }
  const stripped = bookingRef.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-8);
  return `DFG-TKT-${stripped}`;
}
