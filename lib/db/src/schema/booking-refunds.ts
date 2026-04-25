import {
  pgTable,
  serial,
  integer,
  varchar,
  numeric,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Tracks every refund initiated by an admin against a booking.
 * Additive table — does NOT modify the existing `bookings` table.
 *
 * status:
 *   - "processing" → request accepted by Razorpay (or queued)
 *   - "completed"  → refund settled
 *   - "failed"     → Razorpay returned an error or call threw
 */
export const bookingRefundsTable = pgTable("booking_refunds", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  paymentId: varchar("payment_id", { length: 191 }).notNull(),
  refundId: varchar("refund_id", { length: 191 }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  status: varchar("status", { length: 32 }).notNull().default("processing"),
  errorMessage: text("error_message"),
  initiatedBy: varchar("initiated_by", { length: 191 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookingRefund = typeof bookingRefundsTable.$inferSelect;
export type NewBookingRefund = typeof bookingRefundsTable.$inferInsert;
