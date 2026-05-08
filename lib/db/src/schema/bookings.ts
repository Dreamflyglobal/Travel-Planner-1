import {
  pgTable,
  text,
  serial,
  integer,
  numeric,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { number } from "zod";
import { z } from "zod/v4";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  bookingRef: text("booking_ref"),
  userId: text("user_id"),
  bookingType: text("booking_type").notNull(),
  title: text("title"),
  referenceId: integer("reference_id").notNull().default(0),
  status: text("status").notNull().default("confirmed"),
  passengerName: text("passenger_name").notNull(),
  passengerEmail: text("passenger_email").notNull(),
  passengerPhone: text("passenger_phone"),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  passengers: integer("passengers").notNull().default(1),
  travelDate: text("travel_date").notNull(),
  details: jsonb("details"),
  // Agent fields — set when booked by a B2B agent
  agentId: text("agent_id"),         // agent's localStorage id (e.g. "agent_1234")
  agentCode: text("agent_code"),     // human-readable agent code (e.g. "AGXYZ123")
  agentEmail: text("agent_email"),   // agent's email for lookups
  commissionEarned: numeric("commission_earned", { precision: 10, scale: 2 }), // ₹ earned
  // Payment fields
  paymentMethod: text("payment_method"), // card, upi, wallet, emi
  paymentStatus: text("payment_status").notNull().default("pending"), // pending, paid, failed
  paymentId: text("payment_id"), // Razorpay payment ID
  razorpayOrderId: text("razorpay_order_id"), // Razorpay order ID
  razorpaySignature: text("razorpay_signature"), // Payment verification signature
  emiDetails: jsonb("emi_details"), // EMI tenure, monthly amount, etc.
  // Booking lifecycle tracking (separate from payment)
  bookingStatus: text("booking_status").notNull().default("confirmed"),
  // pending | processing | confirmed | failed
  failureReason: text("failure_reason"), // human-readable: "API failure", "PNR not generated", "Seat unavailable", "Booking timeout"
  failureCode: text("failure_code"), // short code: api_error | pnr_not_generated | seat_unavailable | timeout | payment_failed
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
